# AgentCo

AI Agent Orchestration Platform — monorepo.

## Stack

- **Backend**: Python 3.12, FastAPI, uv, SQLite WAL, LangGraph, LiteLLM
- **Frontend**: Vite + React 18 + TypeScript
- **Infra**: Docker, GitHub Actions CI

## Quick Start

```bash
# Dev (backend + frontend)
make dev

# Run tests
make test

# Build
make build
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
│   └── workflows/ci.yml
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
