# AgentCo — Architecture Decision

> Принцип: минимум зависимостей, максимум простоты установки.
> Референс: OpenClaw Gateway — один процесс, SQLite, ноль внешних сервисов.

---

## Deployment Target

Self-hosted на машине пользователя. Установка = `docker run agentco` или `pip install agentco && agentco start`.

**Не облако.** Пользователь приносит свои API ключи (OpenAI / Anthropic / Gemini).

---

## Chosen Stack: Вариант A (Minimal)

```
Browser (Next.js, статика)
    │
    └── Python Backend (FastAPI + WebSocket)
            │
            ├── SQLite (основная БД + WAL mode)
            ├── sqlite-vec (векторный поиск, PostMVP)
            ├── LangGraph (оркестрация агентов)
            ├── LiteLLM SDK (не proxy, а Python lib)
            └── In-process event bus (asyncio.Queue)
```

**Сервисов в docker compose: 1** (python backend)
Frontend собирается в статику и раздаётся тем же бэкендом.

---

## Отказались от (и почему)

| Что | Почему нет |
|-----|-----------|
| PostgreSQL | Избыточно для self-hosted. SQLite + WAL = 100k writes/sec, хватит надолго. |
| Redis | Нет внешних зависимостей. In-process asyncio.Queue для event streaming. |
| Go API Gateway | Два языка — сложность без выгоды на данном масштабе. |
| LiteLLM Proxy (Docker) | Используем LiteLLM как Python библиотеку, не отдельный сервис. |
| Kafka / RabbitMQ | Overkill. Даже OpenClaw Gateway без них. |
| Ollama | Не в v1. Пользователи с API ключами — наш ICP. |

---

## Tech Stack

| Слой | Технология | Детали |
|------|-----------|--------|
| Backend | Python 3.12 + FastAPI | Один процесс, async |
| Package manager | uv | Вместо pip/poetry — быстрее, современнее |
| БД | SQLite (WAL mode) | Файл `~/.agentco/data.db` |
| Vector search | sqlite-vec | RAG память агентов, расширение SQLite |
| Оркестрация | LangGraph | pip зависимость, граф внутри процесса |
| LLM | LiteLLM (Python lib) | OpenAI / Anthropic / Gemini, единый API |
| Real-time | FastAPI WebSocket + asyncio.Queue | In-process, без Redis |
| Frontend | Vite + React + TypeScript | Раздаётся FastAPI как статика |
| Packaging | uv build → .whl → PyPI | Статика фронта включена в пакет |

---

## Real-time Event Flow

```python
# In-process event bus
class EventBus:
    def __init__(self):
        self._queues: dict[str, list[asyncio.Queue]] = {}
    
    async def publish(self, run_id: str, event: dict):
        # Сохраняем в SQLite для истории
        await db.save_event(run_id, event)
        # Пушим в WebSocket очереди
        for q in self._queues.get(run_id, []):
            await q.put(event)
    
    def subscribe(self, run_id: str) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=256)
        self._queues.setdefault(run_id, []).append(q)
        return q

event_bus = EventBus()  # singleton

# WebSocket endpoint
@app.websocket("/ws/runs/{run_id}")
async def war_room_ws(ws: WebSocket, run_id: str):
    await ws.accept()
    # Реплей истории из SQLite
    history = await db.get_run_events(run_id)
    for event in history:
        await ws.send_json(event)
    # Подписываемся на новые
    queue = event_bus.subscribe(run_id)
    try:
        while True:
            event = await queue.get()
            await ws.send_json(event)
    except WebSocketDisconnect:
        event_bus.unsubscribe(run_id, queue)
```

---

## LiteLLM как библиотека (не proxy)

```python
# llm/client.py
import litellm

async def call_llm(model: str, messages: list, api_key: str, stream=True):
    response = await litellm.acompletion(
        model=model,           # "gpt-4o", "claude-3-5-sonnet", "gemini/gemini-pro"
        messages=messages,
        api_key=api_key,       # ключ пользователя
        stream=stream,
        temperature=0.7
    )
    return response

# Поддерживаемые модели из коробки:
# - openai/gpt-4o, gpt-4o-mini
# - anthropic/claude-3-5-sonnet-20241022, claude-3-5-haiku
# - gemini/gemini-1.5-pro, gemini-1.5-flash
# Добавить новый провайдер = одна строка в конфиге
```

---

## SQLite Schema

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE users (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email       TEXT NOT NULL UNIQUE,
    name        TEXT,
    password_hash TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE llm_credentials (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL,  -- 'openai' | 'anthropic' | 'gemini'
    encrypted_key TEXT NOT NULL,
    key_hint    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, provider)
);

CREATE TABLE companies (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    settings    TEXT NOT NULL DEFAULT '{}',  -- JSON
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agents (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id      TEXT REFERENCES companies(id) ON DELETE CASCADE,
    owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL,
    system_prompt   TEXT NOT NULL,
    avatar_emoji    TEXT DEFAULT '🤖',
    llm_model       TEXT NOT NULL,
    llm_params      TEXT NOT NULL DEFAULT '{"temperature":0.7,"max_tokens":4096}',
    parent_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    hierarchy_level INTEGER NOT NULL DEFAULT 0,
    mcp_server_urls TEXT NOT NULL DEFAULT '[]',  -- JSON array
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    run_id          TEXT REFERENCES runs(id) ON DELETE SET NULL,
    assigned_to     TEXT REFERENCES agents(id) ON DELETE SET NULL,
    created_by      TEXT REFERENCES agents(id) ON DELETE SET NULL,
    parent_task_id  TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'backlog',
    priority        INTEGER NOT NULL DEFAULT 0,
    result          TEXT,
    llm_cost_usd    REAL DEFAULT 0,
    tokens_used     INTEGER DEFAULT 0,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE runs (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    initiated_by    TEXT NOT NULL REFERENCES users(id),
    goal            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    total_cost_usd  REAL DEFAULT 0,
    total_tokens    INTEGER DEFAULT 0,
    graph_state     TEXT DEFAULT '{}',  -- JSON, LangGraph checkpoint
    error_message   TEXT,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE run_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,
    payload         TEXT NOT NULL DEFAULT '{}',  -- JSON
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_companies_owner ON companies(owner_id, status);
CREATE INDEX idx_agents_company ON agents(company_id);
CREATE INDEX idx_agents_parent ON agents(parent_agent_id);
CREATE INDEX idx_tasks_company ON tasks(company_id, status);
CREATE INDEX idx_tasks_run ON tasks(run_id);
CREATE INDEX idx_runs_company ON runs(company_id, status);
CREATE INDEX idx_run_events_run ON run_events(run_id, id);
```

---

## Project Structure

```
agentco/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── api/
│   │   ├── auth.py          # /api/v1/auth/*
│   │   ├── companies.py     # /api/v1/companies/*
│   │   ├── agents.py        # /api/v1/agents/*
│   │   ├── tasks.py         # /api/v1/tasks/*
│   │   ├── runs.py          # /api/v1/runs/*
│   │   └── ws.py            # /ws/runs/{run_id}
│   ├── orchestrator/
│   │   ├── graph.py         # LangGraph company graph
│   │   ├── nodes.py         # Agent node functions
│   │   ├── protocol.py      # Orchestration protocol types
│   │   └── loop_guard.py    # Loop detection + cost limits
│   ├── llm/
│   │   └── client.py        # LiteLLM wrapper
│   ├── db/
│   │   ├── connection.py    # SQLite connection + migrations
│   │   └── schema.sql       # Schema
│   ├── events/
│   │   └── bus.py           # In-process EventBus
│   └── static/              # Next.js build output
├── frontend/
│   ├── app/                 # Next.js App Router
│   └── next.config.js       # output: 'export'
├── Dockerfile               # Single image
├── docker-compose.yml       # Single service
└── pyproject.toml
```

---

## Build & Distribution

**Репозиторий:** GitHub (не PyPI)

```
CI (GitHub Actions) — на каждый push в main:
  1. npm --prefix frontend run build → frontend/dist/
  2. cp -r frontend/dist backend/agentco/static/
  3. git commit "chore: update static" → коммитим статику в репу

Пользователь:
  git clone https://github.com/you/agentco
  make install   # uv sync (только Python, node не нужен)
  make start     # agentco start → http://localhost:8000
```

Статика хранится в `backend/agentco/static/` прямо в репе.
Пользователю Node.js не нужен — он получает уже собранный фронт через git clone.
Разработчику Node.js нужен только для работы с фронтом.

## Makefile

```makefile
install:        ## Установить зависимости (только Python)
	uv sync

dev-frontend:   ## Запустить фронт в dev режиме (нужен Node.js)
	npm --prefix frontend install
	npm --prefix frontend run dev

build-frontend: ## Собрать фронт и положить в static/
	npm --prefix frontend install
	npm --prefix frontend run build
	cp -r frontend/dist backend/agentco/static/

start:          ## Запустить AgentCo
	uv run agentco start

dev:            ## Запустить в dev режиме (hot reload)
	uv run uvicorn agentco.main:app --reload --port 8000
```

## Installation (для пользователя)

```bash
git clone https://github.com/you/agentco
cd agentco
make install
make start
# → http://localhost:8000
# data: ~/.agentco/data.db
```

*Обновлено: 2026-03-11 — Вариант A (minimal, self-hosted)*
