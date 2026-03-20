# After Demo: Backend Priorities

> Alex · 2026-03-20 · Post-demo tech debt roadmap
> Фокус: production readiness, scalability, security — то что спросит инвестор при due diligence или первый enterprise-клиент при интеграции.

---

## What investors will ask about

1. "What happens when 100 users run agents simultaneously?" → горизонтальное масштабирование
2. "Where is the data stored? Is it safe?" → SQLite → Postgres миграция, encryption at rest
3. "Can we use our own LLM provider / on-premise?" → multi-tenancy, custom providers
4. "How do I see what's happening in production?" → observability, logging, metrics
5. "What's your uptime SLA?" → healthchecks, graceful failover, retry logic

---

| ID | Описание | Приоритет | Оценка |
|----|----------|-----------|--------|
| ALEX-POST-001 | **SQLite → PostgreSQL migration**: SQLite на Railway теряет данные при рестарте контейнера даже с volume (WAL не выживает при pod eviction). Миграция на Postgres через Alembic — схема уже есть, нужен `DATABASE_URL` env + SQLAlchemy dialect swap. Это блокер для любого платящего клиента с требованием data durability. | 🔴 Critical | 2-3 дня |
| ALEX-POST-002 | **Horizontal scalability (multi-process EventBus)**: текущий `in-process asyncio.Queue` EventBus не работает при multiple uvicorn workers или multi-container deploy. WebSocket events теряются при любой нагрузке > 1 instance. Нужен Redis pub/sub или NATS как transport layer. Без этого → вертикальное масштабирование упирается в 1 CPU. | 🔴 Critical | 3-4 дня |
| ALEX-POST-003 | **Rate limiting & abuse protection**: нет rate limiting на API endpoints. Любой пользователь может запустить 1000 agents → OOM / bankrupt the startup через LLM API costs. Нужен `slowapi` + Redis counter: per-user/IP limiter на `/api/companies/*/tasks/*/run` и validate-key endpoints. | 🟠 High | 1-2 дня |
| ALEX-POST-004 | **Structured logging + distributed tracing**: текущие логи — plain `print()` / uvicorn access log. Нет correlation ID между HTTP request → LangGraph run → WebSocket event. При дебаге production issue невозможно найти что пошло не так. Нужен `structlog` + `opentelemetry-sdk` с OTLP export (Grafana Cloud / Honeycomb). | 🟠 High | 2 дня |
| ALEX-POST-005 | **LangGraph checkpointing persistence**: текущий `MemorySaver` хранит state в RAM — при crash/restart все running агенты теряют прогресс. Нужен `SqliteSaver` или `PostgresSaver` для LangGraph checkpointer. Инвестор спросит: "что если сервер упадёт на 10 минут?". | 🟠 High | 1-2 дня |
| ALEX-POST-006 | **API versioning + deprecation strategy**: все эндпоинты висят на `/api/...` без версии. При breaking changes (добавить поле в Task, изменить Run FSM) ломаются все клиенты. Нужен `/api/v1/...` prefix + deprecation headers. Blocker для enterprise клиентов с SLA. | 🟡 Medium | 1 день |
| ALEX-POST-007 | **Background job queue (Celery/ARQ)**: agent runs выполняются как bare asyncio tasks в HTTP process. При timeout/OOM они молча падают без retry. Нужен job queue с retry policy, dead-letter queue, visibility timeout. Рассмотреть `arq` (async Redis queue) — минимальный footprint, совместим с FastAPI. | 🟡 Medium | 3 дня |

---

## Notes

- **ALEX-POST-001** и **ALEX-POST-002** — блокеры для любого production deployment с реальными пользователями. Делать в первую очередь сразу после демо.
- **ALEX-POST-003** критично до первого публичного beta — без rate limiting первый viral tweet сожжёт бюджет.
- **ALEX-POST-004** и **ALEX-POST-005** нужны до Series A due diligence — инвестор запросит production metrics и disaster recovery plan.
- **ALEX-POST-006**, **ALEX-POST-007** — после первых 10 платящих клиентов.

Все тикеты будут добавлены в ROADMAP.md по мере приоритизации Shadrin после демо.
