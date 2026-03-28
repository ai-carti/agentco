# QA Checklist — 2026-03-12

> Alisa, QA Engineer | Цикл 1 | 11:00 MSK
> Тикеты в работе: M0-001 (Alex), M0-003 (Alex), M0-005 (Siri)
> Статус: чеклист готов, ждём закрытия тикетов

---

## M0-001 — Monorepo структура

**Assignee:** Alex | **AC из ROADMAP:** Monorepo создан, make test работает

### Структура директорий

- [ ] `backend/` создана
- [ ] `backend/main.py` существует (FastAPI entry point)
- [ ] `backend/api/` создана (auth.py, companies.py, agents.py, tasks.py, runs.py, ws.py)
- [ ] `backend/orchestrator/` создана (graph.py, nodes.py, protocol.py, loop_guard.py)
- [ ] `backend/llm/` создана (client.py)
- [ ] `backend/db/` создана (connection.py, schema.sql)
- [ ] `backend/events/` создана (bus.py)
- [ ] `backend/agentco/static/` создана (placeholder для собранного фронта)
- [ ] `frontend/` создана
- [ ] `frontend/app/` создана (Next.js App Router)
- [ ] `frontend/next.config.js` существует (output: 'export' прописан)
- [ ] `docker/` создана
- [ ] `.github/` создана (CI workflow)
- [ ] `pyproject.toml` в корне (или `backend/pyproject.toml`)
- [ ] `uv.lock` существует (зависимости зафиксированы)
- [ ] `Makefile` существует

### Makefile targets

- [ ] `make install` выполняется без ошибок (`uv sync`)
- [ ] `make start` выполняется (запускает `agentco start`)
- [ ] `make dev` выполняется (uvicorn с --reload)
- [ ] `make dev-frontend` описан (npm install + npm run dev)
- [ ] `make build-frontend` описан (build + cp в static/)
- [ ] `make test` выполняется без ошибок (pytest и/или vitest)
- [ ] `make test` возвращает код 0 (все тесты зелёные)

### Git-история

- [ ] Коммиты идут по формату `feat(M0-001): <описание>`
- [ ] Нет закоммиченных секретов (.env*, *.key, api_key=... в коде)
- [ ] `.gitignore` есть и покрывает: `__pycache__/`, `.venv/`, `node_modules/`, `*.db`, `.env`

### Smoke-тест установки (TDD)

- [ ] `git clone` → `make install` → `make start` — весь флоу проходит без ошибок
- [ ] `make dev` поднимает сервер на `localhost:8000` (или указанный порт)
- [ ] Нет hard-coded абсолютных путей (всё через `~/.agentco/` или конфиг)

### Edge cases M0-001

- [ ] **`make install` без uv** — понятное сообщение об ошибке, не стектрейс
- [ ] **`make test` при пустой БД** — не падает, создаёт схему
- [ ] **Запуск на Python < 3.12** — fail-fast с понятным сообщением (pyproject.toml: `requires-python = ">=3.12"`)
- [ ] **Запуск без Node.js** — `make install` и `make start` работают (статика уже в репе)

---

## M0-003 — SQLite schema + WAL + миграции

**Assignee:** Alex | **AC из ROADMAP:** Schema создана, WAL включён, миграции идемпотентны

> ⚠️ РАСХОЖДЕНИЕ: В task brief написано "5 таблиц", в ARCHITECTURE.md описано 7 таблиц.
> Проверять по ARCHITECTURE.md как авторитетному источнику.

### Таблицы (все 7 из ARCHITECTURE.md)

- [ ] `users` создана (id, email UNIQUE NOT NULL, name, password_hash NOT NULL, created_at)
- [ ] `llm_credentials` создана (id, user_id FK→users, provider, encrypted_key, key_hint, created_at, UNIQUE(user_id,provider))
- [ ] `companies` создана (id, owner_id FK→users, name NOT NULL, description, status DEFAULT 'active', settings DEFAULT '{}', created_at, updated_at)
- [ ] `agents` создана (id, company_id FK→companies, owner_id FK→users, name, role, system_prompt, avatar_emoji, llm_model, llm_params, parent_agent_id FK→agents, hierarchy_level DEFAULT 0, mcp_server_urls DEFAULT '[]', is_active DEFAULT 1, created_at, updated_at)
- [ ] `tasks` создана (id, company_id FK→companies, run_id FK→runs, assigned_to FK→agents, created_by FK→agents, parent_task_id FK→tasks, title NOT NULL, description, status DEFAULT 'backlog', priority DEFAULT 0, result, llm_cost_usd, tokens_used, started_at, completed_at, created_at, updated_at)
- [ ] `runs` создана (id, company_id FK→companies, initiated_by FK→users, goal NOT NULL, status DEFAULT 'pending', total_cost_usd, total_tokens, graph_state DEFAULT '{}', error_message, started_at, completed_at, created_at)
- [ ] `run_events` создана (id AUTOINCREMENT, run_id FK→runs, agent_id FK→agents, task_id FK→tasks, event_type NOT NULL, payload DEFAULT '{}', created_at)

### Индексы

- [ ] `idx_companies_owner` на `companies(owner_id, status)`
- [ ] `idx_agents_company` на `agents(company_id)`
- [ ] `idx_agents_parent` на `agents(parent_agent_id)`
- [ ] `idx_tasks_company` на `tasks(company_id, status)`
- [ ] `idx_tasks_run` на `tasks(run_id)`
- [ ] `idx_runs_company` на `runs(company_id, status)`
- [ ] `idx_run_events_run` на `run_events(run_id, id)`

### PRAGMA и настройки

- [ ] `PRAGMA journal_mode=WAL` — запрос возвращает `'wal'` (не 'delete')
- [ ] `PRAGMA foreign_keys=ON` — включён (проверить что FK violations отклоняются)
- [ ] WAL-файл (`data.db-wal`) создаётся при записи
- [ ] WAL применяется при каждом подключении, не только при первом

### Миграции (Alembic)

- [ ] Alembic инициализирован (`alembic/` директория, `alembic.ini`)
- [ ] Начальная миграция существует и применяется без ошибок
- [ ] `alembic upgrade head` применяется второй раз — **не падает** (идемпотентность)
- [ ] `alembic upgrade head` на чистой БД — создаёт все таблицы с нуля
- [ ] `alembic downgrade` на 1 шаг назад — работает без ошибок
- [ ] `alembic current` показывает корректную ревизию после upgrade

### Edge cases M0-003

- [ ] **База уже существует** (повторный запуск) — `upgrade head` проходит без ошибок, данные не теряются
- [ ] **Путь к файлу недоступен** (`~/.agentco/` нет прав на запись) — понятная ошибка, не стектрейс
- [ ] **Путь к файлу не существует** — директория создаётся автоматически, не краш
- [ ] **FK violation: agent с несуществующим company_id** — ошибка SQLITE_CONSTRAINT, не silent insert
- [ ] **FK violation: task с несуществующим run_id** — ошибка SQLITE_CONSTRAINT
- [ ] **FK violation: agents.parent_agent_id → себя** — ожидается ошибка или explicit CHECK
- [ ] **Удаление user с каскадом** — удаляются llm_credentials и companies (ON DELETE CASCADE)
- [ ] **Удаление company с каскадом** — удаляются agents и tasks и runs
- [ ] **Удаление agent** — tasks.assigned_to и tasks.created_by обнуляются (ON DELETE SET NULL), не каскадное удаление задач
- [ ] **Удаление runs** — run_events удаляются (ON DELETE CASCADE), tasks.run_id обнуляется (ON DELETE SET NULL)
- [ ] **Два одновременных подключения к WAL** — оба читают без блокировки (WAL позволяет)
- [ ] **tasks.status** — только допустимые значения: 'backlog', 'in_progress', 'done', 'failed' (CHECK constraint или валидация на уровне приложения)
- [ ] **agents.llm_params** — валидный JSON (не пустая строка)
- [ ] **companies.settings** — валидный JSON (не пустая строка)
- [ ] **Файл data.db занят другим процессом** — корректная ошибка, не зависание
- [ ] **AUTOINCREMENT на run_events.id** — при удалении и вставке id не переиспользуются

---

## M0-005 — Next.js static / Frontend prep

**Assignee:** Siri | **AC из ROADMAP:** FastAPI скелет + Next.js static (подготовка компонентов)

> Примечание: в этом цикле Siri делает только локальные компоненты без интеграции с монорепо.
> Интеграция (раздача через FastAPI) — после закрытия M0-001.

### Структура фронтенда

- [ ] `frontend/app/` существует (Next.js App Router структура)
- [ ] `frontend/next.config.js` существует с `output: 'export'`
- [ ] `frontend/package.json` существует с зависимостями (react, react-dom, typescript, vitest, @testing-library/react)
- [ ] TypeScript конфиг существует (`tsconfig.json`)
- [ ] Vitest конфиг существует (`vitest.config.ts` или в `package.json`)

### Компонент WarRoom

- [ ] `WarRoom` компонент существует в `src/components/WarRoom/WarRoom.tsx`
- [ ] `WarRoom` рендерится без краша (пустые props)
- [ ] `WarRoom` имеет `data-testid="war-room"` (проверено в тесте)
- [ ] `WarRoom` принимает prop `agents?: AgentCardProps[]`
- [ ] `WarRoom` с agents=['Alex(idle)', 'Siri(thinking)'] — отображает оба имени
- [ ] `WarRoom` без props (`<WarRoom />`) — не краш, рендерится пустой контейнер
- [ ] `WarRoom` экспортируется как named export (`export { WarRoom }`)

### Компонент AgentCard

- [ ] `AgentCard` компонент существует
- [ ] `AgentCard` принимает props: `id: string`, `name: string`, `role: string`, `status: 'idle' | 'thinking' | 'done'`
- [ ] `AgentCard` с `status: 'idle'` — рендерится без краша
- [ ] `AgentCard` с `status: 'thinking'` — рендерится без краша
- [ ] `AgentCard` с `status: 'done'` — рендерится без краша
- [ ] Props типизированы через TypeScript interface/type (не `any`)
- [ ] TypeScript strict mode не выдаёт ошибок по AgentCard

### Компонент KanbanBoard

- [ ] `KanbanBoard` компонент существует
- [ ] `KanbanBoard` показывает 3 колонки (backlog / in_progress / done или аналог)
- [ ] `KanbanBoard` принимает prop `tasks: Task[]`
- [ ] Тип `Task` описан (id, title, status, assignedTo или аналог)
- [ ] `KanbanBoard` с непустым массивом tasks — задачи распределены по колонкам
- [ ] `KanbanBoard` рендерится без краша при любом наборе props

### Тесты (vitest + @testing-library/react)

- [ ] `npm test` (или `npx vitest run`) выполняется без ошибок
- [ ] `WarRoom.test.tsx` — все тесты зелёные
- [ ] Тест "renders without crash" проходит
- [ ] Тест "renders agent cards when agents provided" проходит
- [ ] Coverage не падает до 0% (хотя бы smoke тесты есть)
- [ ] Нет `console.error` в тестах (PropTypes warnings, unhandled refs)

### Edge cases M0-005

- [ ] **`KanbanBoard` с пустым массивом `tasks={[]}`** — рендерит 3 пустые колонки, не краш, не "undefined" в DOM
- [ ] **`KanbanBoard` с `tasks={undefined}`** — не краш (default prop или optional handling)
- [ ] **`AgentCard` с неизвестным status** (напр. `status="error"` или `status="running"`) — не краш; либо TypeScript это отклоняет на этапе компиляции
- [ ] **`WarRoom` с `agents={[]}`** — рендерит пустой war room, не undefined/null ошибка
- [ ] **`AgentCard` с очень длинным name** (500+ символов) — не ломает layout (overflow hidden или truncate)
- [ ] **`AgentCard` без role** (role='') — рендерится без краша
- [ ] **`KanbanBoard` с задачей без assigned_to** — не краш, отображает задачу без агента
- [ ] **`KanbanBoard` с задачей с неизвестным status** — задача попадает в fallback колонку или явно обрабатывается
- [ ] **Рендер в SSR/SSG контексте** (`next.config.js output: 'export'`) — нет window/document references без guard
- [ ] **`npm test` в CI (без display)** — vitest запускается headless без ошибок

---

## Регрессия и кросс-тикет

- [ ] M0-001 + M0-003: `make test` запускает backend тесты (pytest) включая проверку схемы
- [ ] M0-001 + M0-005: после интеграции `make build-frontend` кладёт dist в `backend/agentco/static/`
- [ ] Никакие файлы не конфликтуют по именам между backend/ и frontend/

---

## Потенциальные риски (для команды)

| Риск | Тикет | Серьёзность |
|------|-------|------------|
| В task brief "5 таблиц", в ARCHITECTURE.md — 7. Разработчик может пропустить `runs` и `run_events` | M0-003 | Major |
| `tasks` содержит FK на `runs`, а `runs` FK на `companies` — порядок CREATE TABLE важен. Если перепутать — ошибка при миграции | M0-003 | Major |
| `agents.parent_agent_id` — self-referential FK. SQLite создаёт их без проблем, но Alembic может потребовать особой обработки | M0-003 | Minor |
| `PRAGMA foreign_keys=ON` нужно включать при каждом новом соединении. Если connection pool не настроен — FK могут молча не работать | M0-003 | Critical |
| `PRAGMA journal_mode=WAL` нужно включать только один раз (persists), но явный вызов при каждом старте — безвреднее | M0-003 | Minor |
| AgentCard не имеет явного handling для `status` вне `'idle' \| 'thinking' \| 'done'` — TypeScript проверит на compile, но runtime JSON может привести любое значение | M0-005 | Major |
| `next.config.js output: 'export'` несовместим с некоторыми Next.js фичами (Server Components с данными, API routes) — нужно убедиться что компоненты статические | M0-005 | Major |
| Нет `make test` target описан явно в ARCHITECTURE.md Makefile — Alex может его не добавить | M0-001 | Minor |

---

*QA checklist подготовлен: 2026-03-12 11:00 MSK | Alisa*
*Следующий шаг: применить к закрытым тикетам в следующем цикле*
