# AgentCo

AI Agent Orchestration Platform — monorepo.

## Stack

- **Backend**: Python 3.12, FastAPI, uv, SQLite WAL, LangGraph, LiteLLM
- **Frontend**: Vite + React 18 + TypeScript
- **Infra**: Docker, GitHub Actions CI

## Quick Start

```bash
# Install deps
make install

# Dev (backend + frontend)
make dev

# Run tests
make test

# Build
make build
```

> Миграции применяются автоматически при `agentco start` / `agentco dev`.
> Вручную: `cd backend && uv run alembic upgrade head`

## Env variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | _(required in prod)_ | JWT signing key (`openssl rand -hex 32`) |
| `AGENTCO_DB_URL` | `sqlite:///./agentco.db` | Main database URL |
| `OPENAI_API_KEY` | — | OpenAI key (needed for LLM features) |
| `ANTHROPIC_API_KEY` | — | Anthropic key (needed for Claude models) |
| `ENCRYPTION_KEY` | — | Fernet key for stored secrets |

See `.env.example` for the full list.

## Deploy

### Railway (recommended)

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Link project: `railway link`
4. Set secrets in Railway dashboard (or via CLI):
   ```bash
   railway variables set SECRET_KEY=$(openssl rand -hex 32)
   railway variables set OPENAI_API_KEY=sk-...
   railway variables set ANTHROPIC_API_KEY=sk-ant-...
   ```
5. Deploy: `railway up`

**CI/CD:** Push to `main` → GitHub Actions runs tests → deploys to Railway automatically.
Required secret in GitHub repo: `RAILWAY_TOKEN` (generate at [railway.app/account/tokens](https://railway.app/account/tokens)).

### Docker (self-hosted)

```bash
# Build and start backend
docker compose -f docker/docker-compose.yml up --build

# Backend available at http://localhost:8000
```

### Manual

```bash
# Backend
cd backend
uv sync --no-dev
SECRET_KEY=your-secret OPENAI_API_KEY=sk-... uv run uvicorn agentco.main:app --host 0.0.0.0 --port 8000

# Frontend (static build)
cd frontend
npm ci && npm run build
# Serve frontend/out with any static file server
npx serve out -l 3000
```

### Health check

```
GET /health → 200 OK
```

## Structure

```
agentco/
├── backend/          # FastAPI app, SQLite, LangGraph agents
│   ├── pyproject.toml
│   ├── src/agentco/
│   └── tests/
├── frontend/         # Vite + React 18 + TypeScript
│   ├── package.json
│   └── src/
├── docker/
│   └── Dockerfile
├── .github/
│   └── workflows/
│       ├── ci.yml        # PR checks
│       └── deploy.yml    # deploy on push to main
└── Makefile
```

## Development

### Backend

```bash
cd backend
uv sync --dev
uv run uvicorn agentco.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
