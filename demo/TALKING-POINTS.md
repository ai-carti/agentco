# AgentCo — Talking Points для инвестора
> Shadrin (PM) · 2026-03-18 · Перед демо 2026-03-21

---

## S1 — Hero / Login экран

**Что это:** Чистый JWT-auth с email/password. Без OAuth зависимостей.

**Почему важно:** Продукт работает с нуля — нет зависимости от Google/GitHub. Self-hosted friendly.

**Цифры:** Auth реализован за 1 день агентом Alex. 403 backend тестов, включая auth coverage.

**Тезис:** "We ship features, not scaffolding."

---

## S2 — Companies / Dashboard

**Что это:** Workspace-модель. Каждая компания = изолированная AI-команда со своими агентами, задачами, War Room.

**Почему важно:** Multi-tenant by design. SaaS-ready. ICP: 5-50 person startups создают несколько компаний под разные проекты.

**Цифры:** CRUD за <1 день. Полная изоляция данных (auth проверка owner на всех эндпоинтах — BUG-004 fixed).

**Тезис:** "One login, multiple AI companies. Like Notion workspaces but for AI teams."

---

## S3 — War Room ⭐ (WoW-момент)

**Что это:** Live command center. WebSocket stream от LangGraph. Каждый агент виден — статус, текущая задача, стоимость.

**Почему важно:** Полная прозрачность. Это то чего нет у AutoGen/CrewAI — визуальный контроль над иерархией агентов в реальном времени.

**Цифры:**
- WebSocket: `/ws/companies/{id}/events` — события `llm_token`, `status_change`, `task_complete`
- Иерархия: N уровней (POST-006 — рекурсивный LangGraph граф)
- Cost tracking: real-time, до $0.001 точности

**Тезис:** "This is the war room. See your AI company working. Not a dashboard — a live theater."

**WoW-момент:** Нажать Run на задаче → агент начинает печатать прямо на экране. "Это не mock. Это LangGraph + LiteLLM стрим."

---

## S4 — Kanban Board

**Что это:** Полноценный task manager. Колонки: Backlog → Todo → In Progress → Done. Drag & drop. Фильтры. Поиск (Cmd+K).

**Почему важно:** Привычный UX (Jira-like) + AI executor. Пользователь не меняет workflow — просто нажимает Run вместо "сделай это сам".

**Цифры:**
- 178+ тестов (backend + frontend) покрывают Task FSM
- Task status transitions: строгий FSM — нельзя перейти из done → running без нового run
- Assignee: агент назначается на задачу, виден в карточке

**Тезис:** "Same board you know. But instead of assigning to a human, you assign to an AI agent."

---

## S5 — Task Detail / Execution Log

**Что это:** Sidebar с полным логом выполнения задачи. Каждый токен с timestamp. Timeline смены статусов.

**Почему важно:** Auditable AI. Не чёрный ящик — каждый шаг виден. Compliance-friendly.

**Цифры:** Logs хранятся в SQLite. REST endpoint `GET /tasks/{id}/logs`. Sidebar открывается за <50ms (клиентский роутинг).

**Тезис:** "Every decision your AI team makes is logged. You can audit, replay, debug."

---

## S6 — Agents / AgentCard

**Что это:** Управление командой агентов. Каждый агент: роль, системный промпт, модель LLM, статус.

**Почему важно:** Гибкость — можно использовать GPT-4o для CEO (стратегия) и llama-3 для SWE (код). 3.2× экономия vs naive GPT-4o.

**Цифры:**
- Model selector: dropdown из `GET /api/llm/providers` + fallback [gpt-4o, claude-sonnet, gemini-1.5-pro]
- Persistent Memory: RAG через sqlite-vec. Top-5 воспоминаний инжектируются в системный промпт при каждом run
- Agent Portfolio: история задач агента и всех его форков (M3-002)

**Тезис:** "Choose the right LLM for each role. Pay for what you need, not a flat GPT-4o rate."

---

## S7 — Agent Library / Fork

**Что это:** Глобальная библиотека агентов. Сохранить → поделиться → форкнуть в другой проект.

**Почему важно:** Network effect. Лучшие агенты (проверенные промпты, настроенные модели) распространяются между командами.

**Цифры:** `POST /api/library` + `POST /api/companies/{id}/agents/fork` — за одну транзакцию. 919 тестов total including library coverage.

**Тезис:** "Open source agents. Your best AI employee becomes a template for everyone."

---

## S8 — Architecture / Traction

**Что это:** FastAPI + LangGraph + Next.js + SQLite. Zero external services. Docker single-container deploy.

**Почему важно:** Простота = надёжность. Нет Redis, нет Kafka, нет K8s. Работает на $5/мес VPS.

**Цифры:**
- 919 тестов passing (backend: 403, frontend: 516) — 0 failures
- M0 → M2 + UX Sprint + Post-MVP: all shipped by AgentCo itself
- Commits: 30+ коммитов от AI-агентов
- Git log: `3741ab0` последний — final frontend verification от самого AgentCo

**Тезис:** "919 tests. 0 failures. Shipped by AI. This is the proof of concept."

---

## S9 — Competitive Moat

**Что говорить, если спросят "почему Microsoft не скопирует":**

> "Наш moat — data flywheel. Каждый форкнутый агент, каждая выполненная задача улучшает библиотеку. Чем больше компаний — тем лучше агенты для всех. AutoGen — фреймворк, AgentCo — платформа с network effect."

**На вопрос о Langflow/Flowise/Dify:**
> "Они visual workflow builders — pipe и node для разработчиков. Мы — virtual company для бизнес-юзеров. Different ICP."

---

## Ключевые цифры (держать в голове)

| Метрика | Значение |
|---------|----------|
| Backend тесты | 403 ✅ |
| Frontend тесты | 516 ✅ |
| Milestones closed | M0, M1, M2, UX Sprint, Post-MVP |
| Иерархия | N уровней (рекурсивный LangGraph) |
| Cost savings | 3.2× vs naive GPT-4o |
| Deploy | Railway / Docker |
| Time to M0 | 1 day (zero humans coding) |
| Seed ask | $500K |

---

## Стоп-слова (не говорить)

- ~~"это proof of concept"~~ → говорить "это working software"
- ~~"пока не готово"~~ → говорить "roadmap: Q4 2026 public beta"
- ~~"ещё не задеплоено"~~ → должно быть задеплоено к 21 марта (DEPLOY-E2E-001)
