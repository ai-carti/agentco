# Переключение с SQLite на PostgreSQL

AgentCo по умолчанию использует SQLite. На Railway/production с несколькими воркерами нужен Postgres.

## Почему Postgres?

SQLite теряет данные при pod eviction на Railway (эфемерная файловая система).  
Postgres — persistent, поддерживает multi-worker, горизонтальное масштабирование.

## Шаги

### 1. Установить зависимости Postgres

```bash
# Sync engine (psycopg2 — для миграций, тестов):
uv add "agentco[postgres]"
# или: pip install "agentco[postgres]"

# Async engine (asyncpg — для FastAPI endpoints, ALEX-POST-010):
uv add "agentco[async]"
# или: pip install "agentco[async]"

# Оба вместе (рекомендуется для production):
uv add "agentco[postgres,async]"
```

Это устанавливает `psycopg2-binary` (sync) и `asyncpg` + `sqlalchemy[asyncio]` (async).

### 2. Задать DATABASE_URL

```bash
# Локально (.env):
DATABASE_URL=postgresql://user:password@localhost:5432/agentco

# Railway: добавить переменную окружения в сервисе
DATABASE_URL=postgresql://user:password@host:5432/agentco
```

**Формат URL:**
- `postgresql://` — стандартный (рекомендуется)
- `postgres://` — алиас, тоже работает

### 3. Создать базу данных (если локально)

```bash
createdb agentco
```

### 4. Запустить миграции

```bash
cd backend
DATABASE_URL=postgresql://user:password@localhost:5432/agentco uv run alembic upgrade head
```

### 5. Запустить сервер

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/agentco uv run uvicorn agentco.main:app
```

## Railway: полная инструкция

1. Добавить PostgreSQL сервис в проект: **New** → **Database** → **PostgreSQL**
2. Скопировать `DATABASE_URL` из Railway переменных
3. Добавить `DATABASE_URL` в переменные окружения backend сервиса
4. Удалить (или оставить закомментированным) старый `AGENTCO_DB_URL`
5. Передеплоить

## Как работает определение базы

```python
# backend/src/agentco/db/session.py
DATABASE_URL=os.environ.get("DATABASE_URL") or ...

if url.startswith("postgresql://") or url.startswith("postgres://"):
    engine = create_engine(url)          # Postgres sync (psycopg2)
    # Async engine (ALEX-POST-010):
    async_url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    async_engine = create_async_engine(async_url)  # asyncpg
else:
    engine = create_engine(url, ...)     # SQLite path (WAL + FK pragmas)
```

### Async engine (ALEX-POST-010)

При `DATABASE_URL=postgresql://...` автоматически создаётся async engine:

```python
# В FastAPI endpoint (async):
from agentco.db.session import get_async_session

@router.get("/items")
async def list_items(session: AsyncSession = Depends(get_async_session)):
    result = await session.execute(select(Item))
    return result.scalars().all()

# В sync endpoint или для миграций:
from agentco.db.session import get_session

@router.get("/items")
def list_items_sync(session: Session = Depends(get_session)):
    return session.query(Item).all()
```

## Alembic миграции совместимы

Все миграции используют SQLAlchemy-абстракции (`sa.Text`, `sa.DateTime`, etc.).  
SQLite-специфичные `PRAGMA` гуарданы проверкой `bind.dialect.name == "sqlite"`.

## Откат на SQLite

```bash
# Убрать DATABASE_URL или поставить sqlite:// URL
unset DATABASE_URL
# или
DATABASE_URL=sqlite:///./agentco.db
```

Дополнительные зависимости (`psycopg2-binary`) не мешают работе SQLite.
