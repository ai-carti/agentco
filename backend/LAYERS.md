# Backend Architecture: Layered Design

```
HTTP Request
     │
     ▼
┌─────────────┐
│  handlers/  │  ← HTTP слой: парсинг запроса, HTTP-ошибки, сериализация ответа
└──────┬──────┘
       │ вызывает
       ▼
┌─────────────┐
│  services/  │  ← Бизнес-логика: правила, валидация, транзакции
└──────┬──────┘
       │ вызывает
       ▼
┌──────────────────┐
│  repositories/   │  ← Доступ к данным: SQL-запросы, CRUD, joins
└──────┬───────────┘
       │ работает с
       ▼
┌─────────────┐
│   models/   │  ← ORM-модели: таблицы, отношения, типы колонок
└─────────────┘
       │
       ▼
   SQLite DB
```

---

## Правила — СТРОГО ОБЯЗАТЕЛЬНЫ

### 1. handlers/ — только HTTP

**Можно:**
- Принять request body (Pydantic schema)
- Вызвать один метод сервиса
- Вернуть response (Pydantic schema)
- Поймать `NotFoundError` → 404, `ValueError` → 400

**Нельзя:**
- Импортировать модели ORM напрямую
- Делать DB-запросы (session.query / session.get)
- Содержать if/else бизнес-логику
- Создавать объекты моделей

```python
# ✅ правильно
@router.post("/")
def create_company(body: CompanyCreate, session: Session = Depends(get_session)):
    try:
        return CompanyService(session).create(body.name)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

# ❌ неправильно — бизнес-логика в хендлере
@router.post("/")
def create_company(body: CompanyCreate, session: Session = Depends(get_session)):
    if not body.name.strip():          # ← это в service
        raise HTTPException(400, ...)
    company = Company(name=body.name)  # ← это в service/repo
    session.add(company)               # ← это в repo
    session.commit()
    return company
```

---

### 2. services/ — только бизнес-логика

**Можно:**
- Валидировать бизнес-правила (raise ValueError)
- Вызывать несколько репозиториев
- Вызывать другие сервисы
- Управлять транзакцией: `session.commit()` только здесь

**Нельзя:**
- Делать SQL-запросы напрямую (session.execute / session.query)
- Знать про HTTP (нет FastAPI импортов, нет HTTPException)
- Создавать объекты Session внутри

```python
# ✅ правильно
class CompanyService:
    def create(self, name: str) -> Company:
        if not name.strip():                    # бизнес-правило
            raise ValueError("Name is empty")
        company = Company(name=name.strip())
        self._repo.add(company)
        self._session.commit()                  # транзакция здесь
        return company

# ❌ неправильно — SQL в сервисе
class CompanyService:
    def create(self, name: str) -> Company:
        company = Company(name=name)
        self._session.add(company)   # ← это в repo
        self._session.flush()
        return company
```

---

### 3. repositories/ — только доступ к данным

**Можно:**
- CRUD через ORM (get, list, add, delete)
- Сложные SELECT с фильтрами, joins, order_by
- `session.flush()` (без commit — транзакция в сервисе)

**Нельзя:**
- Бизнес-валидация (raise ValueError с бизнес-текстом)
- `session.commit()` — никогда
- Вызывать другие сервисы

```python
# ✅ правильно
class TaskRepository(BaseRepository[Task]):
    def list_by_company(self, company_id: str) -> list[Task]:
        return self.list(company_id=company_id)

# ❌ неправильно — бизнес-логика в репо
class TaskRepository(BaseRepository[Task]):
    def create_task(self, company_id: str, title: str) -> Task:
        if not title:                    # ← это в service
            raise ValueError(...)
        task = Task(...)
        self._session.add(task)
        self._session.commit()           # ← commit только в service
        return task
```

---

### 4. orm/ vs models/ — строгое разделение

**`orm/`** — только SQLAlchemy, только структура таблиц:
- Колонки, типы, default значения, `__tablename__`
- Relationships (`back_populates`)
- Суффикс `ORM` обязателен: `CompanyORM`, `AgentORM`
- **Нельзя:** бизнес-методы, импорты из `models/`, `services/`

**`models/`** — чистые domain модели, никакого SQLAlchemy:
- Только `@dataclass` (или Pydantic BaseModel для сложных случаев)
- Бизнес-типы: `TaskStatus = Literal[...]`
- **Нельзя:** `from sqlalchemy import ...` — вообще никогда
- Эти модели можно тестировать без БД, без FastAPI

```python
# ✅ orm/company.py
class CompanyORM(Base):
    __tablename__ = "companies"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)

# ✅ models/company.py
@dataclass
class Company:
    name: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

# ❌ нельзя — ORM в domain
@dataclass
class Company(Base):  # ← никогда
    __tablename__ = "companies"
```

**Маппинг** ORM ↔ domain живёт **только в repositories** (`_to_domain` / `_to_orm`).

---

### 5. Схемы Pydantic — только в handlers/

- `*Create`, `*Update` — входящий запрос
- `*Out` — исходящий ответ
- Модели ORM **не возвращаются** из хендлеров напрямую
- Всегда `model_config = {"from_attributes": True}` для маппинга ORM → Pydantic

---

### 6. Инъекция зависимостей

```python
# Всегда через Depends — никогда не создавать Session вручную в хендлере
session: Session = Depends(get_session)

# Сервис получает session в конструкторе
CompanyService(session).create(...)
```

---

### 7. Обработка ошибок

| Что упало       | Где ловить    | Что вернуть     |
|-----------------|---------------|-----------------|
| `NotFoundError` | handler       | HTTP 404        |
| `ValueError`    | handler       | HTTP 400        |
| Всё остальное   | не ловить     | FastAPI → 500   |

Не оборачивай `session.commit()` в try/except внутри сервиса — пусть падает наверх.

---

## Структура файлов

```
src/agentco/
├── db/
│   └── session.py          # engine, get_session dependency
├── orm/                     # SQLAlchemy ORM — ТОЛЬКО структура таблиц
│   ├── __init__.py
│   ├── base.py              # DeclarativeBase
│   ├── company.py           # CompanyORM
│   ├── agent.py             # AgentORM
│   ├── task.py              # TaskORM
│   └── run.py               # RunORM
├── models/                  # Domain models — чистые dataclasses, NO SQLAlchemy
│   ├── __init__.py
│   ├── company.py           # Company
│   ├── agent.py             # Agent
│   ├── task.py              # Task
│   └── run.py               # Run
├── repositories/
│   ├── __init__.py
│   ├── base.py              # BaseRepository[T], NotFoundError
│   ├── company.py
│   ├── agent.py
│   ├── task.py
│   └── run.py
├── services/
│   ├── __init__.py
│   ├── company.py
│   ├── agent.py
│   └── task.py
├── handlers/
│   ├── __init__.py          # реэкспорт роутеров
│   ├── companies.py
│   ├── agents.py
│   └── tasks.py
├── llm/
│   └── client.py            # LiteLLM обёртка
├── cli.py
└── main.py                  # FastAPI app + include_router
```

---

## Добавить новый ресурс (чеклист)

1. `models/foo.py` — ORM модель, добавить в `models/__init__.py`
2. `repositories/foo.py` — унаследовать `BaseRepository[Foo]`
3. `services/foo.py` — бизнес-логика, `session.commit()` здесь
4. `handlers/foo.py` — Pydantic схемы + роутер
5. `handlers/__init__.py` — добавить `foo_router`
6. `main.py` — `app.include_router(foo_router)`
7. Alembic миграция — `uv run alembic revision --autogenerate -m "add foo"`
8. Тесты для каждого слоя отдельно
