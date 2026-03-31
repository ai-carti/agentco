# AgentCo Backend

AI agent orchestration platform — FastAPI + SQLite + LangGraph + LiteLLM.

## Quick Start

```bash
# Install dependencies
uv sync --dev

# Run tests
uv run pytest

# Start dev server
uv run uvicorn agentco.main:app --reload --port 8000
```

## Architecture

```
src/agentco/
├── main.py              # FastAPI app, CORS, middleware, lifespan
├── auth/                # JWT auth (PyJWT + bcrypt)
├── handlers/            # API route handlers (companies, agents, tasks, runs, etc.)
├── services/            # Business logic layer
├── repositories/        # Data access layer (SQLAlchemy ORM)
├── orm/                 # SQLAlchemy ORM models
├── models/              # Pydantic domain models
├── orchestration/       # LangGraph graph: CEO → SubAgent hierarchy
│   ├── graph.py         # Graph compilation (StateGraph + conditional edges)
│   ├── nodes.py         # CEO, SubAgent, Hierarchical nodes
│   ├── agent_node.py    # LLM calls via LiteLLM with streaming + tool calls
│   ├── state.py         # AgentState TypedDict
│   └── checkpointer.py  # AsyncSqliteSaver for LangGraph checkpointing
├── memory/              # sqlite-vec RAG memory (inject top-5 memories into prompts)
├── core/                # EventBus (asyncio.Queue), rate limiting (slowapi)
├── middleware/           # Correlation ID middleware
├── llm/                 # LiteLLM client wrapper
├── db/                  # SQLAlchemy engine + session factory
└── static/              # Bundled frontend assets (optional)
```

## API Endpoints

All endpoints require JWT Bearer auth unless noted.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Get JWT access token |
| GET | `/auth/me` | Current user info |
| GET | `/api/companies/` | List user's companies |
| POST | `/api/companies/` | Create company |
| GET/PUT/DELETE | `/api/companies/{id}` | Company CRUD |
| GET/POST | `/api/companies/{id}/agents` | Agents CRUD |
| GET | `/api/companies/{id}/agents/tree` | Agent hierarchy tree |
| GET/POST | `/api/companies/{cid}/agents/{aid}/tasks` | Tasks CRUD |
| POST | `/api/companies/{id}/runs` | Start run with goal |
| GET | `/api/companies/{id}/runs` | List runs |
| PATCH | `/api/companies/{id}/runs/{rid}/stop` | Stop run |
| GET | `/api/companies/{id}/runs/{rid}/events` | Run events (streaming log) |
| WS | `/ws/companies/{id}/events` | Real-time WebSocket events |
| POST | `/api/llm/validate-key` | Validate LLM API key |
| GET | `/api/llm/providers` | List configured providers |
| GET | `/health` | Liveness probe (DB check) |

API versioning: all `/api/...` paths also available under `/api/v1/...`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | dev default | JWT signing key (**required in prod**) |
| `DATABASE_URL` | `sqlite:///./agentco.db` | Main database URL |
| `AGENTCO_MEMORY_DB` | `./agentco_memory.db` | sqlite-vec memory database path |
| `ENCRYPTION_KEY` | dev fallback | Fernet key for API key encryption (**required in prod**) |
| `CORS_ORIGINS` | localhost dev | Comma-separated allowed origins |
| `AGENTCO_USE_REAL_LLM` | `false` | Use real LLM (`true`) or mock (`false`) |
| `AGENTCO_ORCHESTRATION_MODEL` | `gpt-4o-mini` | Model for hierarchy orchestration |
| `LOG_LEVEL` | `INFO` | Logging level |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT token TTL |
| `MAX_AGENT_ITERATIONS` | `20` | Loop detection: max graph iterations |
| `MAX_RUN_COST_USD` | `1.0` | Loop detection: max cost per run |
| `MAX_RUN_TOKENS` | `100000` | Loop detection: max tokens per run |
| `MAX_RUN_TIMEOUT_SEC` | `600` | Max run duration (seconds) |
| `RUN_MAX_RETRIES` | `3` | Retry count for transient failures |
| `MAX_WS_CONNECTIONS_PER_USER` | `5` | WebSocket connection limit per user |

Rate limit env vars: `RATE_LIMIT_AUTH_LOGIN`, `RATE_LIMIT_AUTH_REGISTER`, `RATE_LIMIT_RUN`, etc.

## Database

Default: SQLite WAL mode with foreign keys enabled.
Optional: PostgreSQL via `DATABASE_URL=postgresql://...` (requires `[postgres]` extra).

Migrations: `uv run alembic upgrade head` (required for Postgres; SQLite auto-creates tables).

## Deployment

Deployed on Railway via `Procfile`:
```
web: uvicorn agentco.main:app --host 0.0.0.0 --port $PORT
```

Ensure `SECRET_KEY`, `ENCRYPTION_KEY`, `CORS_ORIGINS`, and `AGENTCO_USE_REAL_LLM=true` are set in Railway Variables.

## Testing

```bash
uv run pytest              # all tests
uv run pytest -x           # stop on first failure
uv run pytest -k "test_auth"  # run specific tests
```

Tests use in-memory SQLite with isolated sessions per test (see `tests/conftest.py`).
