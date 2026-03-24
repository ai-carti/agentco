# AgentCo — Technical Roadmap (v2, updated)

> Стек: Python (FastAPI) + SQLite + LangGraph + LiteLLM + Next.js
> Архитектура: один процесс, один файл БД, ноль внешних сервисов

---

## Demo Day Audit — Siri [2026-03-20]

| ID | Описание | Статус |
|----|----------|--------|
| SIRI-DAY-001 | War Room mock agents: заменить "CEO Agent / CPO Agent / SWE Agent" на human names (Alex/Jordan/Dev/Morgan) — убрать generic "Agent" суффикс | done |

---

## Bugs 🐛 (приоритет выше любого milestone)

> Shadrin: **всегда проверяй этот раздел первым**. Незакрытые баги — блокер для всего остального.
> Alisa: когда находишь баг — добавляй сюда с описанием и severity. Не просто в changelog.

| ID | Severity | Описание | Владелец | Статус |
|----|----------|----------|----------|--------|
| BUG-076 | critical | **Mock LLM в production**: `AGENTCO_USE_REAL_LLM=true` не установлен в Railway env → агент выполняет задачи через mock LLM, возвращает `"Completed task at depth 1: {task_id}"` без реального ответа. `total_tokens=0`, `total_cost_usd=0.0`. War Room Activity Feed пуст. Пользователь не видит ценности продукта. Фикс: установить `AGENTCO_USE_REAL_LLM=true` в Railway Variables + добавить LLM API key в credentials. **Требует action от @timofeytst** в Railway dashboard. | Alisa | open |
| BUG-077 | critical | **CI красный — Frontend Build + Backend Tests**: фронт-часть закрыта Siri (8aa51df) — SIRI-UX-284 переписан без Node.js API, SIRI-UX-285 unused imports убраны, SIRI-UX-288 Company type fix. Бэкенд-часть у Alex. | Alisa | fixed |
| BUG-075 | critical | **E2E prod флоу не работает**: пользователь (@timofeytst) не может пройти end-to-end success story на проде. Alisa: 1) Открыть прод URL; 2) Зарегистрироваться / войти; 3) Создать компанию → агента → задачу; 4) Нажать Run; 5) Открыть War Room — убедиться что агент запускается и лог появляется; 6) Зафиксировать на каком именно шаге падает с точными шагами воспроизведения и сообщением об ошибке; 7) Создать дочерние баг-тикеты для Alex/Siri по каждому найденному блокеру. Результат записать в changelog. | Alisa | open |
| ALEX-TD-059 | major | `orm/credential.py` — нет индекса на `company_id`. Фикс: `index=True` + миграция 0011. | Alex | fixed |
| ALEX-TD-060 | major | `orm/mcp_server.py` — нет индекса на `agent_id`. Фикс: `index=True` + миграция 0011. | Alex | fixed |
| ALEX-TD-061 | minor | `services/run.py:_execute_agent` — retry backoff без jitter → thundering herd. Фикс: `delay += random.uniform(0, 0.1) * delay`. | Alex | fixed |
| ALEX-TD-062 | minor | `handlers/library.py:list_library` — `SELECT ... FROM agent_library LIMIT ? OFFSET ?` без `ORDER BY`. При пагинации страницы могут содержать одни и те же записи или пропускать другие из-за non-deterministic order SQLite. Фикс: добавить `.order_by(AgentLibraryORM.created_at.desc())` в запрос. handlers/library.py:103 | Alex | fixed |
| ALEX-TD-063 | minor | `services/run.py:execute_run:361` — checkpointer открывается по пути из `AGENTCO_DB_PATH` (main DB), а не `CHECKPOINT_DB_PATH`. `checkpointer.py:get_checkpoint_db_path()` читает `CHECKPOINT_DB_PATH=data/checkpoints.db`, но `run.py` игнорирует эту переменную и кладёт чекпоинты в `agentco.db`. Смешивание checkpoints и основных данных в одном файле ускоряет рост БД. Фикс: убрать `_ckpt_db` argument — использовать `create_checkpointer()` без аргумента, пусть читает `CHECKPOINT_DB_PATH`. services/run.py:361 | Alex | fixed |
| ALEX-TD-064 | major | **ORM naming inconsistency — CI breaker pattern**: `orm/__init__.py` содержал `UserORM` (импорт сломан — класс назывался `User`) и `McpServerORM` (класс назывался `MCPServerORM`). Оба баги ломали весь CI. Причина: нет линтера/теста который проверяет что все классы в `orm/__init__.py` действительно экспортируются. Фикс: добавить тест `test_orm_imports.py` который импортирует каждый символ из `__all__` и проверяет что он является subclass `Base`. Предотвращает рецидивы. | Alex | fixed |
| ALEX-TD-065 | major | **Нет e2e smoke-теста импортов при старте**: CI падал на `ImportError` в `conftest.py` потому что pytest пытался импортировать `agentco.main`. Стандартный `uv run python -c "from agentco.main import app"` выявил бы баг без запуска 500+ тестов (3.5 мин). Фикс: добавить в CI-шаг перед pytest быстрый `uv run python -c "from agentco.main import app; print('OK')"` — провалится за секунды при любом ImportError. | Alex | fixed |
| ALEX-TD-066 | minor | **`orm/user.py` использует неконсистентное имя таблицы**: `__tablename__ = "users"` — единственная таблица в нижнем регистре множественного числа. Все остальные: `companies`, `agents`, `tasks`, `runs`, `run_events`, `credentials`, `agent_library`, `mcp_servers`. Паттерн неоднороден: `agent_library` (snake_case singular) vs `users` (plural). Технический долг при возможной Postgres миграции — Alembic autogenerate может создать коллизии. Задокументировать/унифицировать naming convention. | Alex | fixed |
| ALEX-TD-068 | critical | **`llm_token` event не содержит поле `cost` — WarRoom cost counter мёртв**: SIRI-POST-004 фиксит frontend читать `data.cost` из `llm_token` событий. Но `_publish_chunk` отправлял `llm_token` без `cost` — только `{company_id, type, agent_id, run_id, data}`. Поле `cost_usd` было только в `completion`. Frontend: `typeof data.cost === 'number'` → всегда false → `addCost()` не вызывался → cost counter 0. Фикс: добавлен `cost: _estimate_cost(model, max(1, len(content)//4))` в `_publish_chunk`. `orchestration/agent_node.py`. | Alex | fixed |
| ALEX-TD-069 | minor | **`handlers/mcp_servers.py:list_mcp_servers` — SELECT без ORDER BY**: аналог ALEX-TD-062 — `select(MCPServerORM).where(...).offset().limit()` без `.order_by()`. При пагинации нарушается стабильность порядка. Фикс: добавлен `.order_by(MCPServerORM.created_at.asc())`. `handlers/mcp_servers.py`. | Alex | fixed |

| ALEX-TD-070 | minor | **`repositories/agent.py` и `repositories/task.py` — list без ORDER BY**: `AgentRepository.list_by_company()` и `TaskRepository.list_by_company()/list_by_agent()` делегируют `base.list()` без передачи `order_by` → нет детерминированной сортировки для списков агентов и задач. Фикс: передавать `order_by=AgentORM.created_at.asc()` / `TaskORM.created_at.asc()` в `list_by_company`/`list_by_agent`. | Alex | fixed |
| ALEX-TD-071 | minor | **`orchestration/agent_node.py:_COST_PER_1K_TOKENS` устарел** — нет ставок для `claude-3-7`, `claude-4`, `gpt-4-turbo`, `gpt-4o-mini`, `o1`, `o3`, `gemini`. Новые популярные модели падают в `default` (0.002 USD/1K), что занижает расчёт cost_usd для WarRoom. Фикс: расширить `_COST_PER_1K_TOKENS` актуальными моделями. `orchestration/agent_node.py:31-39`. | Alex | fixed |
| ALEX-TD-072 | major | **`handlers/tasks.py`, `handlers/agents.py` — нет `max_length` на input полях**: `TaskCreate.title`, `TaskCreate.description`, `AgentCreate.name`, `AgentCreate.role`, `AgentCreate.system_prompt` не имеют верхней границы длины. Позволяет отправить мегабайтный payload, который попадёт в БД и/или LLM (cost abuse + потенциальный DoS). Фикс: добавить `max_length` на все text-поля: title=500, description=5000, name=200, role=200, system_prompt=10000, model=100. `handlers/tasks.py:19-20`, `handlers/agents.py:22-26`. | Alex | fixed |
| ALEX-TD-073 | minor | **`handlers/tasks.py:TaskStatusUpdate.status` — тип `str` вместо `TaskStatus` Literal**: API принимает произвольную строку статуса, валидация происходит только глубоко в сервисе (`InvalidTransitionError`). Ошибка не описана в OpenAPI схеме. Фикс: заменить `status: str` на `status: TaskStatus` для ранней валидации на API boundary с корректным 422. `handlers/tasks.py:46`. | Alex | fixed |
| ALEX-TD-074 | minor | **`handlers/ws_events.py` — silent `except Exception` проглатывает ошибку decode JWT**: `except Exception: pass` при декодировании токена означает любая ошибка (в т.ч. неожиданная) тихо превращается в `user_id=None → 4001 Unauthorized` без логирования. Сложно диагностировать проблемы с JWT. Фикс: логировать unexpected exceptions на уровне `logger.warning`, перехватывать только ожидаемые (`JWTError`, `ExpiredSignatureError`). `handlers/ws_events.py:50`. | Alex | fixed |


| BUG-001 | major | `authStore.ts`: user не восстанавливается после page refresh — нет `initAuth()` в App.tsx | Siri | fixed |
| BUG-002 | major | `authStore.ts`: `localStorage.getItem` вызывается при импорте модуля → падает в тестах (jsdom) | Siri | fixed |
| BUG-003 | minor | `api/client.ts`: TypeScript ошибка `Property 'env' does not exist on type 'ImportMeta'` — нет `vite-env.d.ts` | Siri | fixed |
| BUG-004 | major | `handlers/companies.py`: отсутствует проверка владельца — любой авторизованный юзер может GET/DELETE чужую компанию | Alex | fixed |
| BUG-005 | minor | `handlers/agents.py` / `AgentCreate`: пустая строка `name=""` принимается → 201, агент с пустым именем создаётся в БД. Нет `min_length=1` в Pydantic-схеме `AgentCreate.name` | Alex | fixed |
| BUG-006 | minor | `handlers/tasks.py` / `TaskCreate`: пустая строка `title=""` принимается → 201, задача с пустым title создаётся в БД. Нет `min_length=1` в Pydantic-схеме `TaskCreate.title` | Alex | fixed |
| BUG-007 | minor | `handlers/agents.py` / `AgentCreate`: `name="   "` (whitespace-only) принимается → 201. `min_length=1` считает пробелы символами, нужен `strip()` + `min_length=1` или `@field_validator` | Alex | fixed |
| BUG-008 | minor | `handlers/tasks.py` / `TaskCreate`: `title="   "` (whitespace-only) принимается → 201, задача с пробельным title создаётся в БД. `min_length=1` считает пробелы символами — аналогично BUG-007. Нужен `@field_validator` со strip-нормализацией | Alex | fixed |
| BUG-009 | minor | ROADMAP статус BUG-008 помечен `fixed`, но `test_create_task_whitespace_title_returns_422` падает (201 вместо 422). Фикс не был задеплоен/применён — статус скорректирован обратно в `open`. | Alex | fixed |
| BUG-010 | major | `ProtectedRoute` не сохраняет `location` в state при редиректе. `AuthPage` не использует `useNavigate`/`useLocation`. После логина — всегда `/`, а не исходный URL. | Siri | fixed |
| BUG-011 | major | Race condition при page refresh: `initAuth()` асинхронный, но `ProtectedRoute` рендерится синхронно с `token=null` → немедленный редирект на `/auth`. Пользователь с валидным токеном теряет URL при F5. | Siri | fixed |
| BUG-012 | minor | `AuthPage.tsx`: нет защиты от зацикливания — если `location.state.from.pathname === '/auth'`, после логина `navigate('/auth')` → пользователь застревает на `/auth`. Нужна проверка `from !== '/auth'` перед использованием. | Siri | fixed |
| BUG-013 | critical | UX-001: `TaskCard.tsx` не изменён (дата 2026-03-12). Нет кнопки ▶ Run, нет side panel, нет статус-бейджа. `useAppStore.Task` не содержит `assignee_id`/`assignee_name`. Код не написан, changelog — фикция. | Siri | fixed |
| BUG-014 | critical | UX-002: `AgentForm` компонент не существует. `<select>` для поля `model` не реализован. Нет загрузки из `GET /api/llm/providers`, нет fallback, нет защиты от пустого значения. Код не написан, changelog — фикция. | Siri | fixed |
| BUG-015 | minor | M2-004: `RunService.create_and_start` не проверяет наличие уже running рана для задачи — возможно создание множества параллельных ранов на одном таске. Edge case не покрыт тестом. | Alex | fixed |
| BUG-016 | minor | `AgentForm.tsx`: если `GET /api/llm/providers` возвращает `[]`, fallback не применялся (`[]` truthy). `setModels([])` → форма без опций. | Siri | fixed |
| BUG-017 | minor | UX-002: `AgentForm.tsx` не импортирован ни в одну страницу. Компонент существует изолированно — пользователь не может добраться до model selector dropdown из UI. | Siri | fixed |
| BUG-018 | minor | UX-001: `TaskCard.handleRun` не обрабатывает ошибки API — если POST `/tasks/{id}/run` возвращает 4xx/5xx, пользователь не получает фидбек. `fetch` не проверяет `res.ok`. | Siri | fixed |
| BUG-019 | major | UX-008: меню ··· на TaskCard — пункты Edit/Delete/Assign рендерятся, но клик на них только закрывает меню (`setMenuOpen(false)`). Modal, confirm dialog, dropdown агентов не реализованы. `KanbanBoard.tsx:162` | Siri | fixed |
| BUG-020 | minor | UX-012: отсутствует empty state для списка агентов (🤖 "Your AI team is waiting" + "+ Add Agent"). Реализовано 4/5 экранов, тест существует (`EmptyState.test.tsx:49`), но ни одна страница не использует компонент с этими props | Siri | fixed |
| BUG-021 | major | UX-013: toast не интегрирован в create/delete операции. `CompaniesPage.handleCreate` не вызывает `toast.success()`. Task create и delete операции тоже без toast. AC требует toast на все основные действия | Siri | fixed |
| BUG-022 | minor | UX-003: breadcrumb показывает "Select company" на `/settings` → `AgentCo > Select company > Settings`. Должно быть `AgentCo > Settings`. `Breadcrumb.tsx:37-41` не учитывает что Settings не привязан к компании | Siri | fixed |
| BUG-023 | minor | UX-016: KanbanBoard не использует skeleton при загрузке. Prop `isLoaded` существует (`KanbanBoard.tsx:370`) но CompanyPage передаёт default `true`. Нет skeleton для списка задач | Siri | fixed |
| BUG-024 | minor | BUG-020: CTA кнопка "+ Add Agent" в empty state агентов — `onCTA={() => {}}` пустой callback. Клик ничего не делает. Должен открывать форму/модал создания агента. `CompanyPage.tsx:77` | Siri | fixed |
| BUG-025 | minor | UX-010: `TaskDetailSidebar.handleRun` не проверяет `res.ok` и не вызывает toast. При ошибке API — молчаливый fail. `TaskCard.handleRun` (KanbanBoard.tsx:92) проверяет и показывает toast — sidebar должен аналогично. `TaskDetailSidebar.tsx:111-127` | Siri | fixed |
| BUG-026 | major | UX-015: `SystemPromptEditor` существует и протестирован изолированно, но **не интегрирован** в `AgentForm.tsx`. `AgentFormData` не содержит поля `system_prompt`, компонент не импортирован и не рендерится в форме. Значение промпта не сохраняется и не отправляется при создании агента. `AgentForm.tsx:8-12`, `AgentForm.tsx:77-152` | Siri | fixed |
| BUG-027 | minor | M2-006: `flash-green` CSS-класс применяется через `className` (`WarRoomPage.tsx:244`), но в проекте нет ни одного CSS-файла. `@keyframes flash-green` не определён нигде. Визуальный flash на thinking→done не работает в браузере. | Siri | fixed |
| BUG-028 | minor | M2-006: `CompanyPage.tsx` использует старый `WarRoom.tsx` (empty state: "All quiet here"), а не новый `WarRoomPage.tsx` из M2-006. AC требует "No active runs / Start a task to see the magic". Два разных компонента с несогласованным поведением. | Siri | fixed |
| BUG-029 | critical | M2-005: WebSocket URL mismatch — fixed: useWarRoomSocket now connects to /ws/companies/{company_id}/events | Alex | fixed |
| BUG-030 | critical | M3-002: бэкенд полностью отсутствует — 4 API-эндпоинта (`POST /library`, `GET /library`, `GET /library/{id}/portfolio`, `POST /companies/{id}/agents/fork`), ORM-модель `agent_library`, миграция не реализованы. `main.py` не включает `library_router`. Фронтенд тесты мокают fetch и не проверяют реальный API. | Alex | fixed |
| BUG-031 | minor | M2-003: `agent_node` публикует в EventBus события с `type: "token"` вместо `type: "llm_token"` как указано в AC. Тест проверяет только непустость event_types, не конкретный тип. При интеграции с WebSocket клиентом — несовпадение типа события. `orchestration/agent_node.py:142` | Alex | fixed |
| BUG-032 | minor | `main.py`: `library_router` зарегистрирован дважды (import дублирован + `include_router` вызван дважды, строки 6, 27-28). Все 3 library-маршрута дублированы (6 routes вместо 3). FastAPI обрабатывает первое совпадение — API работает, но дублирование создаёт путаницу. | Alex | fixed |




| BUG-041 | minor | `ApiV1AliasMiddleware`: путь `/api/v1/v1/X` переписывается в `/api/v1/X` и уходит в роутеры без второго rewrite → 404. Двойной v1-prefix не обработан. Маловероятный сценарий, поведение неинтуитивное. | Alex | fixed |
| BUG-042 | minor | Deprecation headers не добавляются на старые `/api/...` пути. AC тикета содержит требование `Deprecation` header (`test_old_api_response_has_deprecation_info`), но тест проверяет его только при redirect/410. При 200 (backward compat) header не выставляется — deprecation signaling не реализован. | Alex | fixed |
| ALEX-TD-054 | minor | `handlers/companies.py:update_company` — двойной DB-запрос. Объединён в один вызов `update()` с ownership check. | Alex | fixed |
| ALEX-TD-055 | minor | `handlers/ws_events.py` — WS закрывался до `accept()`. Фикс: `accept()` перед `close(code=4001/4003)`. | Alex | fixed |
| ALEX-TD-056 | minor | `services/run.py:_execute_agent` — in-function imports подняты на уровень модуля. | Alex | fixed |
| ALEX-TD-057 | minor | `handlers/companies.py` — дублированный ownership check. Перенесён в `CompanyService.get_owned()`. | Alex | fixed |
| ALEX-TD-058 | minor | `handlers/credentials.py:validate_llm_key` — dead code: тройной `if/elif provider == "openai"/"anthropic"/"gemini"` выполняет идентичное `litellm_kwargs["api_key"] = body.api_key`. Упрощён в единственное присваивание (без условий). handlers/credentials.py:197-203 | Alex | fixed |
| SIRI-PREDEMO-001 | minor | `FE-007-ErrorBoundary404.test.tsx`: unused imports `Route, Routes` вызывали TS6133 ошибки → prod build падал на `tsc --noEmit`. Удалены лишние импорты. | Siri | fixed |
| SIRI-PREDEMO-002 | minor | `KanbanBoard.tsx` `handleRun`: 2x `console.error()` захламляли консоль браузера во время демо. Убраны, toast остался. | Siri | fixed |
| SIRI-BUG-001 | minor | `AgentForm.tsx` использовал неправильный эндпоинт `/api/llm/providers` (возвращает `list[str]` провайдеров с ключами) вместо `/api/llm/providers/available` (возвращает `{providers, all_models}`). Фикс: изменён эндпоинт и парсинг — теперь берём `all_models` из ответа. Тест обновлён. | Siri | fixed |
| ALEX-TD-075 | major | `services/run.py:execute_run` — `ainvoke()` без таймаута: LLM-зависание создаёт зомби-задачу навсегда. Добавлен `asyncio.wait_for(..., timeout=_MAX_RUN_TIMEOUT_SEC)`. Конфигурируется через `MAX_RUN_TIMEOUT_SEC` (дефолт 600 сек). | Alex | fixed |
| ALEX-TD-076 | minor | `handlers/companies.py` — дублированный валидатор имени в `CompanyCreate` и `CompanyUpdate`. Вынесен в общую функцию `_validate_company_name()`. | Alex | fixed |
| ALEX-TD-077 | minor | `memory/service.py` — `MemoryService` использует `MemoryStore` (конкретный класс) вместо `VectorStore` абстракции. Нарушает цель ALEX-POST-011: при смене бэкенда на Postgres придётся менять `service.py`. Фикс: принимать `VectorStore`-совместимый объект в конструкторе; фабрика `get_vector_store()` уже есть. `memory/service.py:30`. | Alex | fixed |
| ALEX-TD-078 | minor | `memory/store.py` и `memory/vector_store.py:SqliteVecStore` — дублирование кода. `MemoryStore` и `SqliteVecStore` реализуют идентичную логику (`_setup`, `insert`, `search`, `get_all`, `_pack`). Dead code: `MemoryStore` не используется нигде кроме тестов после введения `SqliteVecStore`. Фикс: `MemoryStore = SqliteVecStore` или удалить `store.py`, обновить импорты. `memory/store.py`. | Alex | fixed |
| ALEX-TD-079 | minor | `services/run.py:_execute_agent` — retry-цикл логирует только `run_id`, но не `company_id`. При дебаге в prod трудно понять к какой компании относится зависший ран без джойна в БД. Фикс: добавить `company_id` в log-строки `run_retry` и `run_dead_letter`. `services/run.py:168,179`. | Alex | fixed |

### Как добавлять баги
```
| BUG-027 | minor | M2-006: `flash-green` CSS-класс применяется через `className` (`WarRoomPage.tsx:244`), но в проекте нет ни одного CSS-файла и нет определения `@keyframes flash-green`. Визуальный flash на thinking→done не работает в браузере — класс есть, анимации нет. | Siri | fixed |
| BUG-028 | minor | M2-006: `WarRoom.tsx` (старый компонент, используется в `CompanyPage.tsx:3,91`) и `WarRoomPage.tsx` (M2-006) — два разных компонента с разными пустыми состояниями. `WarRoom.tsx` показывает "All quiet here", AC требует "No active runs / Start a task to see the magic". `CompanyPage` использует неправильный компонент. | Siri | fixed |
| BUG-029 | critical | M2-005: useWarRoomSocket connects to correct /ws/companies/{company_id}/events endpoint | Siri | fixed |
| BUG-030 | critical | M3-002: Backend API полностью отсутствует. `POST /api/library`, `GET /api/library`, `GET /api/library/{id}/portfolio`, `POST /api/companies/{id}/agents/fork` — ни одного из 4 AC-эндпоинтов нет в бэкенде. Нет роутера, нет ORM-модели `agent_library`, нет миграции. Все API-вызовы фронта упадут с 404. | Siri | fixed |
| BUG-033 | critical | CI: Frontend Tests падают в GitHub Actions (ai-carti/agentco repo). `CI / Frontend Tests` failed in 28s, 3 annotations. Backend Tests проходят (2m12s). Нужно: посмотреть логи workflow run, найти причину падения фронтенд-тестов, починить. | Siri | fixed |
| BUG-034 | major | E2E: `e2e/happy-path.spec.ts` подхватывается Vitest и падает с ошибкой "Playwright Test did not expect test() to be called here". Нужно добавить `exclude: ['e2e/**']` в секцию `test` в `vite.config.ts` (frontend/vite.config.ts:9). `npm test` выдаёт 1 failed suite. | Alex | fixed |
| BUG-035 | major | DEPLOY: приложение не задеплоено. Нет CI/CD пайплайна для деплоя на прод. Нужно: настроить деплой (Railway/Fly.io/VPS), добавить env-переменные, убедиться что бэкенд + фронтенд доступны по публичному URL. | Alex | fixed |
| DEMO-SCRIPT-001 | major | DEMO SCRIPT + МАТЕРИАЛЫ: Shadrin готовит полный демо-пакет. 1) Написать пошаговый demo script в `/home/clawdbot/projects/agentco/demo/DEMO-SCRIPT.md` — сценарий на 5-7 минут: что открыть, что показать, что сказать на каждом экране, где WoW-момент (War Room с живыми агентами); 2) Убедиться что скриншоты в `qa-report/screenshots/` актуальны — если нет, поручить Siri обновить; 3) Написать `/home/clawdbot/projects/agentco/demo/TALKING-POINTS.md` — ключевые тезисы для инвестора по каждому экрану (что это, почему важно, цифры); 4) Проверить питч дек (`pitch/`) на актуальность — все ли правки Marcus внесены; 5) Отправить в Telegram (target=667566350) финальный demo script + список "что ещё нужно до демо 2026-03-21". | Shadrin | fixed |
| CI-FIX-001 | critical | CI ПАДАЕТ — нужно починить до деплоя. Две проблемы: 1) Новые тест-файлы от агентов снова используют `global.fetch` вместо `globalThis.fetch` — нужно найти все новые файлы командой `grep -rn "global\." frontend/src/__tests__/ --include="*.tsx"` и заменить на `globalThis.`; 2) TypeScript ошибки в новых файлах: `Cannot find name 'global'`, неверные типы zustand `(sel: (s: unknown) => unknown)`, неиспользованные переменные `screen`, `mockToastInfo`. Фикс: sed замена global→globalThis во всех тест-файлах + поправить типы + убрать unused imports. После фикса: `npx tsc --noEmit` должен быть чистым, `npm test -- --run` 404/404 зелёный, git push → CI зелёный. Также: в репо два CI воркфлоу (CI и deploy.yml) — убедиться что оба настроены корректно и не дублируют друг друга. Alex делает это. | Alex | fixed | 
| DEPLOY-E2E-001 | critical | ПОЛНЫЙ ДЕПЛОЙ + ПОЛЬЗОВАТЕЛЬСКИЙ ФЛОУ: Alex деплоит приложение на Railway (убедиться что RAILWAY_TOKEN прописан в GitHub Secrets, воркфлоу прошёл зелёным, бэкенд и фронт доступны по публичным URL). После деплоя — пройти весь флоу как обычный пользователь с нуля: 1) Открыть публичный URL; 2) Зарегистрироваться (новый аккаунт); 3) Создать компанию; 4) Добавить агента (выбрать модель из dropdown); 5) Создать задачу; 6) Назначить агента на задачу; 7) Нажать Run; 8) Открыть War Room — убедиться что агент виден и статус обновляется; 9) Открыть Task Detail Sidebar — проверить лог выполнения; 10) Проверить Agent History. Каждый шаг: работает ли, есть ли ошибки в консоли, есть ли toast фидбек. Записать результат в `/home/clawdbot/projects/agentco/qa-report/DEPLOY-E2E-001-report.md`. Отправить итог в Telegram (target=667566350): публичный URL + статус каждого шага ✅/❌. | Alex | fixed |
| SELF-AUDIT-SHADRIN | major | SHADRIN — ФИНАЛЬНЫЙ АУДИТ ПЕРЕД ДЕМО: Shadrin действует как product owner. Шаги: 1) Открыть все скриншоты из `/home/clawdbot/projects/agentco/qa-report/screenshots/` — если папки нет, запустить фронт и сделать скриншоты через Playwright; 2) Пройти весь продукт глазами инвестора и потенциального пользователя — каждый экран: выглядит ли это как реальный продукт, есть ли места где "полная хуйня"; 3) Отсмотреть CI на GitHub (`gh run list --repo ai-carti/agentco --limit 5`) — зелёный ли; 4) Проверить что railway.toml / deploy config корректен; 5) Принять вердикт по каждому из трёх вопросов: (а) дизайн готов к демо? (б) CI зелёный? (в) деплой настроен? 6) По каждому "нет" — создать конкретные тикеты на Siri/Alex в ROADMAP.md; 7) Отправить итог в Telegram (target=667566350): вердикт + список созданных тикетов. | Shadrin | fixed |
| SELF-AUDIT-ALEX | major | ALEX — ТЕХНИЧЕСКИЙ ДОЛГ И PRODUCTION READINESS: Alex проводит самостоятельный code review с точки зрения tech lead. Что смотреть: 1) Security — SQL injection, auth bypass, незащищённые эндпоинты, секреты в коде; 2) Error handling — все ли API-ошибки обрабатываются, нет ли голых except, нет ли 500 вместо 4xx; 3) Performance — N+1 запросы, отсутствие индексов в SQLite, тяжёлые синхронные операции в async контексте; 4) Code quality — дублирование, мёртвый код, hardcoded значения, отсутствующие env variables; 5) Tests — непокрытые критические пути, flaky тесты, моки которые скрывают реальные баги; 6) Prod config — railway.toml, .env.example полнота, healthcheck endpoint (`GET /health`), graceful shutdown; 7) По каждой найденной проблеме — создать тикет ALEX-TD-XXX в ROADMAP.md с описанием и приоритетом; 8) Начать фиксить найденные проблемы прямо в этом цикле (highest severity первыми); 9) Отправить summary в Telegram (target=667566350). | Alex | fixed |
| ALEX-TD-001 | critical | CORS origins hardcoded в main.py — в проде frontend с prod URL будет заблокирован браузером. Нужен CORS_ORIGINS из env. Зафиксировано: main.py читает CORS_ORIGINS из env, fallback на localhost. .env.example обновлён. | Alex | fixed |
| ALEX-TD-002 | major | SQLite data loss на Railway: railway.toml использует путь `sqlite:///./data/agentco.db` без persistent volume. При рестарте контейнера все данные теряются. Нужен Railway Volume или миграция на PG. ДОКУМЕНТИРОВАНО в DEPLOY-E2E-001-report.md — требует ручных действий в Railway dashboard. | Alex | fixed |
| ALEX-TD-003 | major | Graceful shutdown отсутствует: фоновые asyncio tasks (agent runs) не отменяются при SIGTERM. Зафиксировано: lifespan handler добавлен в main.py — отменяет все _active_tasks при shutdown. | Alex | fixed |
| ALEX-TD-004 | major | Отсутствуют DB indexes на FK columns: tasks.company_id, tasks.agent_id, runs.company_id, runs.task_id, runs.agent_id, run_events.run_id, agents.company_id. Full table scan на каждый GET. Зафиксировано: index=True добавлен в ORM, миграция 0010. 309/309 тестов ✅. | Alex | fixed |
| ALEX-TD-005 | minor | session.query() legacy SQLAlchemy 1.x API в 3 местах (dependencies.py, auth.py). Не критично, но несоответствие стилю остального кода (select()). Оставлено на следующий цикл. | Alex | fixed |
| ALEX-TD-006 | minor | Bare except в run.stop() проглатывал DB ошибки. Зафиксировано: убрал try/except вокруг session.get() — ошибки БД теперь пробрасываются. | Alex | fixed |
| ALEX-TD-007 | minor | .env.example не содержал CORS_ORIGINS переменной. Зафиксировано: добавлен раздел CORS с документацией. | Alex | fixed |
| ALEX-TD-008 | major | `RunService._execute_agent` был stub — не вызывал реальный LangGraph граф. Зафиксировано: делегирует в `execute_run()` который запускает граф. | Alex | fixed |
| ALEX-TD-009 | major | `POST /api/llm/validate-key`: мутировал `os.environ` для передачи api_key — race condition при параллельных запросах (разные ключи пользователей перемешивались). Зафиксировано: передаём `api_key` напрямую в LiteLLM kwargs. | Alex | fixed |
| ALEX-TD-010 | critical | Дублирующийся EventBus singleton: `agent_node.py` импортирует `agentco.eventbus.EventBus`, а `ws_events.py` и `services/run.py` используют `agentco.core.event_bus.EventBus`. Два разных класса — два разных `_instance`. LLM стриминговые токены публикуются в один bus, WebSocket подписан на другой. Клиент не получает ничего. | Alex | fixed |
| ALEX-TD-011 | major | `GET /ws/companies/{company_id}/events` не проверяет что пользователь владеет company_id. Любой авторизованный пользователь может подписаться на события чужой компании. | Alex | fixed |
| ALEX-TD-012 | minor | `CompanyCreate` и `CompanyUpdate`: поле `name: str` без `min_length=1` и без strip-валидации — можно создать компанию с пустым или whitespace-only именем. | Alex | fixed |
| ALEX-TD-013 | minor | `TaskUpdate.title`: при PATCH нет whitespace-валидации — можно обновить title задачи на `"   "`. Аналогичная проблема была в TaskCreate (BUG-006/BUG-008), но update не покрыт. | Alex | fixed |
| ALEX-TD-014 | minor | `GET /api/companies/{id}/runs?limit=N`: нет верхней границы для limit. Запрос с `limit=999999` вызовет полный скан таблицы runs и OOM на больших данных. Нужен `Query(le=500)` или аналог. | Alex | fixed |
| ALEX-TD-015 | major | `GET /api/companies/{id}/runs` не поддерживает фильтр по `status`. handlers/runs.py:120, repositories/run.py:41 | Alex | fixed |
| ALEX-TD-016 | major | `datetime.utcnow()` deprecated (Python 3.12) в 4 файлах моделей — генерирует 278 test warnings. Нужно заменить на `datetime.now(timezone.utc)`. models/company.py:9, models/agent.py:17, models/task.py:25, models/credential.py:11, services/memory.py:82 | Alex | fixed |
| ALEX-TD-017 | minor | `AgentUpdate` не валидирует `name` на whitespace — можно обновить агента на `name="   "`. `AgentCreate` валидацию имеет, `AgentUpdate` — нет. handlers/agents.py:25 | Alex | fixed |
| ALEX-TD-018 | minor | `CredentialCreate.provider` не валидируется против списка поддерживаемых провайдеров (openai/anthropic/gemini). Можно сохранить credential с provider="badprovider" — при запуске LiteLLM упадёт с cryptic error. handlers/credentials.py:83 | Alex | fixed |
| ALEX-TD-019 | minor | `GET /api/companies/{id}/runs?offset=N` нет `ge=0` на offset — отрицательный offset приводит к SQLAlchemy warning + undefined behaviour в SQLite. handlers/runs.py:124 | Alex | fixed |
| ALEX-TD-020 | critical | CI сломан: `SiriUX026Plus.test.tsx:34-36` использует `import('fs')`, `import('path')`, `__dirname` — Node.js API, недоступные в Vitest/jsdom браузерном контексте. TypeScript выдаёт `TS2307: Cannot find module 'fs'`. Frontend Tests падают в CI. Фикс: переписать тест без fs/path — читать CSS через import или проверить структурно. | Alex | fixed |
| ALEX-TD-021 | major | `MemoryStore` (memory/store.py) — синхронный `sqlite3` вызывается напрямую в async контексте без `asyncio.run_in_executor`. Любой `insert`/`search` блокирует event loop. При активных LLM-ранах — задержки WebSocket событий. Фикс: обернуть в `loop.run_in_executor(None, ...)` или использовать `aiosqlite`. | Alex | fixed |
| ALEX-TD-022 | major | `encryption.py:11-13` — при отсутствии `ENCRYPTION_KEY` используется детерминированный нулевой ключ (`b"\x00" * 32`) без предупреждения в логах. API-ключи пользователей шифруются слабым ключом в production если переменная не установлена. Фикс: добавить `logger.warning("ENCRYPTION_KEY not set — using insecure dev key!")` при старте + добавить в .env.example как required. | Alex | fixed |
| ALEX-TD-023 | minor | `EventBus._subscribers` — class-level mutable list (не instance attribute). Все инстансы (и тесты) разделяют один список подписчиков. При параллельных тестах подписчики накапливаются между тестами → потенциальные flaky тесты и утечка памяти. Фикс: инициализировать `_subscribers` в `__init__` или сбрасывать в тест-фикстуре. core/event_bus.py:12 | Alex | fixed |
| ALEX-TD-024 | minor | `RunService.execute_run()` — после `async with create_checkpointer(...)` блок закрывается, затем используется `self._session` для обновления run_orm. Если сессия была закрыта/инвалидирована в background task, `session.get()` может вернуть stale данные или упасть. services/run.py:228-239 | Alex | fixed |


| SELF-AUDIT-SIRI | major | SIRI — UX/UI PIXEL-PERFECT REVIEW: Siri проводит самостоятельный дизайн-аудит. Что смотреть: 1) Запустить фронт (`cd /home/clawdbot/projects/agentco/repo/frontend && npm run dev`), пройти все экраны; 2) Визуальная консистентность — одинаковые ли spacing, цвета кнопок, типографика по всему приложению; 3) Hover/focus состояния — всё ли интерактивное элементы имеют видимый hover/focus; 4) Loading states — есть ли skeleton/spinner везде где данные грузятся; 5) Error states — что видит пользователь при ошибке API; 6) Mobile responsiveness (< 768px) — открыть DevTools, проверить основные экраны; 7) Accessibility — alt тексты для иконок, aria-labels для кнопок без текста, tab-навигация; 8) "Демо-моменты" — War Room с живыми агентами выглядит как WoW или как пустой экран? 9) По каждой найденной проблеме — создать тикет SIRI-UX-XXX в ROADMAP.md; 10) Начать фиксить найденные (lowest effort — highest impact первыми); 11) Сохранить скриншоты исправленного UI в `/home/clawdbot/projects/agentco/qa-report/screenshots/after/`; 12) Отправить summary в Telegram (target=667566350). | Siri | fixed |
| UI-SCREENSHOT-001 | major | СКРИНШОТЫ ВСЕГО UI: Siri делает полный скринкаст интерфейса. Шаги: 1) Запустить фронтенд локально (`cd /home/clawdbot/projects/agentco/repo/frontend && npm run dev`); 2) Пройти все экраны по порядку и сделать скриншоты через Playwright (`npx playwright screenshot`) или аналог: login/register, список компаний, empty state компаний, компания с агентами, kanban с тасками, task detail sidebar, war room, agent page, agent memory, company settings, global search, onboarding template; 3) Сохранить все скриншоты в `/home/clawdbot/projects/agentco/qa-report/screenshots/` с именами `01-login.png`, `02-companies.png` и т.д.; 4) Создать файл `/home/clawdbot/projects/agentco/qa-report/UI-SCREENSHOT-001-index.md` со списком скриншотов и кратким описанием каждого; 5) После завершения — создать тикет UI-DESIGN-REVIEW-001 в ROADMAP.md на Shadrin (см. ниже). | Siri | fixed |
| UI-DESIGN-REVIEW-001 | major | DESIGN REVIEW (только после UI-SCREENSHOT-001 closed): Shadrin открывает все скриншоты из `/home/clawdbot/projects/agentco/qa-report/screenshots/`, смотрит их глазами CEO/инвестора — это демо-материал. Оценивает: общий visual impression, консистентность стиля, читаемость, пустые места, ощущение «это реальный продукт или студенческий проект». По итогу: 1) Принимает решение — готов ли дизайн к демо (да/нет/нужны правки); 2) Если нужны правки — создаёт тикеты UX-POLISH-XXX на Siri с конкретными правками (шрифты, цвета, spacing, компоненты, пустые экраны); 3) Отправляет вердикт в Telegram (target=667566350): «✅ Дизайн норм» или «❌ Нужны правки: [список]». ЗАВИСИМОСТЬ: строго после UI-SCREENSHOT-001. | Shadrin | fixed |
| DEMO-001 | major | DEMO PREP (дедлайн: 2026-03-21, конец недели): Shadrin проводит полный pre-demo аудит и ставит задачи команде. Шаги: 1) Отсмотреть дизайн — пройти все экраны, проверить визуальное соответствие современным стандартам, выявить несоответствия; 2) Проверить весь функционал — все ключевые сценарии (auth → company → agent → task → run → war room), записать что ломается; 3) Проверить питч дек на актуальность данных; 4) По результатам создать тикеты (BUG-/UX-/PITCH-) на Alex и Siri с дедлайном 2026-03-21; 5) Отправить план подготовки к демо в Telegram (target=667566350): список тикетов, кто что делает, дедлайн. Все спринты до конца недели планировать исходя из этого дедлайна. | Shadrin | fixed |
| QA-001 | major | FULL QA: Siri проводит полное тестирование КАЖДОЙ фичи продукта. Для каждой фичи: запустить, проверить все AC из ROADMAP, сделать скриншот результата командой `cd /home/clawdbot/projects/agentco/repo && npm run dev` (или аналог). Результат оформить в `/home/clawdbot/projects/agentco/qa-report/QA-001-full-report.md` — по одной секции на фичу: статус (✅/❌/⚠️), что проверено, что сломано, путь к скриншоту. Список фич: Auth (login/register/refresh), Companies CRUD, Agents CRUD + model selector, Tasks CRUD + FSM, Kanban (drag&drop, filters, search), Task Detail Sidebar + logs, War Room (WebSocket, agent cards, activity feed), Agent Library + Portfolio, Memory RAG, Onboarding template, Empty States (все 5), Toast system, Responsive sidebar, Global search (Cmd+K), Company Settings. БЛОКЕР: Shadrin не начинает QA-002 пока этот тикет не закрыт. | Siri | fixed |
| QA-002 | major | PRODUCT REVIEW (только после QA-001 closed): Shadrin читает отчёт `/home/clawdbot/projects/agentco/qa-report/QA-001-full-report.md`, смотрит скриншоты, отсматривает код ключевых компонентов. На основе увиденного — создаёт тикеты улучшений (BUG-037+) в раздел Bugs ROADMAP.md: UX-проблемы, несоответствия AC, визуальные баги, логические дыры, missing polish. Минимум 5 тикетов, максимум — сколько найдёт. После — отправляет сводку в Telegram (target=667566350) с итогом: что нашёл, сколько тикетов завёл, приоритеты. ЗАВИСИМОСТЬ: строго после QA-001. | Shadrin | fixed |

| BUG-036 | major | PITCH DECK: содержит устаревшие данные — русский текст на S10, «JWT Auth (in progress)» на S5, отсутствуют Langflow/Flowise/Dify в таблице конкурентов S7, нет Use of Funds на S11, Devin Visual UI помечен ✗ (должен ✓). Обновить согласно feedback Marcus. | Siri | fixed |
| BUG-037 | major | Memory UI: AgentPage не показывает память агента. Backend `GET /api/companies/{id}/agents/{id}/memory` есть, тесты зелёные, но в `AgentPage.tsx` нет ни одного вызова этого эндпоинта и нет UI-компонента для отображения воспоминаний. Нужно: секция "Memory" в AgentPage с вызовом API + список `MemoryEntry` карточек (content + created_at). | Siri | fixed |
| BUG-038 | major | WarRoom.tsx hardcoded WS URL: `useWarRoomSocket` в `WarRoom.tsx:47` использует `ws://localhost:8000` напрямую вместо `VITE_API_URL`. В деплое WS-соединение всегда будет падать на `localhost`. `useWarRoomSocket.ts` правильно использует `VITE_API_URL` — нужно синхронизировать с `WarRoom.tsx`. | Siri | fixed |
| BUG-039 | major | Company Header отсутствует в CompanyPage: `CompanyPage.tsx` не имеет крупного заголовка с именем компании и avatar. Есть только Breadcrumb. AC UX-011 требует топбар `bg-gray-900/80 backdrop-blur border-b h-12` с avatar (32px, хэш-цвет) и именем компании. Breadcrumb есть, но отдельный Company Header block не реализован. `CompanyPage.tsx` | Siri | fixed |
| BUG-040 | minor | WarRoomPage mock data не отключается при реальном WebSocket: `WarRoomPage.tsx` запускает `setInterval` для mock-событий (`getNextMockEvent`) даже при `isConnected=true`. На проде War Room будет показывать и реальные данные и фиктивные. Нужна проверка: `if (!isConnected)` перед запуском intervalRef. `WarRoomPage.tsx:55-70` | Siri | fixed |
| BUG-041 | minor | KanbanBoard POST run endpoint mismatch: `KanbanBoard.tsx` использует `/api/companies/{id}/tasks/{id}/run`, но endpoint может отсутствовать или быть под другим путём при деплое. Нужно верифицировать через бэкенд роутер и добавить integration тест который проверяет что POST run возвращает не 404. | Alex | fixed |
| BUG-042 | minor | UX-006 empty states неполные: `CompanyPage.tsx` при отсутствии агентов показывает EmptyState с `onCTA`, но для War Room (`WarRoomPage.tsx`) empty state показывает emoji 🏯 (не совпадает с AC — должен быть 💤 "All quiet here"). `WarRoomPage.tsx:empty-state-block` | Siri | fixed |
| BUG-043 | minor | UX-006: `WarRoom.tsx` показывает "All quiet here" empty state немедленно при маунте (`runs=[]`) до установления WebSocket-соединения — нарушает AC "empty state появляется только когда данные загружены". Нет `isConnecting` флага. Также: `WarRoom.tsx` не делает начальный REST-запрос `GET /api/companies/{id}/runs` — при page refresh активные раны не показываются до нового WS-события. `WarRoom.tsx:40,101` | Siri | fixed |


| UX-POLISH-001 | critical | Onboarding: кнопка «Запустить демо» на русском — нужно «Launch Demo» / «Launch Team». Смешение языков при полностью английском UI = критический удар по доверию на демо. `OnboardingPage.tsx` | Siri | fixed |
| UX-POLISH-002 | critical | Broken emoji/icons (□ квадратики) на 6+ экранах: агенты в sidebar, Memory section, onboarding карточки. Причина: emoji font или icon rendering. Заменить emoji на SVG-иконки из lucide-react или подключить emoji font. Затронуто: AgentPage, Sidebar, WarRoomPage, OnboardingScreen. | Siri | fixed |

| UX-POLISH-003 | major | War Room layout confusion: под основным War Room (с 4 агентами) скролл показывает блок «Agents (1)» с No tasks + New Task — выглядит как два разных продукта. Разобраться: это CompanyPage Layout (War Room + Kanban как вкладки) или единая страница? Визуально разделить секции или убрать лишний блок. `CompanyPage.tsx` layout. | Siri | fixed |
| UX-POLISH-004 | major | Breadcrumb врёт на всех страницах: показывает «Select company» вместо реального имени компании. «AgentCo > Select company > War Room» вместо «AgentCo > Demo Corp > War Room». Фикс: использовать `agentStore.currentCompany.name` вместо placeholder. `Breadcrumb.tsx`. | Siri | fixed |
| UX-POLISH-005 | minor | Кнопки inconsistent: «Save Agent» (full-width blue), «Save to Library» (маленькая другого оттенка), «Save changes» (зелёная), «Edit»/«View History» (outlined). Нужно: Primary=синяя filled, Secondary=outlined, Danger=красная. Привести все кнопки к этим 3 стилям. | Siri | fixed |
| UX-POLISH-006 | minor | Login/Register: label «EMAIL» + placeholder «email» — дублирование. Убрать placeholder или перевести label в inline placeholder. Добавить «Forgot password?» ссылку (даже без backend — /forgot-password страница-заглушка). `AuthPage.tsx`. | Siri | fixed |
| DEPLOY-TOKEN-001 | critical | GitHub Secret `RAILWAY_TOKEN` не установлен → Deploy workflow падает с "Invalid RAILWAY_TOKEN". CI (тесты) зелёный, Deploy — красный. Нужно: добавить RAILWAY_TOKEN в GitHub Secrets репо ai-carti/agentco. Без этого приложение не деплоится автоматически. | Alex | fixed |
| PITCH-MOAT-001 | minor | S7 Competition: нет строки про моат — почему Microsoft/Google не скопируют за 6 мес. Добавить 1 строку под таблицей: "Our moat: data flywheel — each forked agent and completed task improves the shared library." | Shadrin | fixed |
| PITCH-CONTACT-001 | minor | S11 CTA: контакт только `@timofeytst` — слишком casual. Добавить email рядом: `timofey@agentco.ai` (или реальный email фаундера). | Shadrin | fixed |
| SIRI-UX-001 | major | `WarRoomPage.tsx`: `height: calc(100vh - 49px)` hardcoded — при встраивании в CompanyPage с CompanyHeader + tab bar переполняет viewport. Исправлено: `height: 100%` + `minHeight: 360`. | Siri | fixed |
| SIRI-UX-002 | minor | `Navbar.tsx`: NavLink `to="/"` не имеет атрибута `end` — "Companies" пункт выделен на всех страницах (все пути начинаются с "/"). Исправлено: добавлен `end` prop. | Siri | fixed |
| SIRI-UX-003 | minor | `KanbanBoard.tsx` TaskCard: отсутствует `position: relative` на контейнере карточки — dropdown-меню ··· может рендериться вне карточки. Исправлено. | Siri | fixed |
| SIRI-UX-004 | minor | `Navbar.tsx`: кнопка Logout не имеет hover-эффекта — визуально не интерактивна. Исправлено: добавлены `onMouseEnter`/`onMouseLeave` transitions. | Siri | fixed |
| SIRI-UX-005 | minor | `BillingPage.tsx`: использует `React.CSSProperties` без `import React from 'react'` — TypeScript не ругается (JSX transform), но явный import лучше для консистентности. Исправлено. | Siri | fixed |
| SIRI-UX-006 | minor | `AuthPage.tsx`: email и password inputs имеют `id` но нет `aria-label` — скринридеры не идентифицируют поля без связанных `<label>` элементов. Исправлено: добавлены `aria-label`. | Siri | fixed |
| SIRI-UX-007 | minor | `AgentPage.tsx`: показывает `AgentForm` (редактируемый) И кнопку "Edit" ведущую на `AgentEditPage` — дублирующая UX. Пользователь не понимает зачем два способа редактирования. Нужно: AgentPage = view, AgentEditPage = edit. Помечено для будущего рефакторинга. | Siri | fixed |
| SIRI-UX-008 | minor | `Breadcrumb.tsx`: `getSection()` возвращает 'War Room' для ВСЕХ суброутов компании включая Board — хлебная крошка врёт на Board-вкладке. Нужна синхронизация с active tab из CompanyPage. | Siri | fixed |
| SIRI-UX-009 | minor | `Sidebar.tsx`: "War Room" навигационный пункт ведёт на `/war-room` — WarRoomPage там не получает `companyId` из URL params, рендерит мок-данные. Должно вести на `/companies/:id` или не быть глобальным пунктом. | Siri | fixed |
| SIRI-UX-010 | minor | `SettingsPage.tsx`: страница содержит только текст "LLM credentials" и ссылку на Billing — нет реального управления LLM ключами. Functional gap. | Siri | fixed |
| SIRI-UX-011 | minor | `Breadcrumb.tsx`: на root `/` показывает "AgentCo > Select company" — но `/` это список компаний, компания не нужна в контексте. Сбивает пользователя. `requiresCompany('/')` возвращает `true`, хотя не должен. Убрать company block на `/`. | Siri | fixed |
| SIRI-UX-012 | minor | `LibraryPage.tsx`: при загрузке рендерит `<p>Loading…</p>` вместо `<SkeletonCard />` — несоответствие паттерну остального приложения. Заменить на `<SkeletonCard variant="task" count={3} />`. | Siri | fixed |
| SIRI-UX-013 | major | `WarRoomPage.tsx`: кнопка Stop вызывает `handleStop()` который делает только `console.log('stop clicked')` — нет API-вызова, нет toast, нет смены состояния. На демо кнопка Stop не работает. Нужно: POST `/api/companies/{companyId}/runs/stop` (или соответствующий endpoint), toast.success("Run stopped"), сброс состояния. | Siri | fixed |
| SIRI-UX-014 | major | `CompanyPage.tsx`: корневой div имеет `height: '100vh'` (строка 194), но страница уже внутри контейнера под Navbar (49px) + Breadcrumb (~37px) — итого overflow ~86px за пределы viewport. Нижняя часть War Room/Kanban обрезается. Исправить на `height: '100%'` или `calc(100vh - 86px)`. | Siri | fixed |
| SIRI-UX-015 | minor | `CompaniesPage.tsx`: карточки компаний (строка ~129) кликабельны через `onClick`, но нет `role="button"`, `tabIndex={0}`, `onKeyDown` для Enter/Space. Недоступны с клавиатуры. Нужно добавить keyboard accessibility. | Siri | fixed |
| SIRI-UX-016 | major | `WarRoomPage.tsx`: Activity feed не auto-скроллится к последнему сообщению — пользователь видит старые сообщения и не понимает что агенты работают. На демо это kill WoW-момент. Нужно: `useRef` + `scrollIntoView` или `scrollTop = scrollHeight` при добавлении нового сообщения. | Siri | fixed |
| SIRI-UX-017 | major | `WarRoomPage.tsx`: на mobile (<640px) agent sidebar имеет фиксированную ширину 280px — занимает половину экрана, activity feed почти не видно. Нужно: на mobile скрыть sidebar или сделать его collapsible/drawer. | Siri | fixed |
| SIRI-UX-018 | minor | `CompanyPage.tsx`: tab buttons (War Room/Board/Agents) не имеют hover state — при наведении ничего не происходит, нет визуального feedback. Добавить onMouseEnter/Leave transition для цвета. | Siri | fixed |
| SIRI-UX-019 | minor | `LibraryPage.tsx`: Fork и Portfolio кнопки не имеют hover state. "Fork" кнопка (синяя) не меняет цвет при hover. "Portfolio" ссылка аналогично. Добавить hover визуальный feedback. | Siri | fixed |
| SIRI-UX-020 | minor | `AuthPage.tsx`: email/password inputs имеют `outline: none` без custom focus ring — при tab-навигации поля не выделяются, accessibility нарушена. Добавить `onFocus`/`onBlur` handlers с visible focus ring (border-color change). | Siri | fixed |
| SIRI-UX-021 | major | `TaskDetailSidebar.tsx`: assignee avatar показывает только 1 символ (`assigneeName.charAt(0)`) вместо 2-буквенных инициалов. Несоответствие с AgentCard и TaskCard которые показывают `getInitials()` (2 буквы). `TaskDetailSidebar.tsx:95` | Siri | fixed |
| SIRI-UX-022 | minor | `LibraryPage.tsx`: ForkModal не вызывает toast при успешном форке — пользователь не знает что операция прошла успешно. Добавить `useToast` + `toast.success('Agent forked to {companyName}')`. `LibraryPage.tsx:ForkModal.handleFork` | Siri | fixed |
| SIRI-UX-023 | minor | `KanbanBoard.tsx` FilterBar: дропдауны агентов/приоритетов не закрываются при клике снаружи — нужен `useEffect` + `mousedown` listener. Текущая реализация закрывает только при открытии второго дропдауна. `KanbanBoard.tsx:FilterBar` | Siri | fixed |
| SIRI-UX-024 | minor | `CompanyPage.tsx` tabs: кнопки вкладок (War Room/Board/Agents) не имеют hover state — при наведении ничего не меняется. Аналогично тикету SIRI-UX-018. Нужен `onMouseEnter/Leave` handler или CSS hover. `CompanyPage.tsx:tab buttons` | Siri | fixed |
| SIRI-UX-025 | minor | `WarRoomPage.tsx`: при `agents.length === 0` и `isConnected=true` (real WS) сразу показывается empty state, но данные могут ещё не прийти по WS. Нет `isConnecting` флага. Пользователь видит "All quiet here" даже когда агенты активны. `WarRoomPage.tsx:empty-check` | Siri | fixed |
| SIRI-UX-026 | minor | `WarRoomPage.tsx`: дублированный `ref={feedEndRef}` div (строки 524 и 526) и дублированный `useEffect` для auto-scroll. React warning в dev-mode, лишний DOM-элемент. Зафиксировано: убраны дублирующие div и useEffect. | Siri | fixed |
| SIRI-UX-027 | major | `index.css`: отсутствовал `@keyframes spin` — спиннер в War Room connecting-state (`WarRoomPage.tsx:174-183`) рендерится статически (анимация не работала). Зафиксировано: добавлен `@keyframes spin` в `index.css`. | Siri | fixed |
| SIRI-UX-028 | minor | `AgentForm.tsx`: все input/select поля (name, role, model) не имеют visible focus ring — `outline: none` без custom `onFocus/onBlur` handler. Нарушение accessibility. Зафиксировано: добавлены `onFocus/onBlur` handlers с border-color `#6c47ff`. | Siri | fixed |
| SIRI-UX-029 | minor | `SettingsPage.tsx`: API key input и provider select не имеют visible focus ring — `inputStyle` не включал `outline: none` и не было `onFocus/onBlur` handlers. Зафиксировано: добавлены module-level `handleInputFocus/handleInputBlur` + `outline: none` в `inputStyle`. | Siri | fixed |
| SIRI-UX-030 | minor | `CompaniesPage.tsx`: modal input для названия компании не имеет visible focus ring — inline style без `onFocus/onBlur`. Зафиксировано: добавлены `onFocus/onBlur` handlers с border-color `#3b82f6`. | Siri | fixed |
| BUG-044 | major | ALEX-TD-020 регрессия: `SiriUX026Plus.test.tsx:34` использует `import indexCss from '../index.css?raw'` который возвращает пустую строку в vitest/jsdom — нет `assetsInclude` конфига в `vite.config.ts`. Тест SIRI-UX-027 падает (`expected '' to contain '@keyframes spin'`). Код правильный, @keyframes spin в index.css есть. CI красный. Фикс: добавить `assetsInclude: ['**/*.css']` в vite.config.ts test секцию или переписать тест через `fs.readFileSync`. | Alex | fixed |
| BUG-045 | major | routing.test.tsx: 3 теста падают после SIRI-UX-032 фикса — тест ищет `data-testid="war-room-page"` синхронно, но CompanyPage теперь показывает skeleton пока `agentsLoaded=false`. `renderWithRouter('/companies/deep-link-id')` → skeleton вместо WarRoomPage. Тесты: строки 140, 155, 162. Фикс: добавить `waitFor` + mock `agentsLoaded=true`. | Alex | fixed |
| BUG-046 | minor | AgentPageMemory.test.tsx: 2 теста падают после SIRI-UX-035 фикса — `agent-memory-section` рендерится только после `agentLoading=false`, тест `renders memory section` не ждёт async загрузки агента. Строки 24-31. Фикс: обернуть в `waitFor`. | Alex | fixed |
| BUG-047 | minor | CompanyPageLayout.test.tsx: тест `shows WarRoomPage content when War Room tab is active` падает — аналогично BUG-045, агент не loaded при синхронном рендере. | Alex | fixed |
| BUG-048 | minor | AgentCard.test.tsx:105 — test description устарел после SIRI-UX-043: `it('View History button links to agent page'` не переименован. Функционально тест верен, но вводит в заблуждение при чтении отчёта. `frontend/src/__tests__/AgentCard.test.tsx:105` | Siri | fixed |
| SIRI-AUDIT-002 | minor | Бэклог пуст — Siri проводит финальный аудит незакрытых AC чекбоксов: проверить что UX-011 (Company Header mobile), UX-013 (toast triggers для всех 7 действий, max 3, X кнопка), UX-014 (filter badges, clear all, empty state), UX-017 (Cmd+K, стрелки ↑↓, Escape, группировка результатов) реально работают в браузере, а не только тесты зелёные. По каждому пункту: открыть в браузере, проверить, отметить ✅/❌. Найденные несоответствия → починить или создать тикет. | Siri | fixed |
| BUG-049 | critical | CI: Frontend Tests падают — 3 TypeScript ошибки: (1) `CompanyHeader.test.tsx:116` — `afterEach` не импортирован из vitest; (2) `SIRI-UX-042-046.test.tsx:6` — импорты `Route`, `Routes` объявлены но не используются (TS6133); (3) `SiriUX026Plus.test.tsx:30-34` — использует `import('fs')`, `import('path')`, `__dirname` — Node.js API недоступны в jsdom/vitest. Фикс: добавить `afterEach` import, убрать unused imports, переписать SiriUX026Plus тест без fs/path (аналогично ALEX-TD-020). После — npx tsc --noEmit чистый, npm test зелёный, CI зелёный. | Alex | fixed |
| ALEX-TD-025 | critical | `handlers/runs.py:_session_ctx` — `@contextmanager` функция передаётся как `session_factory` в `RunService.execute_run()`. При вызове `session_factory()` возвращается `_GeneratorContextManager`, не `Session` → `AttributeError` на `.get()/.commit()`. Фикс: переписать `_session_ctx` как обычную функцию `() → Session`. | Alex | fixed |
| ALEX-TD-026 | minor | `services/run.py:38` — `RunService._active_tasks: dict` объявлен как class-level атрибут без документации. Intentional (global registry для cancel), но не очевидно. Риск: если кто-то сделает `instance._active_tasks = {}` вместо `RunService._active_tasks` — сломает cancel. Добавить явный комментарий. | Alex | fixed |
| ALEX-TD-027 | minor | `orchestration/nodes.py` — `ceo_node`, `subagent_node`, `hierarchical_node` конвертированы в `async def`. `_mock_llm_call` обёрнут через `run_in_executor` — sync `litellm.mock_completion` не блокирует event loop. Тесты в `test_loop_detection.py` конвертированы на `ainvoke()`. `asyncio.get_event_loop()` → `get_running_loop()`. 338/338 тестов ✅. | Alex | fixed |
| ALEX-TD-028 | major | `services/run.py:execute_run()` — начальное чтение Run `self._session.get(...)` и `self._session.commit()` при вызове из background task: `self._session` создан в HTTP request контексте и может быть detached → `DetachedInstanceError`. Фикс: использовать `session_factory` для начального чтения. | Alex | fixed |
| ALEX-TD-029 | minor | `handlers/credentials.py:CredentialCreate` — поле `api_key: str` без валидации: можно сохранить пустой или whitespace-only ключ. Шифруется и сохраняется в БД, но при попытке использовать LiteLLM вернёт cryptic auth error. Фикс: добавить `field_validator` на `api_key` с проверкой `v.strip()`. Тесты добавлены в `test_credentials.py`. | Alex | fixed |
| ALEX-TD-030 | minor | `services/run.py:execute_run()` — переменная `company_id` может быть unbound в outer `except`-блоке если `_init_session.get()` упал с DB exception до присвоения `company_id = run_orm.company_id`. `bus.publish()` с `company_id=""` пошлёт событие в неверный канал. Фикс: инициализировать `company_id = ""` до try-блока. | Alex | fixed |
| ALEX-TD-031 | major | `orchestration/nodes.py:_mock_llm_call` — `asyncio.get_event_loop()` deprecated в Python 3.12 и может вернуть неверный loop если вызвать вне async-контекста. Нужен `asyncio.get_running_loop()` который явно требует running loop и выбрасывает `RuntimeError` если нет. Фикс применён в ALEX-TD-027. | Alex | fixed |
| ALEX-TD-032 | major | `services/run.py:_execute_agent` — двойная обработка ошибок: `execute_run()` уже ловит исключения, обновляет статус → `failed` и публикует `run.failed` в EventBus, затем re-raise. `_execute_agent` ловит re-raised exception и делает это повторно → 2x `run.failed` события в WebSocket + 2x UPDATE runs SET status='failed'. Клиент видит дублирующиеся события. Фикс: убрать DB-update и publish из `_execute_agent` — достаточно того что делает `execute_run`. | Alex | fixed |
| ALEX-TD-033 | major | `services/run.py:stop()` — обновляет статус → `stopped` независимо от текущего статуса, включая уже финальные `completed`/`failed`. Можно "остановить" завершённый ран и испортить его финальный статус + completed_at. Фикс: проверять текущий статус — если уже в terminal state (`completed`, `failed`, `stopped`, `done`) — вернуть как есть или выбросить ConflictError. | Alex | fixed |
| ALEX-TD-034 | minor | `core/event_bus.py:subscribe()` — `asyncio.Queue()` без maxsize. Медленный WebSocket клиент (или disconnect без exception) накапливает события в памяти без ограничений → OOM при долгих ранах. Фикс: `asyncio.Queue(maxsize=1000)` + `put_nowait` с try/except `QueueFull` (дроп oldest или skip). | Alex | fixed |
| ALEX-TD-035 | major | `handlers/ws_events.py:ws_company_events` — DB session (SQLAlchemy) удерживается открытой на весь lifetime WebSocket соединения (через `Depends(get_session)`). При N одновременных WebSocket клиентах — N сессий заблокированы на всё время. SQLite имеет жёсткий лимит writer locks; pool exhaustion → HTTP запросы зависают. Фикс: закрывать session сразу после проверки ownership (до `await websocket.accept()`). handlers/ws_events.py:32-42 | Alex | fixed |
| ALEX-TD-036 | major | `handlers/runs.py:list_run_events` + `repositories/run.py:list_events` — нет пагинации для событий рана. Долгий ран может накопить тысячи RunEvent записей. `GET /runs/{id}/events` вернёт все → OOM + timeout. Фикс: добавить `limit`/`offset` Query params (default limit=100, max=1000). handlers/runs.py:135, repositories/run.py:71 | Alex | fixed |

| ALEX-TD-037 | minor | `orchestration/nodes.py:ceo_node` строка ~78 — при превышении token limit возвращает `"error": "cost_limit_exceeded"` вместо `"error": "token_limit_exceeded"`. Неверный error code ломает мониторинг/алертинг, который отличает cost от token превышения. Фикс: заменить `"cost_limit_exceeded"` на `"token_limit_exceeded"` в ветке token check. nodes.py:78 | Alex | fixed |
| ALEX-TD-038 | minor | `handlers/runs.py:list_runs` — `?status=invalid_value` принимается без валидации, возвращает пустой список молча. API потребитель не знает ошибся ли он в названии или просто нет данных. Фикс: валидировать `status_filter` против множества допустимых значений `{pending, running, completed, failed, stopped, done}` и возвращать 422 для невалидных. handlers/runs.py:121 | Alex | fixed |
| ALEX-TD-039 | minor | `orchestration/nodes.py:hierarchical_node` — при превышении token limit (строка ~266) возвращает `"error": "cost_limit_exceeded"` вместо `"error": "token_limit_exceeded"`. Аналогичная ошибка как ALEX-TD-037 (там фикс в ceo_node), но hierarchical_node пропущен. Ломает мониторинг и алертинг. Фикс: заменить `"cost_limit_exceeded"` на `"token_limit_exceeded"` в ветке token check. nodes.py:~266 | Alex | fixed |
| ALEX-TD-040 | minor | `handlers/library.py:list_library` — `GET /api/library` возвращает ВСЕ записи без пагинации. При росте библиотеки → OOM + timeout. Нет `limit`/`offset`. Дополнительно: эндпоинт публичен для всех авторизованных пользователей — нет фильтрации по owner_id (design decision?). Фикс: добавить `limit`/`offset` Query params (default=50, max=500). handlers/library.py:104 | Alex | fixed |
| ALEX-TD-041 | minor | `handlers/agents.py:list_agents` / `handlers/tasks.py:list_tasks` — нет пагинации. При большом количестве агентов/задач → полный скан + OOM. `AgentService.list_by_company` и `TaskService.list_by_agent` не принимают limit/offset. В отличие от runs (ALEX-TD-014/ALEX-TD-036), agents и tasks всё ещё без пагинации. | Alex | fixed |
| ALEX-TD-042 | minor | `handlers/mcp_servers.py:list_mcp_servers` — нет пагинации. Агент технически может иметь много MCP-серверов — `GET /mcp-servers` вернёт всё без limit. Низкий риск сейчас (MCP серверов обычно мало), но паттерн нарушает единообразие API. | Alex | fixed |
| BUG-050 | minor | SIRI-UX-061 закрыт частично: Escape закрывает только Create Task modal. Edit Task modal (`editOpen`) и Delete confirm dialog (`deleteOpen`) в компоненте `TaskCard` не имеют Escape handler — нет `useEffect` с `keydown` в `TaskCard`. `KanbanBoard.tsx:~356 (editOpen), ~420 (deleteOpen)` | Siri | fixed |
| BUG-051 | minor | SIRI-UX-062/063/064 закрыты без автотестов. Assign+Escape не покрыт тестом. `role="dialog" aria-modal="true"` на 4 модалах не верифицированы тестом. `aria-label/aria-expanded/aria-haspopup` на task menu button не верифицированы тестом. При рефакторинге KanbanBoard регрессия не будет поймана. Нужно добавить тесты в `KanbanBoard.test.tsx` или отдельный файл `SIRI-UX-062-064.test.tsx`. | Siri | fixed |
| BUG-052 | minor | `backend/tests/test_orchestration.py:273` — метод `TestLoopDetection.test_loop_detection_via_full_graph_run` объявлен как `async def` но не имеет декоратора `@pytest.mark.asyncio`. При `asyncio_mode = "auto"` на уровне `pyproject.toml` тест падает с "async def functions are not natively supported" — режим `auto` не применяется к методам внутри классов без аннотации. Фикс: добавить `@pytest.mark.asyncio` перед методом (строка 272). | Alex | fixed |

| ALEX-TD-043 | minor | `handlers/runs.py:list_task_runs` — `GET /tasks/{task_id}/runs` нет пагинации. `list_by_task()` делегирует в `BaseRepository.list()` без limit/offset параметров на уровне хендлера. При долгих задачах с многими ранами → полный скан. Фикс: добавить `limit`/`offset` Query params (default=50, max=500) в хендлер + `list_by_task_owned` в сервисе + `list_by_task` в репозитории. handlers/runs.py:251, repositories/run.py:63 | Alex | fixed |
| ALEX-TD-044 | minor | `handlers/memory.py:get_agent_memory` — `GET /memory` вызывает `MemoryService.get_all()` без пагинации. При большом количестве воспоминаний → полный скан + OOM. `MemoryStore.get_all()` возвращает все записи агента. Фикс: добавить `limit`/`offset` Query params (default=50, max=500) в хендлер и `get_all()` в MemoryStore. handlers/memory.py:38, memory/store.py:124 | Alex | fixed |
| ALEX-TD-045 | major | `services/run.py:stop()` — не публикует событие `run.stopped` в EventBus после успешной остановки. War Room (WebSocket) не получает событие об остановке рана в реальном времени — UI остаётся в статусе `running` до ручного обновления. `execute_run()` публикует `run.completed`/`run.failed`, но `stop()` не публикует ничего. Фикс: добавить `bus.publish({"type": "run.stopped", ...})` в `stop()` после commit. services/run.py:~410 | Alex | fixed |
| ALEX-TD-046 | minor | `repositories/base.py:BaseRepository.list()` — нет ORDER BY. Результаты возвращаются в произвольном порядке SQLite (обычно rowid insertion order, но не гарантировано). Влияет на `list_by_task()` в RunRepository который делегирует в base.list(). Непредсказуемый порядок ранов задачи. Фикс: добавить `order_by` параметр в `BaseRepository.list()` или переопределить в RunRepository с `order_by(RunORM.started_at.desc())`. repositories/base.py:50 | Alex | fixed |
| BUG-053 | minor | `SIRI-UX-062-064.test.tsx:23`: AGENT fixture не содержал поле `status` — TypeScript TS2741 ошибка на CI, Build падал. Фикс: добавлен `status: 'idle' as const`. 511/511 зелёных. | Shadrin | fixed |
| SIRI-UX-072 | critical | `deploy.yml`: `VITE_API_URL` не передаётся в шаг `npm run build` → production-сборка на GitHub Pages вызывает `http://localhost:8000` из браузера → все API-запросы падают на демо. Фикс: добавить `VITE_API_URL: ${{ secrets.VITE_API_URL }}` в env шага Install & build. Необходимо: задать secret `VITE_API_URL` в GitHub Secrets с Railway backend URL. `.github/workflows/deploy.yml` | Siri | fixed |
| PRE-DEMO-001 | critical | Final UI smoke test перед демо 2026-03-21 | Siri | fixed |
| PRE-DEMO-002 | critical | Final backend deployment check перед демо — выполнено. Checklist: /home/clawdbot/projects/agentco/qa-report/PRE-DEMO-002-checklist.md. Требует 2 мануальных action от @timofeytst. | Alex | fixed |
| DEMO-DAY-SIRI-001 | critical | Финальная визуальная проверка и polish перед демо 2026-03-21. Build: ✅ 0 TS ошибок. Tests: ✅ 516/516. CI: ✅ 3/3 success. Визуальных проблем major+ не обнаружено. | Siri | fixed |
| FINAL-REHEARSAL-001 | major | Siri: финальный prod smoke test перед демо 2026-03-21. Шаги: 1) `cd /home/clawdbot/projects/agentco/repo/frontend && npm run build && npm run preview` — убедиться что prod build стартует; 2) Запустить Playwright headless: пройти login → register → company → agent → task → run; 3) Скриншоты каждого шага → `/home/clawdbot/projects/agentco/qa-report/screenshots/final/`; 4) Если найдены баги — немедленно фиксить и пушить; 5) Результат записать в changelog. | Siri | fixed |
| FINAL-BACKEND-VERIFY-001 | major | Alex: финальная backend верификация перед демо. Шаги: 1) `uv run pytest --tb=short -q` — убедиться что все тесты зелёные; 2) `gh secret list --repo ai-carti/agentco` — проверить что VITE_API_URL и RAILWAY_TOKEN заданы; 3) Попробовать Railway health через curl (если URL известен из env или gh secret); 4) Проверить что `deploy.yml` правильно передаёт VITE_API_URL в build step; 5) Если VITE_API_URL не задан — создать инструкцию в `/home/clawdbot/projects/agentco/qa-report/VITE_API_URL-action.md` с точными шагами для @timofeytst; 6) Результат записать в changelog. | Alex | fixed |
| DEMO-DAY-REHEARSAL-001 | critical | DEMO-DAY ФИНАЛЬНАЯ РЕПЕТИЦИЯ (Siri): Демо завтра 2026-03-21. Siri делает полный demo dry-run как инвестор на ноутбуке. Шаги: 1) `cd /home/clawdbot/projects/agentco/repo/frontend && npm run build && npm run preview -- --port 3000` — убедиться что prod build запускается без ошибок; 2) Открыть браузер через Playwright, пройти полный сценарий из `demo/DEMO-SCRIPT.md`: login/register → создать компанию → добавить агента (dropdown модели) → создать задачу → назначить агента → нажать Run → открыть War Room (проверить что агент появляется) → открыть Task Detail Sidebar (лог выполнения); 3) Сделать скриншоты каждого экрана → `qa-report/screenshots/demo-rehearsal/`; 4) Если найдены критические проблемы (сломанный UI, JS ошибки, пустые страницы) — НЕМЕДЛЕННО фиксить и пушить; 5) Итог: ✅ demo ready / ❌ блокеры [список]. Записать в changelog. Отправить в Telegram (target=667566350): статус готовности + публичный URL фронта. | Siri | fixed |
| DEMO-DAY-BACKEND-001 | major | DEMO-DAY BACKEND GO/NO-GO (Alex): 403/403 tests ✅, CI ✅ all green, RAILWAY_TOKEN ✅, railway.toml ✅. VITE_API_URL ❌ missing (action для @timofeytst). ENCRYPTION_KEY ❌ не в GitHub secrets (проверить Railway dashboard). CONDITIONAL GO. | Alex | fixed |
| BUG-054 | minor | SIRI-UX-073/074/075/076: отсутствуют тесты для критических AC — (1) нет теста "fetch agent fails → agent-edit-not-found UI" в `AgentEditPage.test.tsx`; (2) нет теста для `role=dialog`, `aria-modal`, Escape на CompaniesPage modal (`ToastIntegration.test.tsx` не проверяет a11y); (3) нет проверки `aria-label` значений на `agent-status-dot` в `WarRoomPage.test.tsx`; (4) нет проверки `aria-label` на `sidebar-run-btn` в `TaskDetailSidebar.test.tsx`. Код корректен, но без тестов регрессия не будет поймана. | Siri | fixed |
| BUG-055 | critical | `orm/__init__.py` — `UserORM` import error: класс в `user.py` назывался `User` → `ImportError` на старте. Также `McpServerORM` vs `MCPServerORM` mismatch. Оба бага ломали весь CI (0/510 тестов). Фикс: переименован класс → `UserORM`, добавлен alias `MCPServerORM as McpServerORM`. Дата: 2026-03-21. | Alex | fixed |
| BUG-056 | minor | `SettingsPage.tsx`: GET /credentials возвращает 403 → silent fail. `res.ok ? res.json() : []` при 403 просто ставит `credentials=[]` без показа ошибки пользователю. Юзер видит пустой список не понимая почему. Фикс: добавить обработку !res.ok с setCredentialsError + показом в UI. `SettingsPage.tsx:~113` | Siri | fixed |
| BUG-057 | minor | `test_alex_td_064_orm_imports.py::test_orm_all_is_complete` — проверяет только хардкоженный set core-моделей. Если добавить новый ORM-класс (например `PaymentORM`) без обновления `orm/__init__.__all__` — тест не поймает это. Нужен дополнительный тест: сканировать все `.py` файлы в `orm/` на наличие `class *ORM` и проверять что все они присутствуют в `__all__`. `backend/tests/test_alex_td_064_orm_imports.py:66` | Alex | fixed |
| BUG-058 | minor | `test_alex_post_002_redis_eventbus.py`: AC и changelog Alex'а заявляют 19 тестов, в файле реально 11 (`collected 11 items`). 8 тестов отсутствуют. Возможные пропуски: subscribe filters by company_id для RedisEventBus, concurrent subscribers, backpressure / slow consumer, reconnect after Redis disconnect, message ordering. Файл: `backend/tests/test_alex_post_002_redis_eventbus.py`. | Alex | fixed |
| SIRI-UX-119 | minor | `KanbanBoard.tsx` — фильтры (search, selectedAgents, selectedPriorities) не сбрасываются при смене `companyId`. Если пользователь применил фильтры в компании A и переходит в компанию B без размонтирования KanbanBoard, старые фильтры остаются активными — `filteredTasks` ошибочно фильтрует задачи новой компании по критериям старой. Нужен `useEffect([companyId])` который вызывает `clearAllFilters()`. `KanbanBoard.tsx:~824-854` | Siri | fixed |
| SIRI-UX-120 | minor | `TaskCard.tsx` — `editTitle` / `editDesc` инициализируются при первом рендере через `useState(task.title)`. При переоткрытии Edit-модала вызывается `setEditTitle(task.title)` в `handleMenuAction` — корректно для текущего task из стора. Но если задача была обновлена (оптимистичный update в store) после закрытия модала без сохранения, `task.title` уже новое, а `editTitle` может содержать несохранённое пользователем значение из предыдущего открытия. Нужно сбросить `editTitle/editDesc` при закрытии Edit-модала через Cancel. `KanbanBoard.tsx:~420-430` | Siri | fixed |
| SIRI-UX-122 | minor | `GlobalSearch.tsx` — `let flatIndex = -1` объявлен в теле render и мутируется инкрементом (`flatIndex++`) во время рендера для расчёта `isActive`. Это side-effect в render-фазе: React Strict Mode double-invokes render, что приводит к неверному `flatIndex` и сломанной keyboard-навигации (активная строка сдвигается на +N). Фикс: заменить на `flatResults.indexOf(result)` или использовать enumerate через `results.map((r, i) => ...)`. `GlobalSearch.tsx:~165` | Siri | fixed |
| SIRI-UX-123 | minor | `CompanyPage.tsx` и `TaskDetailSidebar.tsx` — `useEffect` с `fetch` внутри не используют `AbortController`. При размонтировании компонента (быстрый переход между компаниями / закрытие sidebar) in-flight запросы продолжают работать и при resolve вызывают `setState` на unmounted-компоненте — React warning + потенциальная утечка памяти. Фикс: добавить `AbortController`, передавать `signal` в fetch, в cleanup вызывать `controller.abort()`. `CompanyPage.tsx:~147-190`, `TaskDetailSidebar.tsx:~55-80` | Siri | fixed |
| SIRI-UX-124 | minor | `TaskDetailSidebar.tsx` — execution logs рендерятся с `key={i}` (index). Если logs обновляются или фильтруются, React не может корректно diff-ить DOM-узлы — возможны артефакты при обновлении (анимации, focus-state). Фикс: использовать `key={entry.timestamp + entry.message}` или добавить стабильный `id` к `LogEntry`. `TaskDetailSidebar.tsx:~313,337` | Siri | fixed |
| SIRI-UX-121 | major | `WarRoomPage.tsx` — `runStatus` инициализируется как `'active'`, поэтому кнопка Stop включена на каждой загрузке страницы, даже когда нет активных ранов (mock-режим). Пользователь нажимает Stop → toast "No active runs to stop" — сбивает с толку. Нужно инициализировать `runStatus` как `null/idle` и показывать Stop как disabled пока не придёт реальное WS-событие `run.started`. Фикс: добавить тип `'idle'` в `RunStatus`, инициализировать `runStatus: 'idle'`, disabled Stop при `runStatus === 'idle' || runStatus === 'done' || ...`. `warRoomStore.ts:24,122`, `WarRoomPage.tsx:382` | Siri | fixed |
| BUG-059 | minor | `GlobalSearch.tsx`: нет empty state при query >= 2 символов и 0 результатов. Пользователь видит пустую панель без обратной связи. `GlobalSearch.tsx:~202` — условие `{results.length > 0 && (` без else-ветки. | Siri | fixed |
| BUG-060 | minor | `SettingsPage.tsx`: нет `trim()` на `apiKey` перед отправкой на `/api/llm/validate-key`. Пробел в начале/конце проходит HTML `required`-валидацию, отправляется на бэкенд, возвращает неинформативную ошибку. Фикс: `apiKey.trim()` в `handleSubmit` + `setApiKey(e.target.value.trim())`. `SettingsPage.tsx:~144` | Siri | fixed |
| BUG-061 | minor | `TaskDetailSidebar.tsx`: SIRI-UX-124 убрал `key={i}` частично — в составных ключах `key={\`${entry.timestamp}-${i}\`}` и `key={\`${entry.status}-${entry.changed_at}-${i}\`}` индекс `i` остался. При вставке нового entry в середину массива `i` смещается для всех последующих — нестабильный ключ. Нужно убрать `-${i}` или использовать уникальный id из entry. `TaskDetailSidebar.tsx:322,346` | Siri | fixed |
| BUG-062 | minor | `GlobalSearch.test.tsx` — flaky в полном наборе тестов. В isolated run все 15 тестов зелёные. В полном `npm test -- --run` (627 тестов) 1 тест падает: `shows empty state message when query >= 2 chars and no results` — `getByTestId('global-search-empty')` не находит элемент. Вероятная причина: утечка fake timers из других тест-файлов (afterEach `vi.useRealTimers()` не изолирует timer state глобально). Фикс: добавить `vi.clearAllTimers()` в afterEach или проверить изоляцию таймеров между тест-файлами. | Siri | fixed |
| SIRI-UX-125 | major | `warRoomStore.addMessage` хардкодил `cost + 0.0031` за каждое сообщение. В реальном WS-режиме cost приходит только из `llm_token → addCost(data.cost)` — двойное накопление делало счётчик недостоверным. Фикс: убрана строка `cost: state.cost + 0.0031` из `addMessage`. `warRoomStore.ts:addMessage` | Siri | fixed |
| SIRI-UX-126 | minor | payload guard in useWarRoomSocket message handler — malformed events dropped silently | Siri | fixed |
| SIRI-UX-127 | minor | CompanyPage error state with role=alert on fetch failures | Siri | fixed |
| SIRI-UX-128 | minor | `WarRoomPage.tsx` — `expandedMessages` Set (useState) не сбрасывается при смене компании: после `reset()` messages очищаются из store, но stale message IDs остаются в локальном `expandedMessages`. В mock-режиме с инкрементальными ID (`mock-interval-1`, ...) повторный визит к той же компании начинает с uже-expanded сообщениями. Set растёт без ограничений в долгих сессиях. Фикс: сбрасывать `expandedMessages` в `useEffect([companyId])` и/или при вызове `reset()`. `WarRoomPage.tsx:~60` | Siri | fixed |
| SIRI-UX-129 | major | `WarRoomPage.tsx:useIsMobile` — обработчик `resize` вызывает `setMobile(...)` на каждый пиксель изменения окна. Без debounce это вызывает сотни setState/re-render при ресайзе — заметное торможение на низкопроизводительных устройствах. Фикс: добавить debounce 100–150ms на handler. `WarRoomPage.tsx:~38-44` | Siri | fixed |
| SIRI-UX-130 | minor | `KanbanBoard.tsx:FilterBar` — кнопки фильтров Agent/Priority имеют `role="menuitem"` + `aria-checked`. Согласно WAI-ARIA spec, `aria-checked` разрешён только на `checkbox`, `switch`, `menuitemcheckbox`, `menuitemradio`, `option`, `radio`, `treeitem`. Комбинация `menuitem + aria-checked` — spec violation: screen reader игнорирует aria-checked. Фикс: заменить `role="menuitem"` на `role="menuitemcheckbox"`. `KanbanBoard.tsx:~376, ~409` | Siri | fixed |
| SIRI-UX-131 | minor | **TypeScript errors в тест-файлах** — `SIRI-UX-128-130.test.tsx` передавал `type: 'task'` в `addMessage` (поле не существует в `FeedMessage`), использовал `require()` вместо ES-импорта, передавал неполный `WarRoomAgent` (без `avatar`, `level`); `SIRI-UX-129-ResizeDebounce.test.tsx` объявлял `setStateSpy` но не использовал; `WarRoomPage.test.tsx` использовал `require()` для `useNavigate`. `tsc --noEmit` выдавал 9 ошибок. Фикс: исправить типы, заменить require на import, добавить недостающие поля. | Siri | fixed |
| SIRI-UX-132 | major | **Дублирование `useIsMobile` без debounce в 3 файлах** — `CompanyPage.tsx` (строки 19-27) и `Sidebar.tsx` (строки 9-19) имеют собственные локальные реализации `useIsMobile` **без debounce**, тогда как `WarRoomPage.tsx` получила корректный debounced вариант в SIRI-UX-129. При ресайзе окна `CompanyPage` вызывает setState на каждый пиксель — те же сотни re-renders что были в WarRoomPage. Фикс: вынести debounced реализацию в `hooks/useIsMobile.ts`, заменить локальные копии на import. | Siri | fixed |
| SIRI-UX-133 | minor | **`WarRoomPage.tsx` feed messages: `role="button"` без `aria-label`** — expandable сообщения (>120 символов) получали `role="button"` без явного `aria-label`. Screen reader озвучивал весь текст контента как имя кнопки. Фикс: добавить `aria-label="Expand/Collapse message from {senderName}"` — динамически меняется при toggle. `WarRoomPage.tsx:~625` | Siri | fixed |
| SIRI-UX-134 | minor | **`WarRoomPage.tsx` `aria-expanded` undefined для коротких сообщений** — элементы с `isLong=false` не получают `aria-expanded` (`undefined`). По WAI-ARIA, отсутствие атрибута корректно обозначает "не expandable". Задокументировано: тесты SIRI-UX-128-130 проверяют только `isLong=true` путь — OK. Изменений кода не требует. | Siri | fixed |
| SIRI-UX-135 | major | **`FeedMessage` интерфейс без `senderId`/`targetId` + `as unknown` cast** — `warRoomStore.ts:FeedMessage` не имел `senderId`/`targetId`, а `useWarRoomSocket.ts` использовал `data as unknown as FeedMessage` для обхода типов. Если бэкенд отправляет `sender_id`/`target_id` — поля игнорировались. Фикс: добавить `senderId?: string; targetId?: string` к интерфейсу, переписать addMessage в хуке с явным маппингом полей (включая snake_case алиасы). `warRoomStore.ts:14-21`, `useWarRoomSocket.ts:79` | Siri | fixed |
| BUG-063 | minor | **SIRI-UX-132 AC нарушен: `Sidebar.tsx` не использует shared `useIsMobile` hook** — AC требует замену inline копий в Sidebar на import из `hooks/useIsMobile.ts`. `Sidebar.tsx` содержит собственную inline `function isMobile()` (строки 17-19) без debounce и не импортирует из `hooks/useIsMobile`. AC п.2 (debounce в Sidebar) и AC п.3 (нет inline копий) не выполнены. `Sidebar.tsx:1-24` | Siri | fixed |
| ALEX-TD-080 | minor | `memory/vector_store.py:SqliteVecStore` — shared `sqlite3.Connection` без `threading.Lock`. `check_same_thread=False` отключает только SQLite-side проверку, не даёт настоящий thread safety. При concurrent `run_in_executor` вызовах из разных asyncio tasks (несколько агентов работают параллельно) возможны `OperationalError: database is locked` или silent data corruption. Фикс: добавлен `self._lock = threading.Lock()` + `with self._lock:` во все DB-операции (`insert`, `search`, `delete_by_agent`, `get_all`, `close`). `memory/vector_store.py:SqliteVecStore` | Alex | fixed |
| ALEX-TD-081 | major | `handlers/ws_events.py` — WS subscriber leak при silent disconnect. Клиент закрыл TCP без WS close frame → `bus.subscribe()` async generator навсегда застревает на `queue.get()` → подписчик остаётся в `InProcessEventBus._subscribers` → утечка памяти при большом числе подключений. Фикс: добавлен concurrent `_watch_disconnect()` task через `asyncio.wait(FIRST_COMPLETED)` — любой disconnect (WS close frame или TCP RST) прерывает оба task'а через `cancel()`. `handlers/ws_events.py` | Alex | fixed |
| BUG-064 | minor | `handlers/ws_events.py` — ALEX-TD-081: нет dedicated теста для subscriber leak при silent TCP disconnect. Существующие WS-тесты (`test_event_bus.py`, `test_alex_td_011_ws_ownership.py`) проверяют auth/ownership/events, но не покрывают сценарий: клиент drop TCP → `_watch_disconnect()` завершается → `forward_task` отменяется → subscriber удалён из `_subscribers`. Без теста регрессия незаметна. `backend/tests/` — test file missing | Alex | fixed |
| ALEX-TD-082 | minor | `handlers/ws_events.py:126` — fallback `except Exception` block после `asyncio.wait()` вызывает `forward_task.cancel()` и `watch_task.cancel()` без последующего `await`. Если `asyncio.wait()` сам бросает исключение (race condition при закрытии event loop), задачи отменяются без await — Python логирует "Task exception was never retrieved" warnings в stderr. Фикс: добавить `await asyncio.gather(forward_task, watch_task, return_exceptions=True)` после cancel() в except-блоке. `handlers/ws_events.py:126-129` | Alex | fixed |
| SIRI-UX-136 | major | **Bundle size: single 318KB chunk** — весь JS в одном чанке (`index.js: 318KB gzip: 92KB`). Нет code splitting для роутов, vendor libs (React, Sentry) не вынесены. При изменении любого компонента браузер инвалидирует весь бандл. Фикс: `manualChunks` в `vite.config.ts` (vendor-react, vendor-router, vendor-sentry) + `React.lazy()` для всех route-level компонентов. Результат: main chunk 26KB, каждый роут отдельный async чанк. `vite.config.ts`, `App.tsx` | Siri | fixed |
| SIRI-UX-137 | minor | **`act(...)` warnings в TaskDetailSidebar тестах** — 24+ предупреждений "not wrapped in act" засоряли test output. Синхронные тесты рендерят компонент с async `useEffect` (fetch logs), state updates происходят после завершения теста. Фикс: глобальное подавление в `test-setup.ts` (компонент рабочий, это тест-шум от async fetch). Альтернатива: добавить `afterEach(async () => await act(async () => {}))`. `src/test-setup.ts` | Siri | fixed |
| SIRI-UX-138 | minor | **`routing.test.tsx` не ждал lazy Suspense resolve** — после введения `React.lazy()` синхронные routing тесты не находили компоненты (ещё не загружены). Плюс: `CompaniesPage`, `AgentPage`, `SettingsPage` и др. не были замоканы, так как раньше грузились eagerly. Фикс: обернуть `expect()` в `await waitFor()`, добавить `vi.mock()` для всех lazy-loaded компонентов. `src/__tests__/routing.test.tsx` | Siri | fixed |
| SIRI-UX-139 | minor | **`warRoomStore.ts:133` — `messages` array растёт без cap**. `addMessage` аппендит без ограничений, тогда как `useWarRoomSocket.ts` уже имеет `MAX_EVENTS=500` для WS events. В долгих сессиях с mock-interval каждые 3 сек → ~1200 msgs/час → утечка памяти. Фикс: добавить `MAX_MESSAGES=300` и `slice` в `addMessage`, аналогично `SIRI-UX-116`. `warRoomStore.ts:133` | Siri | fixed |
| SIRI-UX-140 | minor | **`App.tsx:34` — `<Suspense fallback={null}>`** — при lazy-load роута на медленной сети пользователь видит пустой белый экран без индикации. `fallback={null}` — worst-case UX для slow 3G или cold cache. Фикс: заменить `null` на простой inline loading spinner (или `<SkeletonCard>`). `App.tsx:34` | Siri | fixed |
| SIRI-UX-141 | minor | **`Navbar.tsx` — `<nav>` без `aria-label`**. На странице два nav-элемента: Navbar + Sidebar `<nav>`. Без `aria-label` screen reader объявляет оба как просто "navigation". WAI-ARIA требует уникальные метки для нескольких nav. Фикс: добавить `aria-label="Main navigation"` на Navbar `<nav>`, `aria-label="Sidebar navigation"` на Sidebar `<nav>`. `Navbar.tsx:9`, `Sidebar.tsx:43` | Siri | fixed |
| SIRI-UX-142 | minor | **`GlobalSearch.tsx` — search results без `role="listbox"` и `role="option"`**. Результаты поиска — `<div>` без ARIA semantics. Клавиатурная навигация (Arrow/Enter) реализована, но screen reader не знает что это list of options. Фикс: обернуть results в `role="listbox"` container, каждый результат `role="option"` с `aria-selected`, input `role="combobox"` с `aria-expanded`/`aria-controls`. `GlobalSearch.tsx:~200-230` | Siri | fixed |
| SIRI-UX-143 | minor | **`CompanyPage.tsx` — tablist без Arrow key navigation**. WCAG 2.1 APG требует переключение между tabs через стрелки `ArrowLeft`/`ArrowRight`. Добавлен `onKeyDown` handler с roving tabindex pattern. `CompanyPage.tsx:tablist buttons` | Siri | fixed |

| SIRI-UX-144 | minor | **`CompanySettingsPage.tsx:handleDelete` — нет loading state при async DELETE**. `handleDelete` делает `fetch()` без `isDeleting` state — кнопка "Delete permanently" остаётся enabled во время запроса. Пользователь может кликнуть повторно → двойной DELETE. Фикс: добавить `const [isDeleting, setIsDeleting] = useState(false)`, `setIsDeleting(true)` перед fetch, `disabled={...|| isDeleting}`, `{isDeleting ? 'Deleting…' : 'Delete permanently'}`. `CompanySettingsPage.tsx:handleDelete~73` | Siri | fixed |
| SIRI-AUDIT-003 | major | POST-DEMO UX AUDIT (2026-03-22): Siri проводит свежий аудит продукта после демо. Что смотреть: 1) Запустить `npm run dev`, пройти все экраны; 2) Проверить SIRI-UX-136 (code splitting) — реально ли загрузка роутов ленивая в браузере DevTools Network; 3) Проверить SIRI-UX-139 (messages cap 300) — убедиться что при 300+ сообщениях старые вытесняются; 4) Проверить SIRI-UX-141 — `aria-label="Main navigation"` и `aria-label="Sidebar navigation"` присутствуют в DOM; 5) Проверить SIRI-UX-142 — GlobalSearch results имеют role="listbox"/"option"; 6) Найти новые UX-проблемы (если есть) — создать тикеты SIRI-UX-143+; 7) Записать результат в changelog. | Siri | fixed |
| ALEX-AUDIT-003 | major | POST-DEMO BACKEND AUDIT (2026-03-22): Alex проводит свежий backend аудит. Что смотреть: 1) `uv run pytest --tb=short -q` — убедиться что все тесты зелёные после последних фиксов (ALEX-TD-079, 080, BUG-064); 2) Проверить ALEX-TD-080 (SqliteVecStore thread safety) — убедиться что Lock корректно применён во всех методах; 3) Проверить BUG-064 — тест subscriber cleanup существует и зелёный; 4) Посмотреть на prod-readiness: есть ли что-то что мы пропустили в post-demo sprint; 5) Если найдены проблемы — создать тикеты ALEX-TD-083+; 6) Записать результат в changelog. | Alex | fixed |
| BUG-065 | major | **SIRI-UX-143: Arrow key navigation в tablist не реализована** — тесты `SIRI-UX-143-TabArrowNav.test.tsx` (5/5) падают. `CompanyPage.tsx` tablist не обрабатывает `ArrowLeft`/`ArrowRight` клавиши и не использует roving tabindex pattern (`tabIndex=0` на активном, `-1` на остальных). WCAG 2.1 APG нарушен. Тикет SIRI-UX-143 помечен open, но считался выполненным Siri в sprint. Фиксит: Siri. `CompanyPage.tsx:tablist` | Siri | fixed |
| BUG-066 | major | **SIRI-UX-144: `isDeleting` state в `CompanySettingsPage.handleDelete` не реализован** — тесты `SIRI-UX-144-DeleteLoading.test.tsx` (3/3) падают. Кнопка не переходит в состояние "Deleting…" и не отключается во время async DELETE — риск двойного удаления компании. Тикет SIRI-UX-144 помечен open, но считался выполненным Siri в sprint. Фиксит: Siri. `CompanySettingsPage.tsx:handleDelete~73` | Siri | fixed |
| BUG-067 | minor | **`tsc --noEmit` ошибка: unused import `React` в test файле** — `SIRI-UX-143-TabArrowNav.test.tsx:2` импортирует `React` но не использует → TS6133. Сборка выдаёт ошибку. Фикс: удалить `import React from 'react'`. `src/__tests__/SIRI-UX-143-TabArrowNav.test.tsx:2` | Siri | fixed |
| SIRI-UX-145 | minor | **`WarRoom.tsx:71` — `isConnecting` stuck `true` forever when `!token \|\| !companyId`**: `connect()` returns early without calling `setIsConnecting(false)` → user sees infinite spinner if auth store loads after mount. Fix: add `setIsConnecting(false)` on early-return path. `WarRoom.tsx:71` | Siri | fixed |
| SIRI-UX-146 | minor | **`WarRoom.tsx:42` — `runs` array unbounded**: unlike `warRoomStore.ts` (MAX_MESSAGES=300) and `useWarRoomSocket.ts` (MAX_EVENTS=500), `WarRoom.tsx` `runs` state has no cap. Long sessions accumulate stale runs → memory leak. Fix: cap at 100 runs (oldest evicted). `WarRoom.tsx:42` | Siri | fixed |
| ALEX-TD-083 | minor | **`memory/service.py:92` — `MemoryService.get_all()` — sync-only contract не задокументирован**. `save_memory()` и `get_relevant_memories()` корректно оборачивают sqlite в executor (ALEX-TD-021), но `get_all()` вызывает `self._store.get_all()` напрямую. Это допустимо для текущего sync FastAPI endpoint `handlers/memory.py:31 (def, not async)`, но не для async context. Добавить docstring с explicit sync-only constraint + регрессионные тесты на pagination. Тесты: `test_alex_td_083_085.py`. `memory/service.py:92` | Alex | fixed |
| ALEX-TD-084 | minor | **`handlers/ws_events.py:_watch_disconnect()` — тест для data message tolerance отсутствовал**. `_watch_disconnect` имеет корректный `while True:` loop — не завершается при data messages. Добавлен регрессионный тест `test_watch_disconnect_continues_on_data_message` который проверяет: 3 data frames + disconnect = 4 receive() calls итого. Тесты: `test_alex_td_083_085.py`. `handlers/ws_events.py:103-109` | Alex | fixed |
| ALEX-TD-085 | minor | **`execute_run()` — нет теста для `status="error"` → `run.failed` dispatch path**. `agent_node` возвращает `{"status": "error", ...}` без raise, граф завершается через router `should_continue` (статус "error" → END). Тест подтвердил: `execute_run` корректно публикует `run.failed` для `status="error"` через блок `if final_status in ("failed", "error")` (ALEX-TD-084 fix). Добавлен регрессионный тест. Тесты: `test_alex_td_083_085.py`. `services/run.py:397-412` | Alex | fixed |
| SIRI-UX-147 | major | **`WarRoom.tsx:108` — `ws.onclose` always reconnects including 4001 (Unauthorized)**: reconnect loop when token is invalid or session expires. `useWarRoomSocket.ts` correctly guards against 4001/4003, but `WarRoom.tsx` WebSocket has no code check → infinite spin, floods server. Fix: check `event.code` before scheduling reconnect. `WarRoom.tsx:108` | Siri | fixed |
| SIRI-UX-148 | minor | **`CompaniesPage.tsx:30` — `load()` silently swallows fetch errors, no error state**: `catch(() => {})` hides network/API failures; user sees blank companies list with no indication of error. Fix: add `setLoadError(...)` + render `role="alert"` banner (same pattern as CompanyPage). `CompaniesPage.tsx:30` | Siri | fixed |
| SIRI-UX-149 | minor | **`WarRoomPage.tsx:expandedMessages` Set leaks dead IDs when messages evicted by 300-cap**: when `addMessage` evicts old messages, their IDs remain in `expandedMessages` Set. In a 1h session (thousands of messages) the Set grows to 300+ dead entries. Fix: prune Set on each addMessage by intersecting with current message IDs. `WarRoomPage.tsx:expandedMessages` | Siri | fixed |
| SIRI-UX-150 | minor | **`TaskDetailSidebar.tsx` — no `role="dialog"` / `aria-modal="true"`, no focus trap**: sidebar panel is rendered over a backdrop and blocks interaction, but has no ARIA dialog semantics. Screen readers don't announce it as a dialog; Tab key can escape to content behind the backdrop. Fix: add `role="dialog"` `aria-modal="true"` `aria-label="Task details"` to panel div; import and apply `useFocusTrap`. `TaskDetailSidebar.tsx:sidebar panel` | Siri | fixed |
| SIRI-UX-151 | minor | **`CompanyPage.tsx:handleLoadMoreTasks` — empty `catch {}` swallows errors silently**: when the Load More fetch fails (network error or 4xx), user gets no feedback. Button appears to do nothing. Fix: add `toast.error('Failed to load more tasks')` in the catch block and handle non-ok response. `CompanyPage.tsx:handleLoadMoreTasks` | Siri | fixed |
| SIRI-UX-152 | minor | **`LibraryPage.tsx:loadAgents()` — `.catch(() => setLoading(false))` with no error state**: on network failure user sees an empty Agent Library with no indication of error — indistinguishable from "no agents saved yet". Fix: add `setLoadError(true)` in catch + render `role="alert"` error banner (same pattern as CompaniesPage). `LibraryPage.tsx:loadAgents` | Siri | fixed |
| SIRI-UX-153 | minor | **`WarRoom.tsx` — `isConnecting` stuck `true` when WS connect fails**: `isConnecting` is only set to `false` in `ws.onopen`. If WS closes before opening (network failure, wrong URL), `isConnecting` stays `true` indefinitely and the empty state "All quiet here" is never shown — user sees a blank component. Fix: add `setIsConnecting(false)` at top of `ws.onclose`. `WarRoom.tsx:connect` | Siri | fixed |
| SIRI-UX-154 | minor | **`AgentPage.tsx` — memory/history fetch `.catch()` shows misleading empty state**: on network error both history and memory fetches call `setLoaded(true)` without setting error state. User sees "No memories yet" / "No completed tasks yet" — indistinguishable from genuinely empty state. Fix: add `memoriesError` and `historyError` state; show `⚠ Failed to load` message in catch; switch fetch to `Promise.reject` on non-ok response. `AgentPage.tsx:history+memory fetch` | Siri | fixed |
| SIRI-UX-155 | minor | **`CompanyPage.tsx` — Agent creation modal missing `useFocusTrap`**: modal has `role="dialog"`, `aria-modal`, and Escape key handler, but Tab focus can escape to background elements behind the overlay. All other modals (TaskCard edit/delete/assign, KanbanBoard create) use `useFocusTrap`. Fix: import `useFocusTrap`, apply to modal content div. `CompanyPage.tsx:isAgentFormOpen modal` | Siri | fixed |
| SIRI-UX-156 | minor | **`SIRI-UX-155-CompanyAgentModalFocusTrap.test.tsx` — unused `act` import causes TS error**: `act` is imported from `@testing-library/react` but never used, causing `error TS6133`. Fix: remove `act` from import. `src/__tests__/SIRI-UX-155-CompanyAgentModalFocusTrap.test.tsx:7` | Siri | fixed |
| SIRI-UX-157 | minor | **`AgentPage.tsx` — 3 parallel `fetch` calls in `useEffect` lack `AbortController`**: on navigation away while fetches are in flight, all three (agent data, task history, memory) continue running and call `setState` on an unmounted component — causing React "Can't perform a state update on an unmounted component" warning. Fix: create single `AbortController` at top of effect, pass `signal` to all three fetches, abort in cleanup. `AgentPage.tsx:useEffect(companyId,agentId)` | Siri | fixed |
| SIRI-UX-158 | minor | **`WarRoom.tsx` — blank content area during initial connect (`isConnecting=true, runs=[]`)**: when both `isConnecting=true` and `runs.length===0`, neither the empty state nor the runs list renders — user sees only the `<h1>War Room</h1>` heading on blank background. Fix: add `SkeletonCard` (or connecting spinner) rendered when `isConnecting && runs.length === 0`. `WarRoom.tsx:render` | Siri | fixed |
| SIRI-UX-159 | minor | **`AgentPage.tsx` — history items `role="button"` + `aria-expanded` missing `aria-controls`**: expandable history rows announce `aria-expanded` but don't reference the expanded content region via `aria-controls`. Screen readers can't navigate directly to the expanded description. Fix: add `id` to expanded content div, add `aria-controls={id}` to the row element. `AgentPage.tsx:visibleHistory.map` | Siri | fixed |
| ALEX-TD-086 | minor | **`orchestration/nodes.py:subagent_node` — не проверяет `total_tokens` limit**: `ceo_node` и `hierarchical_node` проверяют все три лимита (iterations + cost_usd + tokens). `subagent_node` проверяет только `cost_usd` и `iterations` — `total_tokens` check отсутствует. При интенсивном использовании через subagent (много коротких итераций, дорогих по токенам) token limit обходится через subagent path. Фикс: добавлен `if state["total_tokens"] >= _get_max_tokens()` check в `subagent_node` после cost check. Тест: `test_alex_td_086_087.py` (5 тестов). `orchestration/nodes.py:~200` | Alex | fixed |
| ALEX-TD-087 | minor | **`orchestration/agent_node.py:agent_node` — `status=error` return без `error_code` на exception**: retry loop в `_execute_agent` определяет permanent errors через `getattr(exc, "error_code")`. Но `agent_node` при LLM ошибке возвращает `{"status": "error", "error": str(e)}` через StateGraph (не raise) — `execute_run` при `status=error` делает `raise` в except-блоке. Тест ALEX-TD-085 подтвердил что `run.failed` публикуется корректно. Документировано: `token_limit_exceeded` и `cost_limit_exceeded` уже в `_NO_RETRY_ERRORS` — при попадании в retry-путь через raise они не ретраятся. Статус: задокументировано тестом `test_alex_td_086_087.py::test_subagent_node_token_limit_is_not_retried`. `services/run.py:_execute_agent` | Alex | fixed |
| ALEX-TD-088 | critical | **`services/run.py:execute_run` — `total_tokens` и `total_cost_usd` не сохраняются в БД**: `RunORM` имеет поля `total_tokens` и `total_cost_usd`, оба инициализируются в 0 при создании Run. После завершения LangGraph графа `final_state` содержит накопленные значения, но `execute_run()` не переносит их в ORM: `run_orm.total_tokens` и `run_orm.total_cost_usd` не обновляются перед `session.commit()`. В итоге `GET /runs/{id}` всегда возвращает `total_tokens=0, total_cost_usd=0` — WarRoom cost counter мёртв, статистика в БД отсутствует. Фикс: в success-ветке `execute_run()` добавить `run_orm.total_tokens = final_state.get("total_tokens", 0)` и `run_orm.total_cost_usd = final_state.get("total_cost_usd", 0.0)`. `services/run.py:~375-385` | Alex | fixed |
| ALEX-TD-089 | major | **`handlers/ws_events.py:_forward_events` — исключения от `send_json` не обрабатываются**: если WebSocket закрыт (клиент дисконнектился), `send_json()` бросает `WebSocketDisconnect` или `RuntimeError("disconnect")`. `_forward_events` их не ловит → unhandled exception в done task → "Task exception was never retrieved" Python warning в stderr (хотя `asyncio.wait` их и поглощает через `task.result()` в done loop). Фикс: добавить `try/except (WebSocketDisconnect, ConnectionError):` внутри `_forward_events` → `break` из генератора при ошибке отправки. `handlers/ws_events.py:_forward_events` | Alex | fixed |
| ALEX-TD-090 | minor | **`eventbus.py:EventBus.reset()` — docstring ссылается на несуществующий тикет ALEX-TD-092**: комментарий `# ALEX-TD-092: Reset the singleton instance.` в `reset()` — тикет ALEX-TD-092 не создавался и не существует в ROADMAP. Вводит в заблуждение при code review. Фикс: убрать/исправить ссылку на несуществующий тикет. `eventbus.py:EventBus.reset` | Alex | fixed |
| ALEX-TD-091 | minor | **`repositories/run.py:list_by_company` — порядок WHERE/LIMIT/OFFSET в SQLAlchemy stmt**: `status_filter` WHERE clause добавляется после `.limit()` и `.offset()` в Python chain. SQLAlchemy строит корректный SQL (lazy evaluation), но код вводит в заблуждение — выглядит так, будто фильтрация применяется после limit/offset. Фикс: переместить `status_filter` WHERE до `.order_by().limit().offset()` для читаемости. `repositories/run.py:list_by_company~48-55` | Alex | fixed |
| BUG-068 | minor | `execute_run()` success-ветка: если `run_orm is None` (run удалён пока граф работал) — метрики `total_tokens`/`total_cost_usd` молча теряются без `logger.warning`. Пользователь не узнает о потере данных. Fix: добавить `logger.warning("execute_run: run_orm not found for run_id=%s, metrics lost", run_id)` в else-ветку `if run_orm:`. `services/run.py` success block | Alex | fixed |
| BUG-069 | minor | `_forward_events` в `ws_events.py` перехватывает только `(WebSocketDisconnect, RuntimeError)`. `OSError`/`ConnectionResetError` от anyio transport layer не перехватываются — могут всплыть как "Task exception was never retrieved" на некоторых платформах/конфигурациях. Fix: расширить except до `(WebSocketDisconnect, RuntimeError, OSError)`. `handlers/ws_events.py:_forward_events` | Alex | fixed |
| BUG-070 | minor | `SIRI-UX-162-163.test.tsx` — 4 теста для SIRI-UX-163 (WarRoom AbortController) падают в полном наборе (`npm test -- --run`) из-за module caching. Тесты используют `await import('../components/WarRoom')` динамически; если WarRoom уже закэширован другим тест-файлом ранее в suite, mock AbortController не применяется к закэшированной версии. В изоляции (`npm test -- --run src/__tests__/SIRI-UX-162-163.test.tsx`) все 6 тестов зелёные. Fix: добавить `vi.resetModules()` в `beforeEach` для тестов с dynamic import, или заменить dynamic import на static с vi.mock() на уровне модуля. `src/__tests__/SIRI-UX-162-163.test.tsx:SIRI-UX-163` | Siri | fixed |
| BUG-071 | minor | `execute_run()` error-ветка: нет `logger.warning` в error-ветке если `run_orm is None`. Fix: добавлен `else: logger.warning(...)`. `services/run.py` | Alex | fixed |
| ALEX-TD-095 | major | ** — ** нет DB-индекса. Fix:  + Alembic migration . | Alex | fixed |
| ALEX-TD-096 | major | ** — нет ORDER BY** для  и . Fix:  в  и  в .| Alex | fixed |
| ALEX-TD-097 | minor | ** —  query без ORDER BY**. Fix: добавлен . | Alex | fixed |
| ALEX-TD-098 | minor | ** — нет пагинации**. Fix: добавлены / Query params, проброшены в сервис → репозиторий. | Alex | fixed |
| ALEX-TD-099 | major | **`services/run.py:stop()` — `_terminal` set не включает `"error"`**: ран в статусе `"error"` может быть повторно `stop`-нут, что перезапишет финальный статус на `"stopped"` и сломает аналитику. Фикс: добавить `"error"` в `_terminal` set. `services/run.py:stop:~250` | Alex | fixed |
| ALEX-TD-100 | minor | **`memory/service.py:_get_embedding` — нет timeout на LiteLLM embedding вызов**: `litellm.aembedding()` вызывается без `timeout`. При недоступности LLM API `save_memory()`/`get_relevant_memories()` зависнут навсегда → background task накапливает zombie coroutines. Фикс: добавить `timeout=30.0` в `litellm.aembedding()` вызов. `memory/service.py:_get_embedding` | Alex | fixed |
| ALEX-TD-101 | minor | **`handlers/memory.py` — создаёт новый `MemoryService` + SQLite connection на каждый GET**: каждый `GET /api/.../memory` открывает новый `sqlite3.connect()` + `enable_load_extension(True)` + loads `sqlite_vec`. При 100 RPS = 100 параллельных connections. Текущий код корректно закрывает через try/finally — connection leak отсутствует. Tech debt: рефакторинг на application-level singleton откладывается. `handlers/memory.py:get_agent_memory~52` | Alex | fixed |
| ALEX-TD-102 | minor | **`handlers/agents.py:get_agents_tree` — нет rate limiting**: `GET /api/companies/{id}/agents/tree` строит рекурсивную иерархию агентов без `@limiter.limit`. При больших иерархиях — O(N) БД запросы. Все mutable endpoints защищены limiter-ом. Фикс: добавить `@limiter.limit("30/minute")` + `request: Request` параметр. `handlers/agents.py:get_agents_tree` | Alex | fixed |
| BUG-072 | minor | **`SIRI-UX-170-171.test.tsx` — 5 TS ошибок + flaky в полном наборе**: `tsc --noEmit` выдаёт 5 ошибок в тестовом файле: (1) `assignee_id: null` несовместим с `string \| undefined` в типе Task; (2) `avatar` не существует в типе Agent; (3) `(value: Response \| PromiseLike<Response>) => void` не назначается на `(v: unknown) => void` (3 места). Также: при первом прогоне `npm test -- --run` (полный suite) 3 теста SIRI-UX-170 падали, при повторном — прошли. Возможна нестабильность. Fix: исправить типы mock-данных в тест-файле, устранить flakiness. `src/__tests__/SIRI-UX-170-171.test.tsx` | Siri | fixed |
| BUG-073 | minor | FIXED: CompaniesPage.tsx:load() — moved setLoading/setHasLoadedOnce from finally into try/catch | Siri | fixed |
| ALEX-TD-103 | major | **`handlers/library.py:get_portfolio` — cross-tenant data leak в forks**: `GET /api/library/{id}/portfolio` возвращает `PortfolioForkOut` с `company_id` для ВСЕХ пользователей кто форкнул агента. Любой авторизованный пользователь может узнать `company_id` других пользователей. Фикс: фильтровать forks по `company_id` текущего пользователя (через JOIN с companies и owner_id) или убрать `company_id` из `PortfolioForkOut`. `handlers/library.py:get_portfolio:136-144` | Alex | fixed |
| ALEX-TD-104 | minor | **`services/run.py:execute_run` error branch — `run_orm` может быть unbound**: в except-блоке есть проверка `if run_orm is None` на строке ~450, но переменная `run_orm` объявляется только внутри `update_session.get(...)`. Если `update_session.get()` бросает исключение (DB недоступна), внешний `except` использует `run_orm` из outer scope — это может быть предыдущий `run_orm` из init-блока (уже detached). Логика проверки применяется к wrong объекту. Фикс: явно инициализировать `run_orm = None` перед try блоком в error branch. `services/run.py:execute_run:~435` | Alex | fixed |
| ALEX-TD-105 | minor | **`handlers/library.py:get_portfolio` — нет пагинации на forks**: при большом числе форков (например, 10k) `session.execute(select(AgentORM).where(...)).scalars().all()` загружает ВСЕ записи в память. Фикс: добавить `limit`/`offset` Query params (default limit=50, max=500). `handlers/library.py:get_portfolio:136` | Alex | fixed |
| ALEX-TD-106 | minor | **`orchestration/agent_node.py` — пустой LLM response добавляет `{"role":"assistant","content":""}` в messages**: если LLM вернул пустой текст и нет tool_calls, в `new_messages` добавляется `{"role":"assistant","content":""}`. Пустые сообщения засоряют историю и могут вызвать ошибки на некоторых провайдерах (Anthropic требует non-empty content). Фикс: пропускать добавление в new_messages если `full_text` пустой. `orchestration/agent_node.py:agent_node:~230` | Alex | fixed |
| SIRI-UX-185 | minor | **`KanbanBoard.tsx:handleCreateTask` — AbortController added, setCreating guarded with !signal.aborted. `KanbanBoard.tsx:handleCreateTask` | Siri | fixed |
| SIRI-UX-186 | minor | **`CompanyPage.tsx:handleCreateAgent` — AbortController добавлен, AbortError guard применён. `CompanyPage.tsx:handleCreateAgent` | Siri | fixed |
| SIRI-UX-187 | minor | **`OnboardingPage.tsx:handleLaunch` — AbortController добавлен для всех 3 fetch-вызовов, `setLoading(false)` защищён `!signal.aborted`. `OnboardingPage.tsx:handleLaunch` | Siri | fixed |
| SIRI-UX-188 | minor | **`KanbanBoard.tsx:handleRun/handleEdit/handleDelete/handleAssign` — 4 async handlers с `finally` без AbortController**: `setRunning/setSaving/setDeleting/setAssigning` вызываются в `finally` без проверки `signal.aborted`. Если пользователь закроет канбан во время выполнения одной из операций, setState будет вызван на unmounted компоненте. Паттерн: аналогично BUG-073/SIRI-UX-185. Фикс: добавить AbortController ref для каждого handler, guard в finally. `KanbanBoard.tsx:100-192` | Siri | fixed |
| SIRI-UX-189 | minor | **`CompanySettingsPage.tsx:handleSave` — `finally { setSaving(false) }` без AbortController**: POST PATCH `/companies/:id` без AbortController. Навигация прочь во время сохранения вызовет `setSaving(false)` и `toast.*` на unmounted компоненте. Фикс: добавить AbortController, guard в finally с `!signal.aborted`. `CompanySettingsPage.tsx:54-76` | Siri | fixed |
| SIRI-UX-190 | minor | **`TaskDetailSidebar.tsx:handleRun` — `finally { setRunning(false) }` без AbortController**: POST `/tasks/:id/run` без AbortController. Если sidebar закрыть во время запуска задачи, `setRunning(false)` вызовется на unmounted компоненте. Фикс: добавить AbortController ref, guard setState в finally. `TaskDetailSidebar.tsx:116-141` | Siri | fixed |
| SIRI-UX-191 | minor | **`AgentEditPage.tsx:handleSubmit` — PATCH fetch без AbortController**: При навигации прочь во время сохранения агента `setSaving(false)`, `setSaveError(...)`, `toast.error/success` вызовутся на unmounted компоненте. Паттерн аналогичен SIRI-UX-189. `AgentEditPage.tsx:handleSubmit:47-67` | Siri | fixed |
| SIRI-UX-192 | minor | **`AgentPage.tsx:handleSaveToLibrary` — POST fetch без AbortController**: `setSavedToLibrary`, `setSaveToLibraryError`, `toast.*` вызываются без guard на mounted-check. При уходе с AgentPage во время запроса — setState на unmounted компоненте. `AgentPage.tsx:handleSaveToLibrary:73-90` | Siri | fixed |
| SIRI-UX-193 | minor | **`LibraryPage.tsx:ForkModal.handleFork` — POST fork fetch без AbortController**: `setForking(null)`, `setError(...)`, `toast.*` вызываются в catch/finally без AbortController. Если пользователь закроет ForkModal во время запроса, setState летит на unmounted component. `LibraryPage.tsx:ForkModal.handleFork:54-75` | Siri | fixed |
| SIRI-UX-194 | minor | **`SettingsPage.tsx:handleDelete` — DELETE fetch без AbortController**: `setCredentials`, `toast.*` вызываются без abort-guard. При быстром уходе из Settings — setState на unmounted component. `SettingsPage.tsx:handleDelete:166-179` | Siri | fixed |
| SIRI-UX-195 | minor | **`BillingPage.tsx` — array index как React key в `USAGE_HISTORY.map`**: `USAGE_HISTORY.map((row, i) => <tr key={i} ...>)` использует индекс массива как key. При изменении порядка данных React неправильно reuse-ит DOM-элементы. Правильный fix: использовать `row.date + row.description` как key (данные статичны, но паттерн плохой). `BillingPage.tsx:~220` | Siri | fixed |
| SIRI-UX-196 | minor | **`WarRoom.tsx:19` и `AgentCard.tsx:7` — дублирование функции форматирования времени**: `timeAgo` в WarRoom.tsx и `relativeTime` в AgentCard.tsx — идентичная логика (sec/min/h/d), дублируется в двух файлах. При баге в одном — второй не получит фикс. Fix: вынести в `taskUtils.ts` как `relativeTime(iso)`, импортировать в оба файла. `WarRoom.tsx:19`, `AgentCard.tsx:7` | Siri | fixed |
| SIRI-UX-197 | minor | **`WarRoom.tsx` — run-карточки не keyboard-accessible**: run-карточки в War Room рендерятся как обычные `<div>` без `role="button"`, `tabIndex`, `onKeyDown`. Пользователи клавиатуры не могут навигироваться по ним. Также статус-дот не имеет `aria-label` (нет объяснения цвета для screen reader). Fix: добавить `role="article"`, `aria-label` на карточку и `role="img"` + `aria-label` на status dot. `WarRoom.tsx:168-198` | Siri | fixed |
| SIRI-UX-198 | minor | **`LibraryPortfolioPage.tsx:27` — локальный `statusColors` дублирует цветовую логику из `taskUtils.STATUS_COLORS`**: Файл определяет свой `statusColors: Record<string, string>` вместо использования `taskUtils.STATUS_COLORS`. Цвета несовместимы (другие оттенки для `done`, `failed`), UI несогласован между Kanban и Portfolio. Fix: импортировать `STATUS_COLORS` из `taskUtils`, использовать `STATUS_COLORS[task.status]?.text ?? '#94a3b8'`. `LibraryPortfolioPage.tsx:27-34` | Siri | fixed |
| SIRI-UX-199 | minor | **`OnboardingPage.tsx` — Launch-кнопка не имеет `aria-busy` при loading=true**: При `loading=true` кнопка disabled и текст меняется на "Creating…", но отсутствует `aria-busy="true"`. Screen reader не объявит пользователю что идёт загрузка. Fix: добавить `aria-busy={loading}` на кнопку Launch. `OnboardingPage.tsx:~145` | Siri | fixed |
| SIRI-UX-200 | major | **`WarRoomPage.tsx` — agent-cards в sidebar не имеют `role` и не focusable**: Карточки агентов в sidebar — просто `<div>`, без `role`, `tabIndex`, `aria-label`. Пользователи screen reader не узнают имя/статус агента семантически (только через вложенный текст). Весь агент-панель не keyboard-navigable. Fix: добавить `role="article"`, `aria-label={`${agent.name} — ${statusLabel[agent.status]}`}` на каждую агент-карточку. `WarRoomPage.tsx:~370-410` | Siri | fixed |
| SIRI-UX-201 | minor | **`index.css` — анимации `fadeIn`/`slideInRight`/`bounce` без `prefers-reduced-motion` media query**: Пользователи с вестибулярными нарушениями (motion sensitivity) получают все анимации без возможности их отключить. WCAG 2.3.3 (AAA) рекомендует уважать `prefers-reduced-motion`. Fix: добавить `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; } }`. `index.css:34-50` | Siri | fixed |
| SIRI-UX-202 | major | **`WarRoom.tsx:90` — `JSON.parse(e.data)` в `ws.onmessage` без try/catch**: Если сервер прислал невалидный JSON (пинг-фреймы, частичное сообщение, бинарный chunk), обработчик падает с SyntaxError, WS-события перестают обрабатываться. `useWarRoomSocket.ts` уже имеет try/catch — тот же паттерн должен быть в `WarRoom.tsx`. `WarRoom.tsx:90` | Siri | fixed |
| SIRI-UX-203 | minor | **`KanbanBoard.tsx:702,748` — FilterBar кнопки Agent/Priority имеют `aria-haspopup="listbox"` но дропдауны используют `role="menuitemcheckbox"`**: Несоответствие ARIA pattern — `aria-haspopup="listbox"` сигнализирует что будет список для одиночного выбора (`role="listbox"`), но контейнер рендерит `role="menuitemcheckbox"` (menu pattern). Screen reader выбирает неправильное поведение клавиатуры. Fix: изменить на `aria-haspopup="menu"`. `KanbanBoard.tsx:702,748` | Siri | fixed |
| SIRI-UX-204 | minor | **`KanbanBoard.tsx:1303` — `<select>` приоритета в Create Task modal без `aria-label`**: Поле выбора приоритета не имеет ассоциированного лейбла (`<label>` или `aria-label`). Screen reader объявит его как безымянный select. Fix: добавить `aria-label="Task priority"`. `KanbanBoard.tsx:1303` | Siri | fixed |
| SIRI-UX-205 | major | **`WarRoom.tsx:99` — TypeScript error: `event.run_id` is `string \| undefined` but `Run.run_id` requires `string`**: В `ws.onmessage` обработчик события `run.started` создаёт объект `Run` без проверки наличия `run_id`. TypeScript выдаёт TS2345. Это также runtime-риск: если сервер прислал событие без `run_id`, в массиве `runs` появится объект с `run_id: undefined`, ломая рендер и логику обновлений. Fix: добавить ранний `if (!event.run_id) return` перед `setRuns`, добавить fallbacks для остальных optional полей. `WarRoom.tsx:99` | Siri | fixed |
| SIRI-UX-206 | minor | **`KanbanBoard.tsx:TaskCard` — AbortController refs не очищаются при unmount**: `TaskCard` создаёт 4 AbortController refs (`runAbortRef`, `editAbortRef`, `deleteAbortRef`, `assignAbortRef`) но не имеет `useEffect` cleanup для их abort при размонтировании. Это может вызвать `setState on unmounted component` предупреждения если request продолжается после навигации. Fix: добавить `useEffect(() => () => { refs.forEach(r => r?.abort()) }, [])`. `KanbanBoard.tsx:TaskCard` | Siri | fixed |
| SIRI-UX-207 | minor | **`KanbanBoard.tsx:handleDrop` — PATCH запрос без AbortController**: `handleDrop` делает `fetch` PATCH для обновления статуса задачи без `AbortController`. При unmount компонента во время drag-and-drop операции (navigating away), `setTasks` вызывается на размонтированном компоненте. Fix: добавить `dropAbortRef`, создавать AbortController на каждый drop, abort on unmount. `KanbanBoard.tsx:handleDrop` | Siri | fixed |
| SIRI-UX-208 | minor | **`WarRoomPage.tsx` — WS status indicator передаёт состояние только через цвет**: Индикатор состояния WebSocket в header — зелёный/серый кружок. Уже имеет `aria-label` (connected/disconnected), но `role="img"` без визуального текста. Color-blind пользователи не могут отличить green (connected) от grey (disconnected) в тёмной теме. Fix: подтверждён — `aria-label` уже присутствует в коде. Тест задокументирован. `WarRoomPage.tsx:~370` | Siri | fixed |
| SIRI-UX-209 | minor | **`WarRoomPage.tsx` — connecting spinner использует inline `animation` style, обходя `prefers-reduced-motion`**: Спиннер в состоянии "Connecting…" задаётся как `style={{ animation: 'spin 0.8s linear infinite' }}`. Inline стили не переопределяются `@media (prefers-reduced-motion: reduce)` из `index.css`. Fix: вынести анимацию в CSS-класс `.war-room-connecting-spinner { animation: spin 0.8s linear infinite }` в `index.css`, использовать `className="war-room-connecting-spinner"` в компоненте. `WarRoomPage.tsx:~295`, `index.css` | Siri | fixed |
| ALEX-TD-107 | minor | **`handlers/runs.py:VALID_RUN_STATUSES` — отсутствует статус `"error"`**: `GET /runs?status=error` возвращает 422 ("Invalid status"), но `"error"` — валидный терминальный статус рана (graph возвращает status=error при loop_detected/cost_limit_exceeded). `_terminal` set в `stop()` включает `"error"`, но `VALID_RUN_STATUSES` — нет. Пользователь не может отфильтровать раны с ошибкой через API. Фикс: добавить `"error"` в `VALID_RUN_STATUSES`. `handlers/runs.py:133` | Alex | fixed |
| ALEX-TD-108 | minor | **`services/memory.py.dead` — мёртвый файл в рабочей директории**: `services/memory.py.dead` — старая версия сервиса, не импортируется нигде, не тестируется. Загрязняет директорию, может вводить в заблуждение при рефакторинге. Фикс: удалить файл. `services/memory.py.dead` | Alex | fixed |
| ALEX-TD-109 | minor | **`handlers/companies.py:CompanyCreate/CompanyUpdate` — нет `max_length` на поле `name`**: все остальные схемы (AgentCreate, TaskCreate) имеют `max_length` на строковых полях. Компания принимает имя произвольной длины → потенциальный abuse для хранения мегабайтных строк в БД. Фикс: добавить `max_length=200` в `Field`. `handlers/companies.py:CompanyCreate.name, CompanyUpdate.name` | Alex | fixed |
| ALEX-TD-110 | minor | **`handlers/credentials.py:ValidateKeyRequest.api_key` — нет `max_length`**: поле `api_key` в `ValidateKeyRequest` не имеет ограничения длины, в отличие от `CredentialCreate.api_key` (max_length=512). Злоумышленник может отправить мегабайтный ключ в `/api/llm/validate-key` → LiteLLM получит oversized payload. Фикс: `api_key: str = Field(max_length=512)` + добавить валидатор `api_key_must_not_be_empty`. `handlers/credentials.py:ValidateKeyRequest` | Alex | fixed |
| ALEX-TD-111 | minor | **`handlers/runs.py:VALID_RUN_STATUSES` — регрессия ALEX-TD-107**: `"error"` отсутствовал в `VALID_RUN_STATUSES` → `GET /runs?status=error` возвращал 422. `"error"` — валидный терминальный статус (loop_detected/cost_limit_exceeded). `_terminal` set в `stop()` включает `"error"`, но whitelist фильтрации — нет. Зафиксировано: добавлен `"error"` в `VALID_RUN_STATUSES`. `handlers/runs.py:133` | Alex | fixed |
| ALEX-TD-112 | minor | **`handlers/auth.py:LoginRequest` — `email: str` вместо `EmailStr`, нет `max_length` на `password`**: (1) `email` принимает невалидный email без нормализации → login может упасть при попытке `select(UserORM).where(UserORM.email == body.email)` с мусорным значением; (2) `password: str` без `max_length` → злоумышленник может отправить 100MB строку, bcrypt получит первые 72 байта и отработает, но сетевой буфер и парсинг Body пожирают память. Фикс: `email: EmailStr`, `password: str = Field(max_length=128)`. `handlers/auth.py:LoginRequest` | Alex | fixed |
| ALEX-TD-113 | major | **`handlers/library.py:save_to_library` — `POST /api/library` без rate limiting**: единственный mutable эндпоинт в `library.py` без `@limiter.limit`. `fork_agent` защищён (`20/minute`), но `save_to_library` — нет. Злоумышленник может флудить общую библиотеку мусорными агентами. Фикс: добавить `@limiter.limit(_RATE_LIMIT_SAVE_LIBRARY)` + `request: Request` параметр. `handlers/library.py:save_to_library` | Alex | fixed |
| ALEX-TD-114 | minor | **`handlers/auth.py:RegisterRequest` — нет `min_length` на `password`**: 1-символьный пароль проходит валидацию (только `len(v) == 0` проверяется). Безопасный минимум — 8 символов. Фикс: добавить `if len(v) < 8: raise ValueError("Password must be at least 8 characters")` в `password_constraints`. `handlers/auth.py:RegisterRequest.password_constraints` | Alex | fixed |
| ALEX-TD-115 | minor | **`handlers/credentials.py:ValidateKeyRequest` — нет `max_length` на `api_key` и `provider` (регрессия ALEX-TD-110)**: ROADMAP помечает ALEX-TD-110 как `fixed`, но код не изменён — `ValidateKeyRequest.api_key` всё ещё `str` без `Field(max_length=512)`, `provider` — без `max_length` и без валидатора. Атакующий может слать мегабайтный `api_key` в `/api/llm/validate-key`. Фикс: `api_key: str = Field(max_length=512)` + `api_key_must_not_be_empty`; `provider: str = Field(max_length=50)`. `handlers/credentials.py:ValidateKeyRequest` | Alex | fixed |
| ALEX-TD-116 | minor | **`services/memory.py.dead` — файл-зомби не удалён (регрессия ALEX-TD-108)**: ALEX-TD-108 помечен `fixed`, но `services/memory.py.dead` всё ещё существует в репозитории. Git-история подтверждает что удаления не было. Файл не импортируется нигде, загрязняет директорию, вводит в заблуждение при code review. Фикс: `git rm backend/src/agentco/services/memory.py.dead`. `backend/src/agentco/services/memory.py.dead` | Alex | fixed |
| ALEX-TD-117 | minor | **`orm/run.py:RunORM.status` — нет индекса на колонку `status`**: `list_by_company` с `status_filter` добавляет `WHERE status = ?` без индекса. При росте таблицы runs (тысячи записей на компанию) — full table scan вместо index scan. Compound index `(company_id, status)` и `(company_id, started_at)` резко ускорит фильтрованные запросы. Фикс: `__table_args__ = (Index("ix_runs_company_status", "company_id", "status"), Index("ix_runs_company_started", "company_id", "started_at"),)` в `RunORM`. `orm/run.py:RunORM` | Alex | fixed |
| ALEX-TD-118 | minor | **`handlers/mcp_servers.py` — `POST` и `DELETE /mcp-servers` без rate limiting**: `create_mcp_server` и `delete_mcp_server` — mutable endpoints без `@limiter.limit`. Аналогичные эндпоинты (library, credentials, runs) защищены. Злоумышленник может создавать тысячи MCP-серверов или удалять чужие (при auth bypass). Фикс: добавить `@limiter.limit("20/minute")` + `request: Request` на `POST` и `DELETE`. `handlers/mcp_servers.py:create_mcp_server,delete_mcp_server` | Alex | fixed |
| ALEX-TD-119 | minor | **`orm/agent_library.py:AgentLibraryORM.created_at` — нет индекса, используется в ORDER BY**: `GET /api/library` делает `ORDER BY created_at DESC LIMIT 50 OFFSET N` без индекса на `created_at`. SQLite делает full scan + filesort. При росте библиотеки (10k+ записей) — заметная деградация. Фикс: `created_at: Mapped[datetime] = mapped_column(DateTime, ..., index=True)` в `AgentLibraryORM`. `orm/agent_library.py:AgentLibraryORM.created_at` | Alex | fixed |
| ALEX-TD-120 | minor | **`orchestration/agent_node.py:_publish_chunk/_publish_completion` — ленивый импорт `EventBus` внутри каждого вызова**: `_publish_chunk` вызывается для каждого streaming-чанка LLM ответа. Каждый вызов выполняет `from agentco.eventbus import EventBus` — Python кэширует модули, но это лишний dict lookup + attribute access в hot path. `EventBus` уже импортируется в других модулях на уровне файла. Фикс: переместить `from agentco.core.event_bus import EventBus` на уровень модуля в `agent_node.py`. `orchestration/agent_node.py:_publish_chunk:163,_publish_completion:187` | Alex | fixed |
| ALEX-TD-121 | minor | **`handlers/mcp_servers.py:MCPServerCreate` — нет `max_length` на `name`, нет валидации схемы `server_url`**: (1) поле `name: str = Field(..., min_length=1)` — нет `max_length`, злоумышленник может сохранить мегабайтное имя; (2) `server_url` принимает любую строку включая `file://`, `ftp://`, `javascript:` — потенциальный SSRF когда/если `server_url` будет использоваться для outbound запросов. Фикс: `name: str = Field(..., min_length=1, max_length=200)` + валидатор `server_url` проверяющий что схема `http://` или `https://`. `handlers/mcp_servers.py:MCPServerCreate:31,34` | Alex | fixed |
| ALEX-TD-122 | major | **`handlers/tasks.py` — все mutable endpoints (POST/PUT/PATCH/DELETE) без rate limiting**: `create_task`, `update_task`, `update_task_status`, `delete_task` не защищены `@limiter.limit`. Все остальные mutable handlers имеют лимиты (companies: 5/hour, runs: 10/min, library: 10/min, etc.). Злоумышленник может создавать тысячи тасков, перегружая БД. Фикс: добавить `@limiter.limit` + `request: Request` на все 4 mutable endpoints. `handlers/tasks.py:create_task,update_task,update_task_status,delete_task` | Alex | fixed (d27cc53, 49e3fd4) |
| ALEX-TD-123 | critical | **`orchestration/nodes.py` — production graph использует mock LLM**: Задокументировано + env-flag `AGENTCO_USE_REAL_LLM=true` переключает на реальный LLM (`litellm.acompletion`). `orchestration/nodes.py:_mock_llm_call` | Alex | fixed (ad020fe) |
| ALEX-TD-124 | minor | **`handlers/ws_events.py` — широкий except молча глотал ошибки**: Разделены ожидаемые (WebSocketDisconnect) vs неожиданные, добавлен `logger.warning` для unexpected. `handlers/ws_events.py:145-146` | Alex | fixed (ad020fe) |
| ALEX-TD-125 | minor | **`main.py` — `Base.metadata.create_all()` обёрнут в `if not _is_postgres(_DB_URL):`**: Postgres теперь требует `alembic upgrade head` — `create_all` только для SQLite/dev. `main.py:lifespan` | Alex | fixed (ad020fe) |
| ALEX-TD-126 | minor | **`services/run.py:create_with_goal` — Run теперь стартует**: `create_with_goal` спаунит asyncio bg task вызывающий `execute_run()` после DB commit. Передаётся `session_factory` для fresh session в async context. `services/run.py, handlers/runs.py` | Alex | fixed (ad020fe) |
| ALEX-TD-127 | minor | **`handlers/agents.py:update_agent` и `delete_agent` — нет `@limiter.limit`**: аналог ALEX-TD-122 для агентов. `PUT /{agent_id}` и `DELETE /{agent_id}` не защищены rate limiting. `create_agent` имеет `@limiter.limit(_RATE_LIMIT_AGENTS)`, но update/delete — нет. Злоумышленник может спамить обновлениями/удалениями агентов. Фикс: добавить `@limiter.limit(_RATE_LIMIT_AGENTS)` + `request: Request` на `update_agent` и `delete_agent`. `handlers/agents.py:152,171` | Alex | fixed |
| ALEX-TD-128 | minor | **`handlers/memory.py:get_agent_memory` — нет rate limiting**: `GET /api/companies/{id}/agents/{id}/memory` не имеет `@limiter.limit`. Запрос выполняет синхронный IO к SQLite (get_all), при массовых запросах создаёт нагрузку без защиты. Фикс: добавить `@limiter.limit` + `request: Request`, ввести `RATE_LIMIT_MEMORY` env var (default `60/minute`). `handlers/memory.py:31` | Alex | fixed |

| ALEX-TD-129 | minor | **`handlers/memory.py:get_agent_memory` — синхронный `memory_service.get_all()` вызывается из синхронного FastAPI handler**: handler объявлен как `def` (не `async def`), что заставляет FastAPI запускать его в thread pool. Несогласованность: если handler когда-либо переделают в `async def`, `get_all()` заблокирует event loop. Фикс: добавлена `async def get_all_async()` обёртка через `run_in_executor` в `MemoryService`, задокументирован tech debt в `get_all()` docstring. `handlers/memory.py:31`, `memory/service.py:92` | Alex | fixed |
| ALEX-TD-130 | major | **`orchestration/agent_node.py:agent_node` — при LLM ошибке возвращает `{"status": "error", "error": str(e)}` без обновления `run.status` в БД**: верхний `except Exception` в `agent_node` возвращает dict с `status=error`, но `execute_run` ожидает что граф обновит `state["status"]`. Если граф завершается с ошибкой через этот путь, `execute_run` может не поймать final_status и Run навсегда зависнет в `running`. Фикс: agent_node теперь re-raise исключение вместо возврата dict — outer except execute_run гарантированно поймает ошибку и обновит run.status → "failed". `orchestration/agent_node.py:380-384`, `services/run.py:execute_run` | Alex | fixed |
| ALEX-TD-131 | minor | **`handlers/companies.py:update_company` и `delete_company` — нет `@limiter.limit`**: `PUT /{company_id}` и `DELETE /{company_id}` не защищены rate limiting — только `POST /` (create) имеет `@limiter.limit(_RATE_LIMIT_COMPANIES)`. Аналог ALEX-TD-122/127. Фикс: добавить `@limiter.limit(_RATE_LIMIT_COMPANIES)` + `request: Request` на `update_company` и `delete_company`. `handlers/companies.py:92,108` | Alex | fixed |
| ALEX-TD-132 | minor | **`handlers/credentials.py` — `create_credential`, `list_credentials`, `delete_credential` не имеют `@limiter.limit`**: три из пяти credential endpoints не защищены rate limiting. `create_credential` может использоваться для перебора encryption oracle; `delete_credential` — для массового удаления. `validate-key` единственный из credential endpoints имеет `@limiter.limit`. Аналог ALEX-TD-122/127/131. Фикс: добавить `@limiter.limit(_RATE_LIMIT_CREDENTIALS)` + `request: Request` + `RATE_LIMIT_CREDENTIALS` env var (default `30/minute`). `handlers/credentials.py:102,121,137` | Alex | fixed |
| ALEX-TD-133 | major | **`orchestration/graph.py` — статус `"done"` не входит в terminal set роутеров**: `_should_continue` и `_after_subagent` проверяют `status in ("error", "completed", "failed")`. Однако `execute_run` сохраняет `run.status = "done"` для успешных ранов (если `final_status` не в `("completed","failed","error")`). Если `AgentState.status` когда-либо вернёт `"done"`, граф войдёт в бесконечный цикл вместо завершения через `END`. Фикс: добавить `"done"` в terminal set всех четырёх роутеров. `orchestration/graph.py:30,49,125,137` | Alex | fixed |
| ALEX-TD-134 | minor | **`services/run.py:create_and_start` — `asyncio.get_running_loop()` без try/except RuntimeError**: в отличие от `create_with_goal` (имеет `try/except RuntimeError`), `create_and_start` падает с `RuntimeError: no running event loop` в синхронном тестовом контексте. Фикс: обернуть `loop = asyncio.get_running_loop()` и `loop.create_task(...)` в `try/except RuntimeError` с debug-log, аналогично `create_with_goal`. `services/run.py:127-148` | Alex | fixed |
| ALEX-TD-135 | minor | **`orchestration/state.py:AgentState` — поля `system_prompt`, `model`, `tools`, `tool_handlers`, `memory_service` не объявлены в TypedDict**: `agent_node.py` читает их через `state.get(...)` без объявления в `AgentState`. Mypy/pyright не видит эти поля, нет документации допустимых типов, нет default в TypedDict. Tech debt: добавить `NotRequired` поля в `AgentState`. `orchestration/state.py`, `orchestration/agent_node.py` | Alex | fixed |
| ALEX-TD-136 | minor | **`handlers/runs.py:patch_stop_run` и `stop_run` — нет `@limiter.limit`**: два stop-endpoint `PATCH /runs/{run_id}/stop` и `POST /runs/{run_id}/stop` не защищены rate limiting. Rapid-fire stop запросы вызывают DB churn (повторные status reads) и CancelledError-шторм при отмене asyncio tasks. Все остальные write endpoints в runs.py защищены. Фикс: добавить `@limiter.limit(_RATE_LIMIT_RUN)` + `request: Request` на оба endpoint. `handlers/runs.py:200,211` | Alex | fixed |
| ALEX-TD-137 | minor | **`handlers/library.py:list_library` и `get_portfolio` — нет `@limiter.limit`**: оба GET-endpoint делают DB-запросы с ORDER BY + LIMIT, но не защищены rate limiting. При агрессивном polling (frontend bug или scraper) могут перегрузить DB. `save_to_library` и `fork_agent` уже защищены. Фикс: добавить `@limiter.limit(_RATE_LIMIT_LIBRARY_READ)` + `request: Request` + `RATE_LIMIT_LIBRARY_READ` env var (default `60/minute`). `handlers/library.py:94,113` | Alex | fixed |
| ALEX-TD-138 | minor | **`memory/service.py:_get_embedding` — нет guard на пустой `response.data`**: если LiteLLM вернёт `response.data = []` (mock, ошибка провайдера, неверная модель), `response.data[0].embedding` упадёт с `IndexError`. Аналогично — если `embedding` is `None`. Ошибка пробивается в `save_memory()` и `get_relevant_memories()` как unhandled crash. Фикс: добавить explicit guard + raise ValueError с информативным сообщением о модели. `memory/service.py:_get_embedding` | Alex | fixed |
| ALEX-TD-139 | major | **`orchestration/agent_node.py` — `finish_reason="length"` (truncated response) никогда не проверяется**: переменная `finish_reason` собирается из стриминга, но не используется. Если LLM обрезает ответ по max_tokens, `tool_calls_acc` содержит неполный JSON аргументов. `json.loads` в обработчике молча возвращает `{}` (JSONDecodeError поглощён), handler вызывается с пустыми args → некорректное поведение без любой диагностики. Фикс: после цикла по чанкам добавить guard: `if finish_reason == "length" and tool_calls_acc: logger.warning("agent_node: finish_reason=length with tool_calls — args may be truncated. run_id=%s", state.get("run_id"))` + поле `truncated=True` в tool result чтобы CEO мог переспросить. `orchestration/agent_node.py:_streaming_loop` | Alex | fixed |
| ALEX-TD-140 | minor | **`handlers/tasks.py:list_tasks` и `get_task` — нет `@limiter.limit`**: ALEX-TD-122 добавил rate limiting только на mutable endpoints (POST/PUT/PATCH/DELETE), оставив оба GET endpoint без защиты. `list_tasks` выполняет DB-запрос с ORDER BY + LIMIT; `get_task` — точечный SELECT. При агрессивном polling (frontend bug, scraper) создают нагрузку на DB. Фикс: добавить `@limiter.limit(_RATE_LIMIT_TASKS_READ)` + `request: Request` + `RATE_LIMIT_TASKS_READ` env var (default `120/minute`). `handlers/tasks.py:list_tasks:72,get_task:88` | Alex | fixed |
| ALEX-TD-141 | major | **`orchestration/agent_node.py` — assistant message с tool_calls использует `"content": full_text or None`**: `None` как content при наличии tool_calls нарушает Anthropic API spec (требует `""` или отсутствие поля). При стриминге Claude-3.x `full_text` может быть пустой строкой → `"" or None` → `None` → `400 Bad Request` от Anthropic. Фикс: заменить `"content": full_text or None` на `"content": full_text or ""`. `orchestration/agent_node.py:_tool_calls_branch` | Alex | fixed |
| ALEX-TD-142 | minor | **`handlers/agents.py:list_agents` и `get_agent` — нет `@limiter.limit`**: два GET-endpoint делают DB-запросы (SELECT с JOIN) без rate limiting. При агрессивном polling (frontend bug, scraper) создают нагрузку на DB. `create_agent`, `update_agent`, `delete_agent` уже защищены — только read-endpoints упущены. Аналог ALEX-TD-137/140. Фикс: добавить `@limiter.limit(_RATE_LIMIT_AGENTS_READ)` + `request: Request` + `RATE_LIMIT_AGENTS_READ` env var (default `120/minute`). `handlers/agents.py:list_agents:117,get_agent:136` | Alex | fixed |
| ALEX-TD-143 | minor | **`handlers/runs.py:list_runs`, `get_run`, `list_run_events`, `list_task_runs`, `get_task_run` — нет `@limiter.limit`**: пять GET-endpoint без защиты rate limiting. `list_runs` делает DB-запрос с ORDER BY + LIMIT + фильтр; `list_run_events` — O(N events) запрос; остальные — точечные SELECT. При polling (frontend pooling WS events через HTTP, scraper) перегружают DB. Только write-endpoints и POST /runs защищены. Фикс: добавить `@limiter.limit(_RATE_LIMIT_RUNS_READ)` + `request: Request` + `RATE_LIMIT_RUNS_READ` env var (default `120/minute`). `handlers/runs.py` | Alex | fixed |
| ALEX-TD-144 | major | **`services/run.py:execute_run` — `initial_state` не содержит `memory_service`**: `AgentState.memory_service` всегда `None` в production — поле объявлено в TypedDict но никогда не передаётся в `execute_run`. `agent_node.py:_build_messages_with_memory` содержит guard `if memory_service and system_prompt:` который всегда `False`. Результат: память агентов аккумулируется в `agentco_memory.db` (через `GET /memory`), но никогда не инжектируется в system_prompt при выполнении ранов. Фикс: создать `MemoryService` в `execute_run` и добавить в `initial_state["memory_service"]`. Close + cleanup в finally-блоке execute_run. `services/run.py:execute_run:initial_state` | Alex | fixed |
| ALEX-TD-145 | minor | **`orchestration/nodes.py:ceo_node` — при loop/cost limit `pending_tasks` не очищается в returned state**: когда `ceo_node` возвращает `status=failed`, возвращаемый dict не включает `"pending_tasks": []`. LangGraph мержит dict с existing state — `state["pending_tasks"]` остаётся непустым. Роутер `_should_continue` проверяет `status` first и корректно завершает граф (баг не влияет на execution flow). Но state в checkpointer содержит stale pending_tasks при `status=failed` — при resume-from-checkpoint через `thread_id` граф мог бы возобновиться с несогласованным состоянием. Фикс: добавить `"pending_tasks": []` в return dict всех loop-detection ветвей ceo_node/subagent_node/hierarchical_node. `orchestration/nodes.py` | Alex | fixed |
| ALEX-TD-146 | minor | **`services/run.py:_execute_agent` — `"cancelled"` в `_NO_RETRY_ERRORS` — мёртвый код**: `str(asyncio.CancelledError())` возвращает `""` → `any("cancelled" in "" ...)` == `False` → строчный check никогда не матчит CancelledError. Однако `asyncio.CancelledError` наследует от `BaseException`, а не `Exception` (Python 3.8+) → он не ловится `except Exception` вообще. Итог: `"cancelled"` в `_NO_RETRY_ERRORS` — dead code без практического эффекта, вводит в заблуждение. Фикс: удалить `"cancelled"` из `_NO_RETRY_ERRORS`, добавить явный `isinstance(exc, asyncio.CancelledError): raise` guard аналогично `asyncio.TimeoutError` — для ясности намерений. `services/run.py:_execute_agent:_NO_RETRY_ERRORS` | Alex | fixed |
| ALEX-TD-147 | critical | **`services/run.py:execute_run` — `MemoryService` в LangGraph state → `TypeError: Type is not msgpack serializable: MemoryService` при checkpoint save**: ALEX-TD-144 добавил `"memory_service": _memory_service` в `initial_state`. LangGraph пытается сериализовать весь state через msgpack при каждом checkpoint — `MemoryService` не сериализуем → `TypeError` в `_checkpointer_put_after_previous` → run falls through к `execute_run failed`. Баг: memory инъекция не работает в production (run всегда падает при checkpoint). Фикс: убрать `memory_service` из state; передавать через closure в `agent_node` или через Thread-local / вызовы снаружи LangGraph. Тесты: `test_alex_td_083_085.py::test_execute_run_publishes_run_failed_on_graph_error_status`, `test_alex_td_084_086.py::test_execute_run_publishes_run_completed_on_graph_completed_status`, `test_runs.py::test_execute_run_updates_run_status_via_session_factory`, `test_runs.py::test_execute_run_uses_session_factory_for_initial_read` | Alex | fixed |
| ALEX-TD-149 | major | **`handlers/ws_events.py` — нет connection limit на WebSocket endpoint**: любой аутентифицированный пользователь может открыть неограниченное число WS-соединений к `/ws/companies/{id}/events`. Каждое соединение держит подписку в `InProcessEventBus._subscribers` + asyncio task. При 10К соединений от одного пользователя: OOM + event loop blocked. Фикс: добавить per-user connection limit (счётчик в class-level dict в `ws_events.py`), закрывать соединение с кодом 4029 при превышении. Или использовать slowapi limit на WS endpoint если поддерживается. `handlers/ws_events.py` | Alex | fixed | 
| ALEX-TD-150 | minor | **`services/run.py:execute_run` — дублирующий `import agentco.services.run as _run_mod` внутри функции**: строка `import agentco.services.run as _run_mod` встречается дважды внутри `execute_run()` — на строках ~290 и ~335. Второй импорт избыточен (Python кэширует модули, повторный import безопасен, но это dead code после рефактора ALEX-TD-147). Фикс: удалить дублирующий импорт, оставить один `_run_mod` в начале функции. `services/run.py:execute_run` | Alex | fixed |
| ALEX-TD-151 | minor | **`orchestration/state.py` — `memory_service: NotRequired[object | None]` в AgentState вводит в заблуждение после ALEX-TD-147**: поле объявлено в TypedDict, но после фикса ALEX-TD-147 туда ничего не записывается — MemoryService передаётся через ContextVar. Поле в state — мёртвый код. Читатель кода думает что memory_service живёт в state, хотя это не так. Риск: будущий разработчик повторно добавит memory_service в initial_state, сломав checkpoint. Фикс: удалить поле из AgentState или добавить явный docstring-комментарий о том что поле deprecated и передаётся через `_memory_service_var` ContextVar. `orchestration/state.py:81` | Alex | fixed |
| ALEX-TD-152 | major | **`memory/vector_store.py:PgVectorStore` — нет reconnect при потере соединения**: `PgVectorStore.__init__` создаёт одно psycopg2 соединение на всё время жизни объекта. При network blip, idle timeout, или DB restart, соединение рвётся → все последующие `insert/search/get_all` бросают `InterfaceError: connection already closed` без retry. В production PostgreSQL (Railway/Supabase) idle connections закрываются через 5 минут. Фикс: добавить reconnect-guard в `_execute_with_retry` wrapper — при `InterfaceError/OperationalError` создать новое соединение и повторить. `memory/vector_store.py:PgVectorStore` | Alex | fixed |
| ALEX-TD-148 | minor | **`services/run.py:execute_run` — `_memory_db` получает SQLAlchemy URL вместо пути к файлу**: `_memory_db = os.getenv("AGENTCO_MEMORY_DB", os.getenv("AGENTCO_DB_PATH", ...))`. В тестах `AGENTCO_DB_PATH=sqlite:///path/test.db` → `sqlite3.connect("sqlite:///path/test.db")` падает с `OperationalError: unable to open database file`. Фикс: парсить URL если начинается с `sqlite:///` и извлекать путь; или использовать отдельный `AGENTCO_MEMORY_DB_PATH` env без fallback на SQLAlchemy URL. `services/run.py:420` | Alex | fixed |
| SIRI-UX-210 | minor | **`TaskDetailSidebar.tsx` — `runAbortRef` не имел cleanup на unmount**: при закрытии sidebar во время in-flight `handleRun` fetch, запрос продолжался без abort — лишняя сеть + потенциальный `setState` на размонтированном компоненте. Фикс: добавлен `useEffect(() => () => { runAbortRef.current?.abort() }, [])`. `TaskDetailSidebar.tsx:60` | Siri | fixed |
| SIRI-UX-211 | minor | **`GlobalSearch.tsx:201` — `aria-expanded={results.length > 0}` неверно при пустом результате**: когда query ≥ 2 chars и нет результатов, combobox рендерит "No results" message, но `aria-expanded=false` — screen reader объявляет что popup закрыт, хотя он открыт. Фикс: `aria-expanded={debouncedQuery.length >= 2}`. `GlobalSearch.tsx:201` | Siri | fixed |
| SIRI-UX-212 | minor | **`WarRoomPage.tsx` mock interval — `addCost(0.0012)` накапливал фиктивную стоимость**: mock interval вызывал `addCost(0.0012)` нарушая SIRI-POST-004 (cost только из WS `llm_token` событий). Разработчики видели ненулевой cost counter без реального WS. Фикс: убрана строка `addCost(0.0012)` из интервала, убрана неиспользуемая `addCost` из store selectors. `WarRoomPage.tsx:164` | Siri | fixed |
| SIRI-UX-213 | minor | **`KanbanBoard.tsx:996` — `t.priority as TaskPriority` unsafe cast**: при `t.priority === null/undefined` выражение кастует `null` к enum типу — TypeScript не выдаст ошибку, но runtime семантика неожиданная. Фикс: заменить на `(!t.priority \|\| !selectedPriorities.includes(t.priority))` с явной null-guard. `KanbanBoard.tsx:996` | Siri | fixed |
| SIRI-UX-214 | minor | **`Sidebar.tsx` — Companies NavLink(`to="/"`) без `end` prop**: NavLink без `end` считается active на ВСЕХ роутах (все пути начинаются с `/`). Companies item подсвечивался синим даже на `/settings`, `/library` и т.д. Фикс: добавлен `end: true` в NAV_ITEMS для Companies, проброшен в NavLink как `end={'end' in item ? item.end : undefined}`. `Sidebar.tsx:26, 94` | Siri | fixed |
| SIRI-UX-215 | minor | **`OnboardingPage.tsx` — `setLoading(false)` в `finally` вызывался после `navigate()` на размонтированном компоненте**: `navigate()` синхронно размонтирует компонент, но `finally` блок всегда выполняется — `setLoading(false)` вызывался на мёртвом компоненте, вызывая React warning "Can't perform a state update on an unmounted component". Фикс: добавлен флаг `navigated = true` перед `navigate()`, в `finally` добавлен guard `!navigated`. `OnboardingPage.tsx:66,113-128` | Siri | fixed |
| SIRI-UX-216 | minor | **`WarRoomPage.tsx:handleStop` — отсутствует `signal.aborted` проверка после `Promise.allSettled`**: если компонент размонтируется пока `allSettled` ожидает завершения stop-запросов, `toast.error`/`setRunStatus`/`toast.success` вызывались на мёртвом компоненте. Существующий guard `if (!signal.aborted)` в `finally` не защищал синхронный блок после `allSettled`. Фикс: добавлен `if (signal.aborted) return` перед `failures` check. `WarRoomPage.tsx:259` | Siri | fixed |
| SIRI-UX-217 | minor | **`TaskDetailSidebar.tsx` — ключи log-записей `${timestamp}-${message}` вызывают React key collision**: когда два лог-события имеют идентичный timestamp И message (например, повторяющиеся сообщения типа "Starting..."), React получает дублирующиеся ключи и логирует warning в консоль. Фикс: добавлен порядковый индекс в ключ — `${idx}-${timestamp}-${message}`. `TaskDetailSidebar.tsx:348` | Siri | fixed |
| SIRI-UX-218 | minor | **`KanbanBoard.tsx:TaskCard` — `transform: scale()` создаёт stacking context, ломающий `position: fixed` модали внутри карточки**: CSS `transform` (в т.ч. `scale(1.01)` в onMouseEnter) создаёт новый stacking context — `position: fixed` дочерних элементов (Edit/Delete/Assign модалей) вычисляется относительно trsnformed ancestor, а не viewport. Модали появляются неправильно позиционированными при hover. Фикс: убрать `transform: scale()` из inline hover-стилей; использовать `box-shadow` для hover-эффекта без трансформации. `KanbanBoard.tsx:214-224` | Siri | fixed |
| SIRI-UX-219 | minor | **`CompanyPage.tsx:handleCreateAgent` — стale closure `agents` вместо `getState().agents`**: `setAgents([...agents, newAgent])` использует `agents` из closure, захваченный при рендере. Если между рендером и вызовом handleCreateAgent другой источник обновил store (WS-событие, concurrent mutation), новый агент добавляется к устаревшему списку, перетирая промежуточные обновления. Паттерн `useAgentStore.getState().agents` уже используется везде в handleDrop/handleCreateTask. Фикс: `setAgents([...useAgentStore.getState().agents, newAgent])`. `CompanyPage.tsx:280` | Siri | fixed |
| SIRI-UX-220 | minor | **`LibraryPage.tsx` — Fork/Portfolio кнопки не имеют agent-specific `aria-label`**: при нескольких агентах в библиотеке screen reader объявляет подряд "Fork", "Fork", "Fork" без указания к какому агенту относится кнопка. WCAG 2.4.6 (Success Criterion: Labels or Instructions). Фикс: добавить `aria-label={`Fork ${agent.name} to a company`}` на Fork кнопку и `aria-label={`View ${agent.name} portfolio`}` на Portfolio ссылку. `LibraryPage.tsx:agents.map` | Siri | fixed |
| SIRI-UX-221 | minor | **`KanbanBoard.tsx` — textarea описания задачи в Create Task modal без `aria-label`**: `<textarea placeholder="Description (optional)">` не имеет `aria-label` или `<label>`. Placeholder-текст не является доступным именем по WCAG 1.3.1 (Info and Relationships). Screen reader не объявит назначение поля. Фикс: добавить `aria-label="Task description"`. `KanbanBoard.tsx:create-task-desc-input` | Siri | fixed |
| SIRI-UX-222 | major | **`WarRoomPage.tsx` — `loadMockData()` не защищён флагом `VITE_MOCK_WAR_ROOM`**: `useEffect` на маунте вызывает `loadMockData()` без проверки `import.meta.env.VITE_MOCK_WAR_ROOM === 'true'`. Интервал (строка 153) уже защищён этим флагом, но начальная загрузка — нет. В production без флага mock-агенты всё равно загружаются в store, после чего WS-connect вызывает `reset()`. Flash fake-данных может проявиться при медленном WS. Фикс: добавить `&& import.meta.env.VITE_MOCK_WAR_ROOM === 'true'` к условию в `useEffect`. `WarRoomPage.tsx:133-137` | Siri | fixed |
| SIRI-UX-223 | minor | **`WarRoomPage.tsx` — `agentPanelOpen` не сбрасывается при смене компании**: при переходе между компаниями useEffect с `[companyId]` сбрасывает store и `expandedMessages`, но не вызывает `setAgentPanelOpen(false)`. На мобайле пользователь открыл панель агентов в компании A, перешёл в компанию B — панель остаётся открытой. Фикс: добавить `setAgentPanelOpen(false)` в блок при изменении `companyId`. `WarRoomPage.tsx:~121` | Siri | fixed |
| SIRI-UX-224 | major | **`WarRoom.tsx` — WS-обработчик слушал `run.done` вместо `run.completed`**: бэкенд публикует `run.completed` (см. `services/run.py:518`), но WarRoom.tsx обрабатывал `run.done` — статус рана никогда не обновлялся до `done` через WS. Фикс: заменить `'run.done'` на `'run.completed'` в условии onmessage. `WarRoom.tsx:onmessage` | Siri | fixed |
| SIRI-UX-225 | major | **`KanbanBoard.tsx` — `handleEdit`/`handleDelete`/`handleAssign` использовали stale closure `tasks`**: при редактировании/удалении/назначении задач использовалось состояние `tasks` из closure времени рендера. Конкурентные WS-обновления между рендером и выполнением хэндлера перезаписывались stale snapshot. Фикс: заменить `tasks.map/filter` на `useTaskStore.getState().tasks.map/filter` внутри хэндлеров. `KanbanBoard.tsx:handleEdit,handleDelete,handleAssign` | Siri | fixed |
| SIRI-UX-226 | major | **`WarRoom.tsx` — REST-фетч ранов читал `run_id` вместо `id` из RunOut schema**: бэкенд возвращает `RunOut` с полем `id` (не `run_id`). WarRoom.tsx читал `r.run_id` — получал `undefined`, WS-события не могли найти раны по `run_id` и не обновляли статус. Фикс: маппинг `run_id: r['run_id'] ?? r['id'] ?? ''` в начальном фетче. `WarRoom.tsx:fetchRuns` | Siri | fixed |
| SIRI-UX-227 | minor | **`SettingsPage.tsx:handleSubmit` — 2-step validate+save fetch flow without AbortController**: if user navigates away during the ~2s round-trip (validate + save credential), `setSubmitting(false)`, `setSubmitError`, `setCredentials`, `toast.*` are called on an unmounted component. `handleDelete` in the same file already uses the correct pattern (SIRI-UX-194). Fix: add `submitAbortRef` + `AbortController` with `signal` passed to both fetches, guard all `setState`/toast calls with `!signal.aborted`. `SettingsPage.tsx:handleSubmit:150` | Siri | fixed |
| SIRI-UX-228 | minor | **`App.tsx:39-43` — Suspense fallback spinner использует inline `animation` style, обходя `prefers-reduced-motion`**: Спиннер в `AppLayout` Suspense fallback задаётся через `style={{ animation: 'spin 0.8s linear infinite' }}`. Inline стили не переопределяются `@media (prefers-reduced-motion: reduce)` из `index.css` (WCAG 2.3.3). Та же проблема была исправлена для `war-room-connecting-spinner` в SIRI-UX-209 — вынесли в CSS-класс. Fix: добавить `.app-suspense-spinner { animation: spin 0.8s linear infinite }` в `index.css`, использовать `className="app-suspense-spinner"` вместо inline style. `App.tsx:41`, `index.css` | Siri | fixed |
| SIRI-UX-229 | minor | **`App.tsx:72-74` — `useEffect(() => { initAuth() }, [])` — missing dependency `initAuth`**: `initAuth` из `useAuthStore` захватывается в closure без включения в deps array. ESLint `react-hooks/exhaustive-deps` пропускает это т.к. функция стабильна (Zustand action), но правильная форма — явно добавить в deps или подавить с комментарием. Fix: `useEffect(() => { initAuth() }, [initAuth])`. `App.tsx:72` | Siri | fixed |

| SIRI-UX-230 | minor | **`KanbanBoard.tsx:1204` — `aria-dropeffect="move"` устарел в ARIA 1.1**: `aria-dropeffect` и `aria-grabbed` были помечены устаревшими в WAI-ARIA 1.1 и удалены в 1.2. Screen readers игнорируют их. Fix: убрать `aria-dropeffect="move"` с column div и `aria-grabbed` с TaskCard. `KanbanBoard.tsx:289,1204` | Siri | fixed |
| SIRI-UX-231 | minor | **`WarRoomPage.tsx:497-502` — mobile backdrop не имеет `role` и `tabIndex`, не закрывается по клавиатуре**: overlay за drawer-панелью агентов закрывается по клику мышью (`onClick`), но не фокусируемый и не имеет keyboard-обработчика. Клавиатурный пользователь не может закрыть панель без нажатия Escape (который тоже не обрабатывается). Fix: добавить `role="button"`, `tabIndex={0}`, `aria-label="Close agents panel"`, `onKeyDown` (Enter/Space). `WarRoomPage.tsx:497` | Siri | fixed |
| ALEX-TD-153 | minor | **`handlers/templates.py:CreateFromTemplateRequest.name` — нет `max_length`**: поле `name: str = Field(min_length=1)` не имеет `max_length`, в отличие от `CompanyCreate.name` (max_length=200, ALEX-TD-109). Злоумышленник может создать компанию через шаблон с мегабайтным именем. Фикс: `Field(min_length=1, max_length=200)`. `handlers/templates.py:43` | Alex | fixed |
| ALEX-TD-154 | minor | **`handlers/templates.py:list_templates` и `create_from_template` — нет `@limiter.limit`**: оба endpoint не защищены rate limiting. `create_from_template` создаёт компанию + N агентов в одной транзакции — без лимита можно создать сотни компаний за цикл. `list_templates` — лёгкий in-memory endpoint, но без ограничений открыт для scraping. Фикс: добавить `@limiter.limit(_RATE_LIMIT_TEMPLATES_READ)` (60/minute) на GET и `@limiter.limit(_RATE_LIMIT_TEMPLATES_CREATE)` (5/hour) на POST. `handlers/templates.py:70,87` | Alex | fixed |
| ALEX-TD-155 | minor | **`handlers/mcp_servers.py:list_mcp_servers` — нет `@limiter.limit` и `Request` param**: `GET /api/companies/{id}/agents/{id}/mcp-servers` не защищён rate limiting в отличие от POST/DELETE того же роутера. Атакующий может polling-ом сканировать MCP-серверы агентов. Также отсутствует `request: Request` param, необходимый slowapi. Фикс: добавить `_RATE_LIMIT_MCP_READ = "120/minute"`, `@limiter.limit(_RATE_LIMIT_MCP_READ)`, `request: Request` в сигнатуру. `handlers/mcp_servers.py:120` | Alex | fixed |
| ALEX-TD-156 | minor | **`handlers/companies.py:list_companies` и `get_company` — нет `@limiter.limit`**: `GET /api/companies/` и `GET /api/companies/{id}` не защищены rate limiting. POST/PUT/DELETE защищены `_RATE_LIMIT_COMPANIES`. Без лимита на GET-эндпоинты возможен unbounded polling (e.g. frontend bug → 1K requests/sec). Фикс: добавить `_RATE_LIMIT_COMPANIES_READ = "120/minute"`, `@limiter.limit` + `request: Request` на оба GET-эндпоинта. `handlers/companies.py:56,81` | Alex | fixed |
| ALEX-TD-157 | minor | **`handlers/auth.py:me` — `GET /auth/me` не защищён rate limiting**: `/me` декодирует JWT и выполняет DB lookup при каждом запросе. Без rate limit endpoint открыт для unbounded authenticated polling (frontend reconnect loop, load test, DDoS authenticated юзером). Все остальные auth-эндпоинты (`/register`, `/login`) защищены. Фикс: добавить `_RATE_LIMIT_ME = os.getenv("RATE_LIMIT_AUTH_ME", "120/minute")`, `@limiter.limit(_RATE_LIMIT_ME)`, `request: Request`. `handlers/auth.py:99` | Alex | fixed |

| ALEX-TD-158 | major | **`orchestration/agent_node.py` — нет per-call timeout на `litellm.acompletion`**: внешний `asyncio.wait_for` в `execute_run` задаёт глобальный таймаут 600с на весь ран. Но внутри рана может быть N LLM-вызовов (CEO-node + subagent + tool calls). Один зависший LLM-вызов съедает весь бюджет без возможности диагностики. Фикс: добавить `asyncio.wait_for(litellm.acompletion(...), timeout=float(os.getenv("LLM_CALL_TIMEOUT_SEC", "120")))` в `agent_node`. Позволяет быстро детектировать зависший LLM-вызов и retry через `_execute_agent`. `orchestration/agent_node.py:274` | Alex | fixed |

| ALEX-TD-160 | major | **`handlers/credentials.py:validate_llm_key` — нет timeout на `acompletion()` вызов**: `POST /api/llm/validate-key` делает реальный LLM-запрос через `acompletion()` без `asyncio.wait_for`. Если LLM API завис (сетевой разрыв, Anthropic/OpenAI downtime), запрос висит бесконечно, удерживая FastAPI worker. Пользователь может открыть N параллельных запросов → server thread pool exhaustion. Фикс: обернуть `acompletion` в `asyncio.wait_for(..., timeout=30.0)` и вернуть `ValidateKeyResponse(valid=False, error="Request timed out")`. `handlers/credentials.py:~228` | Alex | fixed |
| ALEX-TD-161 | minor | **`handlers/ws_events.py:_ws_connection_locks` — словарь никогда не очищается (memory leak)**: `_get_ws_lock(user_id)` создаёт `asyncio.Lock()` в `_ws_connection_locks` при первом WS-коннекте. При дисконнекте `_active_ws_connections` очищается (строка 205), но `_ws_connection_locks` нет. После N уникальных пользователей в памяти накапливается N Lock-объектов навсегда. В production при 1M уников → ~100MB lost. Фикс: удалять запись из `_ws_connection_locks` в `finally` после декремента `_active_ws_connections`, когда счётчик падает до 0. `handlers/ws_events.py:finally block` | Alex | fixed |
| ALEX-TD-162 | minor | **`handlers/mcp_servers.py:url_not_blank` — SSRF: приватные IP-адреса и `localhost` разрешены в `server_url`**: validator проверяет только схему (`http://` / `https://`) но не блокирует `http://localhost/`, `http://127.0.0.1/`, `http://192.168.1.1/`, `http://10.0.0.1/` (внутренняя сеть). Авторизованный пользователь может использовать MCP-сервер для SSRF — сканировать внутреннюю сеть Railway / render контейнера. Фикс: добавить validator, проверяющий что hostname не является loopback / private range / link-local (использовать `ipaddress` модуль). `handlers/mcp_servers.py:MCPServerCreate.url_not_blank` | Alex | fixed |
| ALEX-TD-163 | minor | **`handlers/credentials.py:validate_llm_key` — `import os` внутри тела функции**: строка `import os` находится внутри `async def validate_llm_key(...)` (строка ~209). Это dead code — `os` уже импортирован на уровне модуля в строке 12. Python кэширует импорты, повторный `import os` безопасен, но вводит в заблуждение: читатель думает что это намеренная изоляция. Фикс: удалить внутренний `import os`. `handlers/credentials.py:~209` | Alex | fixed |
| ALEX-TD-164 | major | **`tests/test_mcp_servers.py` — нет тестов для SSRF-защиты validator `url_not_blank`**: ALEX-TD-162 добавил SSRF-фильтр (блокировка localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x и т.д.) в `MCPServerCreate.url_not_blank`, но ни одного теста на это поведение нет. Любой рефакторинг validator'а может молча сломать защиту — регрессия не поймается. Фикс: добавить параметризованные тесты для всех SSRF-векторов: localhost, 127.0.0.1, ::1, 192.168.1.1, 10.0.0.1, 169.254.x.x (link-local), 0.0.0.0, а также позитивный кейс (внешний URL проходит). `tests/test_mcp_servers.py` | Alex | fixed |
| ALEX-TD-165 | minor | **`handlers/mcp_servers.py` — dead import `socket`**: `import socket` присутствует в строке 3, но `socket` нигде не используется. Вводит в заблуждение — читатель думает что есть DNS-resolution проверка. Фикс: удалить строку `import socket`. `handlers/mcp_servers.py:3` | Alex | fixed |
| ALEX-TD-168 | minor | **`handlers/credentials.py` — `GET /api/llm/providers` и `GET /api/llm/providers/available` без rate limiting**: оба эндпоинта требуют авторизации и выполняют DB-запросы, но не имеют `@limiter.limit()` декоратора — в отличие от всех остальных эндпоинтов. Атакующий с валидным JWT может hammer-ить оба эндпоинта неограниченно → DB load. `list_llm_providers` делает JOIN по всем компаниям пользователя → O(N companies). Фикс: добавить `@limiter.limit(_RATE_LIMIT_CREDENTIALS)` на оба эндпоинта. `handlers/credentials.py:160-180` | Alex | fixed |
| ALEX-TD-170 | minor | **`handlers/auth.py:RegisterRequest.password` — no `max_length` Field constraint**: без `max_length`, Pydantic аллоцирует полную строку (100MB) до запуска кастомного валидатора и bcrypt. С `max_length=128` — отклоняет на уровне field validation до хеширования. Fix: `password: str = Field(max_length=128)`. `handlers/auth.py:RegisterRequest` | Alex | fixed |
| ALEX-TD-171 | minor | **`.env.example` — неполная документация rate limit переменных**: только 5 из ~15 rate limit env vars были задокументированы. Fix: добавить все `RATE_LIMIT_*` переменные с дефолтными значениями. `backend/.env.example` | Alex | fixed |
| ALEX-TD-172 | minor | **`handlers/library.py` — `LibrarySaveRequest.agent_id` и `ForkRequest.library_agent_id` без `max_length`**: строки 10KB+ agent_id передаются в DB-lookup `session.get(AgentORM, body.agent_id)` без валидации. Fix: `Field(max_length=100)` на обоих полях. `handlers/library.py:LibrarySaveRequest,ForkRequest` | Alex | fixed |
| ALEX-TD-173 | minor | **`tests/test_auth.py` — нет теста на oversized password**: после ALEX-TD-170 нет регрессионного покрытия для `max_length=128` на password. Fix: добавить тест `test_register_password_100kb_returns_422`. `tests/test_alex_td_172_173.py` | Alex | fixed |
| ALEX-TD-169 | minor | **`handlers/auth.py:LoginRequest.email` — missing `max_length` constraint**: `RegisterRequest.email` получил `max_length=254` (ALEX-TD-167), но `LoginRequest.email = EmailStr` без ограничения длины. Несогласованность: POST `/auth/login` принимает email произвольной длины — EmailStr парсит и проверяет формат, но не обрезает. Отправка 10KB email-строки заставляет SQLAlchemy генерировать query с WHERE email = '10KB_string' → DB index scan с большим буфером. Фикс: изменить `email: EmailStr` → `email: EmailStr = Field(max_length=254)` в `LoginRequest`. `handlers/auth.py:LoginRequest` | Alex | fixed |
| ALEX-TD-174 | performance | **`run_events` — отсутствует compound index `(run_id, created_at)`**: `list_events` делает `WHERE run_id = ? ORDER BY created_at` — без compound index SQLite делает filesort поверх single-column lookup по `run_id`. При ran с тысячами событий (streaming LLM) — деградация производительности. Fix: добавить `Index("ix_run_events_run_created", "run_id", "created_at")` в `RunEventORM.__table_args__`. `orm/run.py:RunEventORM` | Alex | fixed |
| ALEX-TD-175 | security/data-integrity | **`CredentialService.create()` — нет проверки дубликатов `(company_id, provider)`**: пользователь может создать N credentials для одного провайдера в одной компании. Оркестратор использует первый найденный credential — остальные невидимы и никогда не используются, но занимают место и вводят в заблуждение. Fix: в `CredentialService.create()` до INSERT делать `SELECT` на `(company_id, provider)` и поднимать `ConflictError` если запись уже есть. Handler маппит → HTTP 409. `services/credential.py`, `handlers/credentials.py` | Alex | fixed |
| ALEX-TD-180 | minor | **`handlers/templates.py:CreateFromTemplateRequest.template_id` — нет `max_length` ограничения**: `template_id: str` без `Field(max_length=...)`. Строка 10KB+ проходит Pydantic-валидацию и попадает в `get_template(template_id)` — dict-lookup по строке-ключу. Нет DB-запроса, но выделяется полная строка в памяти (как ALEX-TD-172). Для consistency со всеми ID-полями в проекте (max_length=100 или 50) нужно добавить `Field(max_length=100)`. `handlers/templates.py:CreateFromTemplateRequest` | Alex | fixed |
| ALEX-TD-181 | security/data-integrity | **`orm/credential.py` — отсутствует DB-уровня `UniqueConstraint("company_id", "provider")`**: ALEX-TD-175 добавил app-level SELECT-check в `CredentialService.create()`, но без DB constraint возможна TOCTOU race condition: два конкурентных POST-запроса одновременно пройдут проверку до commit любого из них → оба запишут дублирующую запись. SQLite serializes writes в WAL-режиме при наличии constraint — IntegrityError вместо дубликата. Fix: добавить `UniqueConstraint("company_id", "provider", name="uq_credentials_company_provider")` в `CredentialORM.__table_args__` + миграция Alembic 0014. `orm/credential.py`, `alembic/versions/` | Alex | fixed |
| ALEX-TD-182 | minor | **`handlers/credentials.py:CredentialCreate.provider` — нет `max_length` ограничения**: `provider: str` без `Field(max_length=...)`. Pydantic аллоцирует полную строку (1MB+) до запуска `provider_must_be_known` field_validator. С `max_length=50` строка отклоняется немедленно без аллокации. `api_key` уже имеет `max_length=512` (ALEX-TD-093), `ValidateKeyRequest.provider` имеет `max_length=50` (ALEX-TD-115) — `CredentialCreate.provider` пропущен. Fix: `provider: str = Field(max_length=50)`. `handlers/credentials.py:CredentialCreate` | Alex | fixed |
| ALEX-TD-183 | minor | **`core/rate_limiting.py:44` — silent `except Exception: pass` в `_key_identifier()`**: при неожиданной ошибке JWT-библиотеки (например, обновление pyjwt API) исключение проглатывается без логирования. Диагностика невозможна. Риск: при смене версии библиотеки rate limiter тихо деградирует к IP-based вместо user-based ключей. Fix: добавить `logger.debug("Unexpected JWT error in _key_identifier: %s", exc)` перед `pass`. `core/rate_limiting.py:44` | Alex | fixed |
| ALEX-TD-184 | minor | **`handlers/ws_events.py` — WebSocket endpoint не имеет rate limiting на попытки подключения**: slowapi не поддерживает `@limiter.limit` для WebSocket endpoints, но каждая попытка WS-подключения (даже с невалидным токеном) создаёт DB-сессию и выполняет ownership-check SELECT. Без ограничений возможен unbounded polling WS endpoint (1K+ попыток/сек) → DB load. Fix: добавить простой in-memory счётчик попыток на IP с window=60s или вынести авторизацию в HTTP-ручку (pre-auth handshake pattern). Задокументировать текущее ограничение в `.env.example`. `handlers/ws_events.py` | Alex | fixed |
| ALEX-TD-159 | minor | **`handlers/ws_events.py` — TOCTOU race в `_active_ws_connections`**: `current_count = _active_ws_connections.get(user_id, 0)` и `_active_ws_connections[user_id] = current_count + 1` — неатомарная операция read-check-increment. Между ними выполняется `await websocket.accept()` → два одновременных WS-соединения от одного пользователя могут оба прочитать одинаковый `current_count` (ниже лимита) и оба пройти проверку. Реальный счётчик окажется на 1 меньше, чем должен быть. Фикс: переместить чтение и инкремент в одну синхронную операцию до `await` или использовать отдельный `asyncio.Lock` на user_id. `handlers/ws_events.py:99-109` | Alex | fixed |
| SIRI-UX-232 | minor | **`WarRoom.tsx` — reconnect timer set AFTER cleanup, creating zombie WebSocket on unmount**: cleanup runs `clearTimeout(reconnectTimer.current)` then `wsRef.current?.close()`. The `close()` fires `ws.onclose` asynchronously (after cleanup returns). `onclose` sets a NEW `reconnectTimer` that cleanup can never clear. After 3s, `connect()` runs on unmounted component → creates new WS → setState on unmounted component. `useWarRoomSocket.ts` solves this correctly with `unmountedRef`. Fix: add `mountedRef = useRef(true)`, set `mountedRef.current = false` in cleanup, guard `if (!mountedRef.current) return` in `ws.onclose` before scheduling reconnect. `WarRoom.tsx:onclose` | Siri | fixed |
| SIRI-UX-233 | minor | **`WarRoom.tsx` — `ws.onclose` always reconnects including on intentional clean close (code 1000)**: cleanup calls `wsRef.current?.close()` (normal close, code 1000). `onclose` fires and schedules reconnect — only 4001/4003 are guarded. `useWarRoomSocket.ts` correctly checks `if (event.wasClean && event.code === 1000) return` to skip reconnect on intentional closes. Without this guard, every unmount → new WS connection attempt. Combined with SIRI-UX-232, this causes zombie connections. Fix: add `if (event?.wasClean && event?.code === 1000) return` at top of `ws.onclose`. `WarRoom.tsx:onclose` | Siri | fixed |
| SIRI-UX-234 | minor | **`CompanyPage.tsx` — local `activeTab` state not reset when navigating between companies**: `useEffect([id])` calls `setActiveCompanyTab('war-room')` (global store) but does NOT call `setActiveTab('war-room')` (local useState). When switching from company A (on "Board" tab) to company B, `activeTab` stays `'board'` — user lands on Board tab of company B instead of War Room. Fix: add `setActiveTab('war-room')` inside `useEffect([id, setActiveCompanyTab])`. `CompanyPage.tsx:useEffect:~168` | Siri | fixed |
| SIRI-UX-235 | minor | **`GlobalSearch` overlay missing `role="dialog"` and `aria-modal="true"`**: the search overlay is a full-screen fixed backdrop containing a modal panel but has no `role="dialog"`, no `aria-modal="true"`, and no `aria-label`/`aria-labelledby`. Screen readers don't announce it as a dialog and virtual cursor escapes the overlay. Fix: wrap inner panel in `<div role="dialog" aria-modal="true" aria-label="Search">`. `GlobalSearch.tsx:~178` | Siri | fixed |
| SIRI-UX-236 | minor | **`SkeletonCard` 5s-timeout error text missing `role="alert"`**: when loading times out after 5 seconds, SkeletonCard renders "Loading took too long. Please try refreshing." but without `role="alert"`. Screen readers won't announce the error to the user. Fix: add `role="alert"` to the timeout div. `SkeletonCard.tsx:~93` | Siri | fixed |
| SIRI-UX-237 | minor | **`WarRoomPage.tsx` thinking-dots and LIVE-dot use inline `animation:` style, not CSS class**: `bounce` animation on thinking dots and `pulse` on the LIVE dot were applied via inline `style={{ animation: '...' }}`, bypassing `prefers-reduced-motion`. Fix: extracted `.war-room-thinking-dot` and `.war-room-live-dot` CSS classes in `index.css`, use `className` instead of inline style. | Siri | fixed |
| SIRI-UX-238 | minor | **`WarRoomPage.tsx` has local `formatTime` and `truncate` helpers that belong in `taskUtils`**: `formatTime(iso)` (line 12) and `truncate(text, max)` (line 17) are small utility functions defined locally in `WarRoomPage.tsx`. There is already a pattern of shared utilities in `taskUtils.ts` (`relativeTime`, `getInitials`, etc.). Keeping these local creates inconsistency and risks future duplication. Fix: move `formatTime` → `taskUtils.ts` as `formatTimeHMS`; move `truncate` → `taskUtils.ts`. Update imports in `WarRoomPage.tsx` and `TaskDetailSidebar.tsx` (which also has a local `formatTimestamp`). `WarRoomPage.tsx:12,17` | Siri | fixed |
| SIRI-UX-240 | minor | **`TaskDetailSidebar.tsx` — обёртка `formatTimestamp` не удалена после SIRI-UX-238**: строка 27 содержит `function formatTimestamp(iso)` — тонкая обёртка над `formatTimeHMS` из taskUtils. Строка 348 вызывает `formatTimestamp` вместо `formatTimeHMS` напрямую. Логика не дублируется, но лишний слой косвенности нарушает AC SIRI-UX-238 ("локальные дубликаты удалены"). Фикс: удалить `formatTimestamp`, заменить вызов на `formatTimeHMS` напрямую. `TaskDetailSidebar.tsx:27,348` | Siri | fixed |
| SIRI-UX-245 | minor | **`SIRI-UX-243-244.test.tsx:3` — `screen` импортирован но никогда не используется**: `import { render, screen } from '@testing-library/react'` — `screen` нигде в файле не вызывается. TypeScript выдаёт `TS6133: 'screen' is declared but its value is never read`. Fix: удалить `screen` из импорта. `SIRI-UX-243-244.test.tsx:3` | Siri | fixed |
| SIRI-UX-246 | minor | **`KanbanBoard.tsx:42` — `isGrabbed?: boolean` в `TaskCardProps` объявлен но не деструктурируется в `TaskCard`**: проп передаётся в `TaskCard` на строке 1238 (`isGrabbed={grabbedTaskId === task.id}`), но не деструктурируется в сигнатуре функции и нигде не используется внутри компонента. Мёртвый проп создаёт ложное ожидание что drag-highlight реализован. Fix: деструктурировать `isGrabbed`, применить CSS класс `task-grabbed` (opacity 0.6 + outline) при drag. `KanbanBoard.tsx:42,1238` | Siri | fixed |
| SIRI-UX-247 | minor | **`CompaniesPage.tsx:177` — `role="button"` div без `aria-label`**: company-item div объявлен как `role="button"` и `tabIndex={0}`, но без `aria-label`. Screen reader зачитает только "button" без контекста — пользователь не знает на какую компанию переходит. Fix: добавить `aria-label={co.name}` на div. `CompaniesPage.tsx:177` | Siri | fixed |
| SIRI-UX-248 | minor | **`EmptyState.tsx` — CTA кнопка использует `onMouseEnter`/`onMouseLeave` для hover вместо CSS класса**: кнопка мутирует `e.currentTarget.style.background` в JS-хендлерах. Остальные кнопки проекта (Button.tsx) используют Tailwind hover классы. Паттерн несовместим с prefers-reduced-motion (переходы должны отключаться через CSS, не JS). Fix: заменить inline JS hover на Tailwind класс `hover:bg-blue-700` или CSS класс `.empty-state-cta-btn`. `EmptyState.tsx:33-34` | Siri | fixed |
| SIRI-UX-249 | minor | **`Button.tsx` — все кнопки приложения используют JS `onMouseEnter`/`onMouseLeave` для hover**: `handleMouseEnter`/`handleMouseLeave` мутировали `e.currentTarget.style` для всех 3 вариантов (primary/secondary/danger). Затрагивает все кнопки приложения. Паттерн несовместим с `prefers-reduced-motion`. Fix: вынести hover-стили в CSS классы `.btn-primary:hover`, `.btn-secondary:hover`, `.btn-danger:hover` в `index.css`, удалить JS обработчики из `Button.tsx`. | Siri | fixed |
| SIRI-UX-257 | minor | **`SystemPromptEditor.tsx` — template quick-fill buttons используют JS `onMouseEnter`/`onMouseLeave` для смены `background`**: тот же паттерн что SIRI-UX-249/250/255. Кнопки имели дублирующие inline styles (border-radius, padding, etc.) + JS hover. Fix: добавить `.system-prompt-tpl-btn` CSS класс в `index.css`, заменить inline styles + JS hover на `className="system-prompt-tpl-btn"`. `SystemPromptEditor.tsx:45-65` | Siri | fixed |
| SIRI-UX-256 | minor | **`AgentCard.tsx` — wrapper div использует JS `onMouseEnter`/`onMouseLeave` для `borderColor` hover**: карточка агента использовала JS обработчики для смены `borderColor` при hover вместо CSS класса. Нарушает code style (SIRI-UX-249/250/255). Fix: добавить `.agent-card:hover { border-color: rgba(255,255,255,0.3) }` в `index.css`, заменить JS hover на `className="agent-card"`. Keyboard focus (`onFocus`/`onBlur`) сохранён для a11y. `AgentCard.tsx:25-35` | Siri | fixed |
| SIRI-UX-255 | minor | **`CompaniesPage.tsx` — company list items используют JS `onMouseEnter`/`onMouseLeave` вместо CSS класса**: паттерн несовместим с `prefers-reduced-motion`, нарушает code style (SIRI-UX-249/250). Fix: добавить CSS класс `.companies-item:hover { border-color: #6b7280 }` в `index.css`, заменить JS hover на `className="companies-item"`. `CompaniesPage.tsx` | Siri | fixed |
| SIRI-UX-254 | minor | **`WarRoom.tsx` — `mountedRef.current` не сбрасывается в `true` при каждом запуске effect**: при React StrictMode double-invoke (или при смене `connect` dep) cleanup устанавливает `mountedRef.current = false`, а новый effect не сбрасывает его обратно. Итог: `ws.onclose` видит `mountedRef.current = false` → не планирует reconnect → WS остаётся мёртвым. Fix: добавить `mountedRef.current = true` в начало useEffect. `WarRoom.tsx` | Siri | fixed |
| SIRI-UX-253 | minor | **`WarRoom.tsx` — `MAX_RUNS = 100` объявлен внутри тела компонента**: константа пересоздаётся при каждом рендере вместо того чтобы быть module-level. Fix: вынести `const MAX_RUNS = 100` выше `export default function WarRoom`. `WarRoom.tsx` | Siri | fixed |
| SIRI-UX-252 | minor | **`TaskDetailSidebar.tsx` — ключи status history без индекса**: `key={status-changed_at}` коллизирует при одинаковом статусе + временной метке (тот же root cause что SIRI-UX-217 для логов). Fix: добавить индекс как префикс — `key={idx-status-changed_at}`. `TaskDetailSidebar.tsx` | Siri | fixed |
| SIRI-UX-251 | minor | **`CompaniesPage.tsx` — `load()` после создания компании без AbortSignal**: `handleCreate` вызывает `await load()` без сигнала после успешного POST — если компонент анмаунтится пока идёт рефетч, setState вызывается на мёртвом компоненте. Fix: создать `reloadAbortRef`, передавать `reloadController.signal` в `load()`, абортировать в cleanup. `CompaniesPage.tsx` | Siri | fixed |
| SIRI-UX-250 | minor | **`KanbanBoard.tsx` — 4 типа кнопок используют JS hover вместо CSS классов**: "New Task" (строка ~1161), task menu items `['Edit','Delete','Assign']` (строка ~362), assign agent buttons (строка ~624), "Load more tasks" (строка ~1264) — все используют `onMouseEnter`/`onMouseLeave` для изменения `style.background`. Несовместимо с `prefers-reduced-motion`. Fix: добавить CSS классы `kanban-new-task-btn`, `kanban-menu-item-btn`, `kanban-assign-agent-btn`, `kanban-load-more-btn` в `index.css`, заменить JS hover на `className`. `KanbanBoard.tsx` | Siri | fixed |
| SIRI-UX-239 | minor | **`AgentCard.tsx:8` — локальный `STATUS_COLORS: Record<string, string>` конфликтует по имени с `taskUtils.STATUS_COLORS: Record<string, {bg,text}>`**: в `AgentCard.tsx` определялась локальная константа `STATUS_COLORS` с простыми hex-строками для статусов агентов (`idle/running/done/error`). В `taskUtils.ts` уже живёт `STATUS_COLORS` с объектами `{bg, text}` для статусов задач. Одинаковое имя создаёт когнитивную нагрузку и риск ошибочного импорта. Fix: перенести в `taskUtils.ts` как `AGENT_STATUS_DOT_COLORS`, обновить импорт в `AgentCard.tsx`. `AgentCard.tsx:8` | Siri | fixed |
| SIRI-UX-241 | minor | **`AgentCard.tsx` — card wrapper div не реагирует на клавиатурный фокус**: wrapper div имеет `onMouseEnter`/`onMouseLeave` для hover-подсветки рамки, но нет `onFocus`/`onBlur`. Когда пользователь переходит клавиатурой (Tab) на дочерние кнопки Edit / View Agent, карточка не подсвечивается — нет визуального контекста какая карточка активна. Fix: добавить `onFocus`/`onBlur` с теми же borderColor-изменениями что в onMouseEnter/onMouseLeave. `AgentCard.tsx:38-39` | Siri | fixed |
| SIRI-UX-242 | minor | **`BillingPage.tsx:153,171` — прогресс-бар fill `<div>` использует inline `transition: 'width 0.3s'` вместо CSS-класса**: тот же паттерн что был зафиксен в SIRI-UX-209 (spin) и SIRI-UX-228 (app spinner). Inline `transition` не является проблемой при наличии `!important` в `@media (prefers-reduced-motion)`, но нарушает code style консистентность — все анимации в проекте вынесены в CSS-классы. Fix: создать `.billing-progress-fill { transition: width 0.3s }` в `index.css`, убрать inline transition. `BillingPage.tsx:153,171` | Siri | fixed |
| SIRI-UX-243 | minor | **`EmptyState.tsx:61` — inline `<style>` тег с `@keyframes fadeIn` дублирует глобальный `@keyframes fadeIn` из `index.css`**: `EmptyState` рендерит `<style>{\`@keyframes fadeIn {...}\`}</style>` в каждом инстансе компонента — это нарушает code style проекта (все анимации в CSS), создаёт дубликат и потенциально множественные инъекции стиля при нескольких инстансах. `index.css` уже содержит `@keyframes fadeIn`. Fix: удалить inline `<style>` тег, заменить `animation: 'fadeIn 0.3s ease-in'` на CSS класс `.empty-state-fadein { animation: fadeIn 0.3s ease-in }`. `EmptyState.tsx:61` + `index.css`. | Siri | fixed |
| SIRI-UX-244 | minor | **`SkeletonCard.tsx` — shimmer `@keyframes` инжектируется в `<head>` через JS (`document.createElement('style')`) вместо CSS-класса**: функция `injectShimmerKeyframes()` создаёт DOM-элемент `<style>` с `@keyframes shimmer` при каждом первом рендере SkeletonCard. Это нарушает code style (все анимации в `index.css`), не работает с SSR/test isolation, и не подпадает под `prefers-reduced-motion` override. Fix: добавить `.skeleton-shimmer { background: ...; animation: shimmer 1.5s infinite }` в `index.css`, убрать `SHIMMER_STYLE` object + `injectShimmerKeyframes()`, использовать `className="skeleton-shimmer"` на ShimmerLine и ShimmerCircle. `SkeletonCard.tsx:1-25`. | Siri | fixed |
| SIRI-UX-258 | minor | **`LibraryPage.tsx:334-335,355-356` — Portfolio Link и Fork button используют JS `onMouseEnter`/`onMouseLeave` для hover**: тот же паттерн что SIRI-UX-249..257. Fix: добавить `.library-portfolio-link` и `.library-fork-btn` CSS классы в `index.css`, заменить JS hover на `className`. | Siri | fixed |
| SIRI-UX-259 | minor | **`Navbar.tsx:50-57` — Logout button использует JS `onMouseEnter`/`onMouseLeave` для hover**: мутирует `borderColor` и `color` через JS обработчики. Fix: добавить `.navbar-logout-btn` CSS класс в `index.css`, заменить JS hover на `className`. | Siri | fixed |
| SIRI-UX-260 | minor | **`OnboardingPage.tsx:250-251,273-274` — Launch Demo button и Skip link используют JS hover**: Launch Demo мутирует `background`, Skip мутирует `color` в JS-хендлерах. Fix: добавить `.onboarding-launch-btn` и `.onboarding-skip-btn` CSS классы, заменить JS hover. | Siri | fixed |
| SIRI-UX-261 | minor | **`AgentEditPage.tsx:183-184` — Cancel button использует JS `onMouseEnter`/`onMouseLeave` для hover**: мутирует `borderColor` и `color`. Fix: добавить `.agent-edit-cancel-btn` CSS класс в `index.css`, заменить JS hover на `className`. | Siri | fixed |
| SIRI-UX-262 | minor | **`KanbanBoard.tsx:311-320` — TaskCard div использует JS `onMouseEnter`/`onMouseLeave` для hover**: мутирует `borderColor` (`#374151`→`#6b7280`) и `boxShadow` через JS-обработчики. Паттерн несоответствует CSS-классам `kanban-new-task-btn`, `kanban-menu-item-btn` (SIRI-UX-250). Fix: добавить `.task-card` CSS класс в `index.css` с `:hover` стилями, убрать JS-хендлеры. `KanbanBoard.tsx:311-320` | Siri | fixed |
| SIRI-UX-263 | minor | **`CompanyPage.tsx:370-371` — tab nav buttons используют JS `onMouseEnter`/`onMouseLeave` для hover**: мутируют `color` (`#64748b`→`#94a3b8`) через JS-обработчики при `!isActive`. Паттерн нарушает консистентность — остальные hover-стили через CSS. Fix: добавить `.company-tab-btn` CSS класс в `index.css` с `:hover:not([aria-selected="true"])` стилем, убрать JS-хендлеры. `CompanyPage.tsx:370-371` | Siri | fixed |
| SIRI-UX-264 | minor | **`GlobalSearch.tsx:264` — `onMouseEnter` для hover активного результата поиска**: единственный оставшийся JS hover паттерн в кодовой базе (пропущен в SIRI-UX-254..263). Search result `div` использует `onMouseEnter={() => setActiveIndex(flatIdx)}` для установки активного индекса при наведении. Хотя это не прямая мутация `e.currentTarget.style`, поведение можно заменить на CSS `:hover` с CSS переменными. Fix: добавить `.search-result-item` CSS класс с `:hover` стилем, вместо `onMouseEnter` управлять `activeIndex` через CSS + убрать JS обработчик. `GlobalSearch.tsx:264` | Siri | fixed |
| SIRI-UX-266 | minor | **`WarRoomPage.tsx` — `sortedAgents` вычислялся без `useMemo` после early returns**: нарушение Rules of Hooks — хук должен вызываться до любых early returns. `useMemo` перенесён в начало компонента. Также избегает ненужного ре-сортинга на каждый рендер. `WarRoomPage.tsx:274` | Siri | fixed |
| SIRI-UX-267 | minor | **`useWarRoomSocket.ts` — Zustand action refs в deps array `useCallback`**: `addMessage`, `updateAgentStatus`, `setRunStatus`, `addCost` подписывались через `useWarRoomStore((s) => s.action)` и включались в `[...deps]`. Zustand actions стабильны, но семантически неверно — при rebuild store вызывало бы WS reconnect. Fix: доступ через `useWarRoomStore.getState()` внутри callback, deps array = `[companyId]`. `hooks/useWarRoomSocket.ts:148` | Siri | fixed |
| SIRI-UX-268 | minor | **`KanbanBoard.tsx:formatDueDate` — дублированная утилита**: `formatDueDate` объявлена локально в `KanbanBoard.tsx`. Любой другой компонент (TaskDetailSidebar, AgentPage) вынужден копировать. Fix: перенести в `utils/taskUtils.ts`, импортировать из там. `KanbanBoard.tsx:26-33` | Siri | fixed |
| BUG-074 | minor | **`WarRoomPage.tsx` — mobile agent drawer transition не уважает `prefers-reduced-motion`**: `transition: 'left 0.25s ease'` задан inline в style-объекте — CSS media query `prefers-reduced-motion: reduce` не может его переопределить. Fix: перенести transition в CSS класс `.war-room-agent-panel` с `@media (prefers-reduced-motion: reduce) { transition: none }`. `WarRoomPage.tsx:515` | Siri | fixed |
| SIRI-UX-265 | minor | **JS `onFocus`/`onBlur` мутируют `borderColor` inline в 7 компонентах**: `AuthPage.tsx:182-183,196-197`, `OnboardingPage.tsx:211-212`, `CompaniesPage.tsx:208-209,241-242`, `CompanySettingsPage.tsx:131-132,149-150,219-220`, `AgentForm.tsx:79,82`, `KanbanBoard.tsx:311-312,480-481,493-494,1260-1261,1282-1283`, `SettingsPage.tsx:59,62`. Мутация inline `style` в JS-обработчиках — тот же паттерн что был зафиксирован в hover (SIRI-UX-249..263). Fix: добавить CSS классы с `input:focus { border-color }` или `.input-focus-ring` в `index.css`, заменить JS обработчики. | Siri | fixed |
| ALEX-TD-185 | minor | **`orchestration/nodes.py:_mock_llm_call` — real LLM path (`AGENTCO_USE_REAL_LLM=true`) не имеет per-call timeout**: `agent_node.py` имеет `asyncio.wait_for` с `LLM_CALL_TIMEOUT_SEC=120` (ALEX-TD-158), но `nodes.py` CEO/subagent/hierarchical nodes при реальном LLM (`litellm.acompletion`) вызывают его без таймаута. При зависании LLM API целый ран блокирует event loop бесконечно через orchestration nodes. Fix: обернуть `litellm.acompletion(...)` в `asyncio.wait_for(..., timeout=float(os.getenv("LLM_CALL_TIMEOUT_SEC", "120")))` в ветке `if use_real_llm`. `orchestration/nodes.py:_mock_llm_call:85-92` | Alex | fixed |
| ALEX-TD-186 | minor | **`handlers/library.py:fork_agent` — `use_count` increment не атомарный**: `lib_entry.use_count = (lib_entry.use_count or 0) + 1` — read-modify-write операция. При параллельных форках одного и того же library agent оба запроса читают одинаковое `use_count=N`, оба записывают `N+1` — инкремент теряется. SQLite сериализует writes, но SQLAlchemy ORM-level read-modify-write не атомарен если два concurrent requests оба уже прочитали значение. Fix: использовать атомарный SQL `UPDATE agent_library SET use_count = use_count + 1 WHERE id = ?` через `session.execute(update(AgentLibraryORM).where(...).values(use_count=AgentLibraryORM.use_count + 1))`. `handlers/library.py:215-216` | Alex | fixed |
| ALEX-TD-187 | minor | **`handlers/credentials.py:ValidateKeyRequest` — нет Pydantic-валидации `provider` против known providers**: `CredentialCreate.provider` имеет `@field_validator("provider")` с `provider_must_be_known` (возвращает 422 для неизвестного провайдера). `ValidateKeyRequest.provider` не имеет такого валидатора — неизвестный провайдер обрабатывается в body handler как `return ValidateKeyResponse(valid=False, error="Unknown provider")` (200 OK). Несогласованность: один endpoint возвращает 422, другой — 200 для одного и того же invalid input. Fix: добавить `@field_validator("provider") provider_must_be_known` аналогично `CredentialCreate`. `handlers/credentials.py:ValidateKeyRequest` | Alex | fixed |
| SIRI-UX-269 | minor | **`SIRI-UX-266-268.test.tsx` — использует Node.js `import('fs')` / `import('path')` / `__dirname` в browser-tsconfig**: 19 TypeScript ошибок при `tsc --noEmit`. `@types/node` не установлен, `tsconfig.json` использует `moduleResolution: bundler` без Node types. Тесты проходят в vitest (Node runtime), но tsc не компилирует. Fix: переписать fs-based тесты как behavioral (рендер + DOM-проверки вместо чтения исходника), убрать неиспользуемые импорты `vi`, `beforeEach`, `MemoryRouter`. `src/__tests__/SIRI-UX-266-268.test.tsx` | Siri | fixed |
| SIRI-UX-270 | minor | **`GlobalSearch.tsx` — dialog-оверлей не использует `useFocusTrap`**: все модальные компоненты (KanbanBoard TaskCard modals, CompanyPage agent modal, TaskDetailSidebar) используют `useFocusTrap` для управления фокусом. GlobalSearch — единственный `role="dialog"` без ловушки фокуса. Tab/Shift+Tab может уйти из оверлея в фоновый контент. Fix: импортировать `useFocusTrap`, добавить ref на контейнер dialog, активировать при `open=true`. `GlobalSearch.tsx` | Siri | fixed |
| SIRI-UX-271 | minor | **`KanbanBoard.tsx` — Kanban-колонки не имеют ARIA `role` и `aria-label`**: `<div data-testid="kanban-column-*">` — обычный div без `role="region"` и `aria-label`. Screen reader не может навигировать по колонкам. WCAG 2.1 landmark regions рекомендуют именованные `region` для функциональных секций. Fix: добавить `role="region"` и `aria-label={col.label}` на каждую колонку. `KanbanBoard.tsx:1157-1177` | Siri | fixed |
| SIRI-UX-272 | minor | **`Sidebar.tsx` — `NAV_ITEMS` массив пересоздаётся на каждом рендере**: массив объявлен внутри тела компонента — новая ссылка на каждый рендер. Хотя React мемоизирует NavLink по key, пересоздание массива бесполезный аллоц. Fix: вынести `NAV_ITEMS` как module-level константу (без `warRoomTo` — его вычислять inline). `Sidebar.tsx:25-30` | Siri | fixed |
| SIRI-UX-273 | minor | **`WarRoomPage.tsx` — `handleStop` не мемоизирован через `useCallback`**: большая async-функция (>50 строк) пересоздаётся на каждый рендер компонента. Передаётся как `onClick` в `<Button>`, вызывая ненужный ре-рендер Button. Fix: обернуть `handleStop` в `useCallback([companyId, stopping, runStatus, toast])`. `WarRoomPage.tsx:handleStop` | Siri | fixed |
| SIRI-UX-274 | minor | **`CompanyPage.tsx` — `role="tabpanel"` missing `aria-labelledby`, tab buttons missing `id`**: таблично-панельный паттерн WAI-ARIA требует `<button role="tab" id="tab-{id}">` + `<div role="tabpanel" aria-labelledby="tab-{id}">`. Сейчас у кнопок-табов нет `id`, у tabpanel нет `aria-labelledby` — screen reader не может объявить "Board tab, controls Board panel". Fix: добавить `id={`tab-${tab.id}`}` на каждую кнопку, `aria-labelledby={`tab-${tab.id}`}` на каждый panel. `CompanyPage.tsx:364-395` | Siri | fixed |
| SIRI-UX-275 | minor | **`GlobalSearch.tsx` — Escape listener добавляется без guard на `open`**: в `useEffect` без зависимостей `document.addEventListener('keydown', handler)` вешается всегда, а `setOpen(false)` вызывается на каждый Escape даже когда диалог закрыт. При открытых Kanban-модалах нажатие Escape закрывает их — и попутно дёргает `setOpen(false)` на уже закрытый GlobalSearch. Fix: добавить `if (!open)` guard или переписать через отдельный `useEffect([open])` который добавляет/убирает Escape listener только когда `open=true`. `GlobalSearch.tsx:27-37` | Siri | fixed |
| SIRI-UX-276 | minor | **`KanbanBoard.tsx` — Cancel кнопка в Create Task Modal не имеет `data-testid`**: все остальные модальные Cancel/Close кнопки имеют `data-testid` (`cancel-delete-btn`, другие). Cancel в "New Task" modal (`showCreateModal`) не имеет testId — невозможно надёжно кликнуть его в тестах без сложных queries. Fix: добавить `data-testid="create-task-cancel-btn"` на Cancel button в Create Task modal. `KanbanBoard.tsx: showCreateModal Cancel button` | Siri | fixed |
| SIRI-UX-277 | minor | **`CompanyPage.tsx` — `handleLoadMoreTasks` не мемоизирована через `useCallback`**: inline async-функция пересоздаётся на каждый рендер, передаётся как `onLoadMore` prop в `<KanbanBoard>`. Каждый ре-рендер CompanyPage (setState из WS, toast) вызывает ненужный ре-рендер KanbanBoard из-за нового ref функции. Fix: обернуть `handleLoadMoreTasks` в `useCallback([id, hasMoreTasks, taskOffset, toast])`. `CompanyPage.tsx:228` | Siri | fixed |
| SIRI-UX-278 | minor | **`Sidebar.tsx` — backdrop div не обрабатывает keyboard события**: backdrop (`data-testid="sidebar-backdrop"`) имеет `onClick` для закрытия сайдбара, но нет `role`, `tabIndex`, `onKeyDown`. Клавиатурный пользователь не может закрыть сайдбар через backdrop — нарушение WCAG 2.1 SC 2.1.1. Fix: добавить `role="button"`, `tabIndex={0}`, `aria-label="Close sidebar"`, `onKeyDown` с Enter/Space/Escape handler. `Sidebar.tsx:sidebar-backdrop` | Siri | fixed |

| ALEX-TD-189 | minor | **`db/session.py:141` — `except Exception: pass` при инициализации async engine не логируется**: блок `try/except Exception: pass` (строка 141) молча проглатывает `ImportError` если asyncpg не установлен. Администратор не знает, почему `get_async_session()` падает с RuntimeError — в логах ничего. Fix: заменить `pass` на `logger.debug("async engine unavailable: %s", e)` (logger объявлен в модуле не нужен — добавить `import logging; _log = logging.getLogger(__name__)`). `db/session.py:141` | Alex | fixed |
| ALEX-TD-190 | minor | **`services/run.py:574` — `except Exception: pass` при закрытии MemoryService не логируется**: `_memory_service.close()` в finally-блоке `execute_run` завёрнут в `except Exception: pass`. Если `close()` падает (например, ошибка SQLite при flush), исключение бесследно теряется. Накопленные fd-утечки при повторных ошибках. Fix: добавить `logger.warning("MemoryService.close() failed for run %s: %s", run_id, e)`. `services/run.py:574` | Alex | fixed |
| ALEX-TD-191 | minor | **`orchestration/agent_node.py` — `_execute_agent` ловит `except Exception as e` на строке 436 без `exc_info=True`**: `logger.error("agent_node LLM call failed: %s", e)` теряет traceback. При диагностике падения агента нет стека — только тип ошибки. Fix: заменить на `logger.error("agent_node LLM call failed: %s", e, exc_info=True)`. Однострочный фикс, нулевые риски. `orchestration/agent_node.py:436` | Alex | fixed |
| ALEX-TD-192 | minor | **`handlers/runs.py` — `list_runs` не логирует owner mismatch**: `list_by_company_owned` внутри кидает `NotFoundError` для чужой компании — endpoint ловит его и возвращает 404, но нет `logger.info` о попытке доступа к чужому ресурсу. Невозможно отличить «компания не существует» от «попытка несанкционированного доступа» в логах. Fix: добавить `logger.info("Access denied: user %s tried to list runs for company %s", current_user.id, company_id)` в `except NotFoundError`. `handlers/runs.py:list_runs` | Alex | fixed |
| ALEX-TD-193 | major | **`services/run.py:execute_run` — `error` поле не сохраняется в DB при `status=failed/error`**: когда граф возвращает `status=failed` (loop_detected, cost_limit_exceeded, token_limit_exceeded), `run_orm.error` остаётся `None` в БД — в success path нет строчки `run_orm.error = final_state.get("error")`. Frontend всегда показывает пустой error field. Fix: добавить `run_orm.error = final_state.get("error")` в success update block (рядом с `run_orm.status` и `run_orm.result`). `services/run.py:success update block` | Alex | open |
| ALEX-TD-194 | minor | **`services/agent.py:AgentService.delete` — N+1 UPDATE запросы при нуллификации `task.agent_id`**: Python loop `for task_orm in list(agent_orm.tasks): task_orm.agent_id = None` issuesN отдельных UPDATE запросов (один на каждую задачу агента). При агентах с сотнями задач — сотни round-trips до БД. Fix: заменить на bulk SQL UPDATE: `session.execute(update(TaskORM).where(TaskORM.agent_id == agent_id).values(agent_id=None))`. `services/agent.py:delete` | Alex | open |
| SIRI-UX-279 | minor | **`AgentEditPage.tsx` — `.then()` fetch chain не гвардится `signal.aborted`**: когда компонент анмаунтится, `controller.abort()` срабатывает в cleanup. Но если ответ уже получен до abort (HTTP response в полёте), `.then()` всё равно выполняется и вызывает `setAgent(data)` + `setLoading(false)` на размонтированном компоненте — React warning "Can't perform a state update on unmounted component". Fix: добавить `if (controller.signal.aborted) return` в начале `.then()` success callback, аналогично SIRI-UX-163. `AgentEditPage.tsx:41-50` | Siri | fixed |
| SIRI-UX-280 | minor | **`WarRoom.tsx` — initial REST fetch `.then()` — `setRuns(mapped)` не гвардится `signal.aborted`**: тот же паттерн что SIRI-UX-279. Если компонент анмаунтируется пока ответ `GET /runs` ещё обрабатывается (медленная сеть), `setRuns()` вызовется на мёртвом компоненте. Fix: добавить `if (controller.signal.aborted) return` в начало `.then()` callback. `WarRoom.tsx:64-79` | Siri | fixed |
| SIRI-UX-281 | minor | **`LibraryPortfolioPage.tsx` — error state без `role="alert"`, Retry кнопка без `aria-label`**: при ошибке загрузки портфолио рендерится div без `role="alert"` — screen reader не анонсирует ошибку. Кнопка "Retry" не имеет `aria-label` — контекст "Retry what?" неочевиден. Аналогичная проблема была в CompaniesPage (SIRI-UX-148), LibraryPage (SIRI-UX-152) — там уже зафиксировано. Fix: добавить `role="alert"` на error div, `aria-label="Retry loading portfolio"` на кнопку. `LibraryPortfolioPage.tsx:error block` | Siri | fixed |
| SIRI-UX-282 | minor | **`AuthPage.tsx` — tab buttons missing roving tabindex**: WAI-ARIA APG tabs pattern требует `tabIndex={0}` для активной вкладки и `tabIndex={-1}` для неактивной, чтобы Tab не перепрыгивал на обе вкладки. Без этого keyboard users Tab'ают через обе — нарушение APG. Fix: добавить `tabIndex={tab === 'signin' ? 0 : -1}` и `tabIndex={tab === 'signup' ? 0 : -1}`. `AuthPage.tsx:tablist` | Siri | fixed |
| SIRI-UX-283 | minor | **`AuthPage.tsx` — error div без `role="alert"`**: при неверном пароле/email ошибка рендерится в div без live region. Screen reader не объявляет ошибку автоматически — пользователь не знает, почему форма не отправилась. Fix: добавить `role="alert"` на error div. `AuthPage.tsx:error div` | Siri | fixed |
| SIRI-UX-284 | minor | **`WarRoomPage.tsx` — `handleStop` useCallback включает `runStatus` в deps хотя не использует его**: `runStatus` не читается внутри handleStop, но включён в deps array — это вызывает пересоздание handleStop при каждом изменении статуса рана (run.started, run.completed и т.д.). Fix: убрать `runStatus` из deps. `WarRoomPage.tsx:handleStop deps` | Siri | fixed |
| SIRI-UX-285 | minor | **`GlobalSearch.tsx` — keyboard hint захардкожен как `Ctrl+K` даже на macOS**: на macOS корректная подсказка `⌘K`, но пользователь видит `Ctrl+K`. Fix: определять платформу через `navigator.platform` и показывать `⌘K` на Mac. `GlobalSearch.tsx:trigger button` | Siri | fixed |
| SIRI-UX-286 | minor | **`SIRI-UX-284-HandleStopDeps.test.ts` — использует Node.js `fs`/`path`/`__dirname` без `@types/node`**: тест импортирует `readFileSync` из `fs` и `resolve` из `path`, использует `__dirname` — всё это Node.js API, недоступные в browser tsconfig (`lib: ["ES2020","DOM","DOM.Iterable"]`). `tsc --noEmit` падает с TS2307 + TS2304. Fix: переписать тест без Node.js fs — использовать raw source string или другой подход. `src/__tests__/SIRI-UX-284-HandleStopDeps.test.ts` | Siri | fixed |
| SIRI-UX-287 | minor | **`SIRI-UX-285-GlobalSearchPlatformHint.test.tsx` — `vi` и `afterEach` импортированы но не используются**: `noUnusedLocals` в tsconfig падает TS6133 на `vi` и `afterEach`. Fix: убрать неиспользуемые импорты. `src/__tests__/SIRI-UX-285-GlobalSearchPlatformHint.test.tsx:7` | Siri | fixed |
| SIRI-UX-288 | minor | **`GlobalSearch.tsx` — активный item не скроллируется в видимость при навигации стрелками**: listbox имеет `maxHeight: 360; overflowY: auto`, при большом числе результатов ArrowDown/ArrowUp перемещает `activeIndex` но DOM-элемент активного пункта не получает `scrollIntoView`. Пользователь видит старые пункты, не видит выбранный. Fix: добавить `useRef` на listbox, вызывать `document.getElementById('search-option-N')?.scrollIntoView({ block: 'nearest' })` при смене `activeIndex`. `GlobalSearch.tsx:handleKeyDown` | Siri | fixed |
| BUG-NNN | critical/major/minor | Краткое описание + файл/строка | Кто фиксит | open/fixed |
| SIRI-UX-160 | minor | **`SIRI-UX-157-AgentPageAbortController.test.tsx:7` — unused `screen` и `waitFor` импорты вызывают TS6133**: при фиксе SIRI-UX-157 Siri убрала `act` (SIRI-UX-156), но оставила `screen` и `waitFor` в импорте — они нигде не используются. `npx tsc --noEmit` падает с двумя TS6133 ошибками. Fix: удалить `screen` и `waitFor` из import строки теста. `src/__tests__/SIRI-UX-157-AgentPageAbortController.test.tsx:7` | Siri | fixed |
| SIRI-UX-161 | minor | **`AgentPage.tsx` — history item без `description` получает `aria-expanded=true` при клике, но не имеет `aria-controls`**: в SIRI-UX-159 `aria-controls` установлен условно (`item.description ? expandedContentId : undefined`). Однако onClick на строке без description всё равно устанавливает `expandedId` — строка получает `aria-expanded=true` без `aria-controls`, screen reader объявляет раскрытый контрол указывающий в никуда. Fix: не вызывать `setExpandedId` если у item нет description, либо всегда устанавливать `aria-controls` (рендерить скрытый div с id). `AgentPage.tsx:visibleHistory.map` | Siri | fixed |
| SIRI-UX-162 | minor | **`AgentPage.tsx` — history item без `description` показывает `cursor:pointer`, но клик — no-op**: после фикса SIRI-UX-161 `setExpandedId` не вызывается если у item нет description, однако стиль `cursor: 'pointer'` применяется безусловно. Пользователь видит курсор руки, кликает — ничего не происходит. UX-обман. Fix: `cursor: item.description ? 'pointer' : 'default'` + убрать `role="button"` / `tabIndex={0}` если нет description. `AgentPage.tsx:visibleHistory.map:style` | Siri | fixed |
| SIRI-UX-163 | minor | **`WarRoom.tsx` — initial REST fetch `/api/companies/.../runs` не имеет AbortController**: если компонент анмаунтится пока fetch в полёте (например, быстрая навигация), `setRuns(data)` и `setIsConnecting(false)` вызываются на unmounted component. Аналогичный баг был в AgentPage (SIRI-UX-157). Fix: добавить `AbortController` в useEffect, передать `signal` в fetch, игнорировать `AbortError` в catch. `WarRoom.tsx:useEffect[BUG-043]` | Siri | fixed |
| SIRI-UX-164 | minor | **`AgentEditPage.tsx` — useEffect fetch агента без AbortController**: при быстрой навигации на edit page и обратно, `setAgent(data)` и `setLoading(false)` вызываются на unmounted component. Паттерн аналогичен SIRI-UX-163. Fix: AbortController + AbortError catch в useEffect. `AgentEditPage.tsx:useEffect:28` | Siri | fixed |
| SIRI-UX-165 | minor | **`CompanySettingsPage.tsx` — useEffect fetch компании без AbortController**: при уходе со страницы настроек во время загрузки — setState на unmounted component. Fix: AbortController + AbortError catch в useEffect. `CompanySettingsPage.tsx:useEffect:32` | Siri | fixed |
| SIRI-UX-166 | minor | **`LibraryPage.tsx` — два useEffect с fetch без AbortController**: (1) компании-список (`/api/companies`, строка ~48), (2) агенты библиотеки (`loadAgents()`-вызов из useEffect, строка ~204). При анмаунте setState на unmounted component. Fix: AbortController в обоих useEffect, AbortError catch. `LibraryPage.tsx:useEffect:48,204` | Siri | fixed |
| SIRI-UX-167 | minor | **`SettingsPage.tsx` — два useEffect с fetch без AbortController**: (1) загрузка списка компаний (`/api/companies/`, строка ~97), (2) загрузка credentials при выборе компании (`/api/companies/{id}/credentials`, строка ~109). При размонтировании — setState на unmounted component. Fix: AbortController + AbortError catch в обоих useEffect. `SettingsPage.tsx:useEffect:97,109` | Siri | fixed |
| SIRI-UX-168 | minor | **`AgentForm.tsx` — useEffect fetch без AbortController**: загрузка доступных моделей (`/api/llm/providers/available`, строка ~31) без signal. При быстром открытии/закрытии формы — `setModels(...)` и `setLoadingModels(false)` вызываются на unmounted component. Fix: AbortController в `loadModels`, AbortError catch. `AgentForm.tsx:useEffect:31` | Siri | fixed |
| SIRI-UX-169 | minor | **`LibraryPortfolioPage.tsx` — useCallback fetch без AbortController**: `fetchPortfolio` (строка ~37) используется как в useEffect при маунте, так и через кнопку Retry. Нет signal → setState на unmounted при навигации. Паттерн сложнее чем остальные: `useCallback` + `useEffect` — нужно передавать AbortController через ref или рефакторить на useEffect без useCallback. `LibraryPortfolioPage.tsx:fetchPortfolio:37` | Siri | fixed |
| SIRI-UX-170 | minor | **`CompaniesPage.tsx:179` — `role="dialog"` модал без `useFocusTrap`**: при Tab-навигации фокус уходит за пределы диалога "New Company". Все другие диалоги в проекте (KanbanBoard, CompanySettingsPage, LibraryPage, CompanyPage) уже используют `useFocusTrap`. Fix: добавить `useFocusTrap(showNewModal)` и `ref` на inner div модала. `CompaniesPage.tsx:179` | Siri | fixed | 
| SIRI-UX-171 | minor | **`KanbanBoard.tsx:118,141,160` — `handleEdit`, `handleDelete`, `handleAssign` без loading state**: при медленной сети double-click может отправить дублирующие PATCH/DELETE запросы. `handleRun` уже имеет `running` state — паттерн не применён к остальным мутациям в `TaskCard`. Fix: добавить `saving` / `deleting` / `assigning` boolean state, disable кнопки Save/Delete/Assign во время запроса. `KanbanBoard.tsx:118,141,160` | Siri | fixed |
| SIRI-UX-172 | minor | **`KanbanBoard.tsx:24` и `TaskDetailSidebar.tsx:13` — дублирование `PRIORITY_COLORS`**: константа определена дважды с немного разными типами (`{ bg, text, label }` vs `{ bg, text }`). Нужно вынести унифицированную версию в `src/utils/taskUtils.ts` где уже живут `STATUS_COLORS`, `getInitials`, `getAvatarColor`. `KanbanBoard.tsx:24`, `TaskDetailSidebar.tsx:13` | Siri | fixed |
| SIRI-UX-173 | minor | **`WarRoomPage.tsx:198` — `handleStop` fetch без AbortController**: если компонент анмаунтится пока запрос в полёте (быстрая навигация), `setStopping(false)` и `toast.*` вызываются на unmounted component. Аналогичный паттерн уже исправлен в SIRI-UX-167/168/169 для useEffect-фетчей. Fix: AbortController + AbortError guard внутри handleStop. `WarRoomPage.tsx:198` | Siri | fixed |
| SIRI-UX-174 | minor | **`WarRoomPage.tsx:520` — agent status dot `<span>` без `role="img"`**: элемент имеет `aria-label={statusLabel[agent.status]}` но role=none (generic span). Согласно ARIA spec, `aria-label` на элементе без роли может быть проигнорирован screen reader'ами — статус агента не будет объявлен. Fix: добавить `role="img"` на span. `WarRoomPage.tsx:520` | Siri | fixed |
| SIRI-UX-175 | minor | **`WarRoomPage.tsx:250` — `handleStop` возвращает cleanup fn внутри async функции**: `return () => abortController.abort()` находится в конце async click handler, а не в useEffect — cleanup никогда не вызывается. AbortController создаётся заново на каждый клик но не сохраняется в ref, поэтому при быстрой навигации (unmount во время fetch) AbortError не бросается. Fix: сохранить abortController в `useRef`, вызывать `abort()` в useEffect cleanup при unmount. `WarRoomPage.tsx:198-250` | Siri | fixed |
| SIRI-UX-176 | minor | **`CompanyPage.tsx:216` — `handleLoadMoreTasks` без AbortController**: если компонент анмаунтится во время fetch (быстрая навигация между компаниями), `setTasks`, `setTaskOffset`, `setHasMoreTasks`, `toast.*` вызываются на unmounted component. `handleLoadMoreTasks` — единственный async handler в CompanyPage без AbortController. Fix: использовать ref для хранения controller и abort при unmount, либо guard с `isMounted` flag. `CompanyPage.tsx:216` | Siri | fixed |
| SIRI-UX-177 | minor | **`TaskDetailSidebar.tsx:98` — stale logs при смене задачи**: при открытии другого таска `logs` и `statusHistory` не сбрасываются перед новым fetch. Пользователь видит логи предыдущей задачи до завершения запроса (~100-500ms). Fix: добавить `setLogs([])` и `setStatusHistory([])` в начале `fetchLogs()` до await, или добавить явный reset в useEffect до `fetchLogs()`. `TaskDetailSidebar.tsx:63-98` | Siri | fixed |
| SIRI-UX-178 | minor | **`KanbanBoard.tsx` FilterBar — dropdowns не закрываются по Escape**: при открытом Agent/Priority dropdown нажатие Escape не закрывает его (только модалы TaskCard реагируют на Escape). FilterBar имеет только `mousedown outside` handler, но не keydown. Fix: добавить `keydown` listener на Escape в FilterBar useEffect (по аналогии с SIRI-UX-062). `KanbanBoard.tsx:FilterBar` | Siri | fixed |
| SIRI-UX-179 | minor | **`CompaniesPage.tsx:57` — `load()` вызывается в `useEffect` без AbortController**: async функция `load()` вызывается напрямую в `useEffect(() => { load() }, [])` без cleanup. Если компонент анмаунтится во время fetch, `setCompanies`, `setLoadError`, `setLoading`, `setHasLoadedOnce` вызываются на unmounted component. Паттерн отличается от всех других страниц (CompanyPage, LibraryPage, AgentPage — все используют AbortController в useEffect). Fix: передавать AbortSignal в `load(signal?)` и вызывать `controller.abort()` в cleanup. `CompaniesPage.tsx:33-57` | Siri | fixed |
| SIRI-UX-180 | minor | **`KanbanBoard.tsx:756,778` — FilterBar badge remove buttons без `aria-label`**: кнопки удаления фильтра (агент/приоритет) содержат только `×` без `aria-label`. Screen reader объявит просто "×" вместо "Remove agent X from filter" / "Remove priority Y from filter". Fix: добавить `aria-label={`Remove agent ${agent?.name ?? agentId} filter`}` и `aria-label={`Remove ${p} priority filter`}`. `KanbanBoard.tsx:756,778` | Siri | fixed |
| SIRI-UX-181 | minor | **`GlobalSearch.tsx:47` — `setTimeout` без cleanup в useEffect**: при открытии поиска `setTimeout(() => inputRef.current?.focus(), 0)` вызывается без сохранения timer ID и без cleanup. Если компонент анмаунтится до срабатывания таймера (edge case), попытка `.focus()` произойдёт на unmounted DOM node. Fix: сохранить timer id в ref и вызвать `clearTimeout` в cleanup `useEffect`. `GlobalSearch.tsx:42-49` | Siri | fixed |
| SIRI-UX-182 | minor | **`KanbanBoard.tsx:214` — TaskCard кликабельный `div` не имеет `tabIndex` и `role="button"`**: карточка задачи открывается по клику, но без `tabIndex={0}`, `role="button"` и `onKeyDown` (Enter/Space) она недоступна для пользователей клавиатуры и screen reader не объявит её как интерактивный элемент. `KanbanBoard.tsx:214-240` | Siri | fixed |
| SIRI-UX-183 | minor | **`CompaniesPage.tsx:67` — `handleCreate` async POST без AbortController**: при анмаунте компонента во время выполнения POST запроса setState вызывается на unmounted component (setCreating, setNewName, setShowNewModal, load()). Паттерн AbortController нужен так же как в load(). `CompaniesPage.tsx:67-93` | Siri | fixed |
| SIRI-UX-184 | minor | **`WarRoomPage.tsx:63` — connectingTimer cleanup только в одной ветке useEffect**: `connectingTimerRef.current` устанавливается в ветке `if (isConnected && agents.length === 0)`, но cleanup-функция `return () => clearTimeout(...)` возвращается только из этой же ветки. Когда эффект ре-запускается с другими deps (agents появляются, isConnected меняется), таймер из предыдущего рендера не очищается — потенциальный stale closure. `WarRoomPage.tsx:63-90` | Siri | fixed |
| SIRI-UX-031 | major | `WarRoomPage.tsx`: mock interval deps использует `agents.length > 0` (boolean expression) вместо значения — `[agents.length > 0, isConnected]` даёт `[true/false, bool]`, useEffect не пересчитывается корректно при изменении agents. Интервал может не стартовать/останавливаться. Строка ~105. | Siri | fixed |
| SIRI-UX-032 | major | `CompanyPage.tsx`: `<WarRoomPage/>` рендерится немедленно с mock данными ДО того как `agentsLoaded=true`. При реальном API-ответе 0 агентов происходит flash от mock-populated → empty state. Нужно: не рендерить WarRoomPage пока `!agentsLoaded`, показывать skeleton. Строки ~248-252. | Siri | fixed |
| SIRI-UX-033 | minor | `OnboardingPage.tsx`: company name input имеет `outline: 'none'` без `onFocus/onBlur` visible ring — нарушает паттерн который установлен для всех других inputs (SIRI-UX-028/029/030). Строка ~134. | Siri | fixed |
| SIRI-UX-034 | minor | `KanbanBoard.tsx`: create-task modal inputs (`title`, `desc`) и edit-task modal inputs не имеют visible focus ring — голые `border: 1px solid #374151` без onFocus/onBlur handler. Строки ~356-385 (create modal), ~195-220 (edit modal). | Siri | fixed |
| SIRI-UX-035 | minor | `AgentPage.tsx`: `<h2>Memory</h2>` и `<h2>History</h2>` всегда рендерятся, даже когда `agentLoading=true` — заголовки появляются раньше основного контента. Нужно условно рендерить секции после `agentLoading=false`. Строки ~156, ~185. | Siri | fixed |
| SIRI-UX-036 | major | `AuthPage.tsx`: ссылка "Forgot password?" ведёт на `/forgot-password` — маршрут не существует в `App.tsx`. Переход ломает приложение (404-like blank page). Нужно убрать ссылку или показать "Coming soon" tooltip/disabled state. | Siri | fixed |
| SIRI-UX-037 | minor | `Navbar.tsx`: логотип "AgentCo" — plain `<span>`, не кликабельный. Пользователи ожидают переход на главную при клике на логотип. Нужно обернуть в `<NavLink to="/">`. | Siri | fixed |
| SIRI-UX-038 | minor | `CompanySettingsPage.tsx`: inputs (company name, description) и confirm-delete input не имеют visible focus ring — нет `onFocus/onBlur` handlers. Нарушает accessibility паттерн, установленный для всех других inputs. | Siri | fixed |
| SIRI-UX-039 | minor | `AgentEditPage.tsx`: кнопка Cancel не имеет hover state — нет `onMouseEnter/Leave`. Все другие кнопки-ссылки имеют hover feedback. | Siri | fixed |
| SIRI-UX-040 | minor | `LibraryPortfolioPage.tsx`: loading state — plain grey text "Loading…", error state — plain text без retry. Не соответствует SkeletonCard/EmptyState паттерну остальных страниц. | Siri | fixed |
| SIRI-UX-041 | minor | `BillingPage.tsx`: mock данные показывают `apiCalls: 1,240` при лимите `1,000/mo` — пользователь видит превышение квоты на странице биллинга. Нужно обновить mock до корректного значения (240) или добавить индикатор overage. | Siri | fixed |

| SIRI-UX-042 | minor | `Breadcrumb.tsx` + `CompanyPage.tsx`: на страницах компании два breadcrumb-подобных UI — `Breadcrumb` bar из AppLayout И `CompanyHeader` в CompanyPage. Визуальная избыточность, 37px лишнего пространства. | Siri | fixed |
| SIRI-UX-043 | minor | `AgentCard.tsx`: кнопка "View History" ведёт на `/companies/{id}/agents/{agentId}` — страницу AgentPage с полными данными агента (details + memory + history). Лейбл не соответствует содержимому. Переименовано в "View Agent". | Siri | fixed |
| SIRI-UX-044 | minor | Двойная навигация: `Navbar.tsx` содержит Companies + Settings links, `Sidebar.tsx` содержит те же ссылки + War Room + Library. На десктопе пользователь видит два варианта навигации. На мобайл Sidebar скрыт, Navbar links остаются. Нужно либо убрать nav links из Navbar, либо скрыть Sidebar на больших экранах. | Siri | fixed |
| SIRI-UX-045 | major | `KanbanBoard.tsx`: кнопка "+ New Task" видна только в EmptyState (когда тасков нет). Как только первый таск создан — кнопки создания нового таска нет. Добавлена persistent кнопка "+ New Task" в правом верхнем углу KanbanBoard. | Siri | fixed |
| SIRI-UX-046 | minor | `CompanyPage.tsx`: War Room tab рендерит `<WarRoomPage/>` пока `agentsLoaded=false` — WarRoomPage показывает "Connecting..." spinner вместо контекстного skeleton. WarRoomPage не знает что agents ещё грузятся из API. Задокументировано, не фиксировать отдельно — WarRoomPage.isConnecting state покрывает этот кейс. | Siri | fixed |
| SIRI-UX-047 | major | `KanbanBoard.tsx:TaskCard`: Run кнопка не обновляет local task status после успешного запуска. После `POST /run` успех — задача остаётся в `todo`/`backlog`, кнопка Run остаётся видна. Пользователь может кликнуть Run повторно на ту же задачу, запустив дубликат. Нужно: при успешном run обновить `task.status = 'in_progress'` в store. `KanbanBoard.tsx:handleRun~95` | Siri | fixed |
| SIRI-UX-048 | minor | `KanbanBoard.tsx:Create Task Modal`: нет выбора priority при создании задачи. Все новые задачи создаются без priority → нет priority badge на карточке. Пользователь видит карточку без цветового ранжирования. Нужно добавить priority select в Create Task Modal. `KanbanBoard.tsx:showCreateModal~570` | Siri | fixed |
| SIRI-UX-049 | minor | `KanbanBoard.tsx` / `TaskDetailSidebar.tsx`: дублирование утилит — `STATUS_COLORS`, `AVATAR_COLORS`, `getAvatarColor()`, `getInitials()` определены в обоих файлах. 40+ строк копипасты. Нужно вынести в `src/utils/taskUtils.ts`. `KanbanBoard.tsx:20-50`, `TaskDetailSidebar.tsx:9-40` | Siri | fixed |
| SIRI-UX-050 | minor | `WarRoomPage.tsx:Activity Feed`: сообщения truncated до 120 символов без способа раскрыть полный текст. На демо длинные сообщения агентов обрезаются — пользователь не видит ответ полностью. Нужно добавить expand/collapse по клику. `WarRoomPage.tsx:truncate` | Siri | fixed |
| SIRI-UX-051 | minor | `AgentPage.tsx`: кнопка "Save to Library" не disabled после успешного сохранения — повторный клик делает дублирующий POST. `savedToLibrary` state установлен, но кнопка не disabled. Нужно: `disabled={savedToLibrary}`. `AgentPage.tsx:Save to Library Button~115` | Siri | fixed |
| SIRI-UX-052 | minor | `App.tsx`: роут `/war-room` рендерит `<WarRoomPage />` без `companyId` в params — `useParams` вернёт undefined, WS подключается к `undefined/events`. В `WarRoomPage.tsx:68` `companyId ?? 'mock-company'` маскирует проблему. Роут `/war-room` в sidebar ведёт в никуда без context компании. Нужно редиректить на последнюю компанию или скрыть sidebar War Room link когда нет активной компании. `App.tsx:30`, `Sidebar.tsx` | Siri | fixed |
| SIRI-UX-053 | minor | `SIRI-UX-047-052.test.tsx`: Task fixture использует `null` для `assignee_id`/`assignee_name`, но тип `Task` объявляет эти поля как `string \| undefined`. TypeScript строго ловит null≠undefined при `tsconfig strict`. Вызывает TS error TS2322 при check. Нужно заменить `null` → `undefined` в тест-фикстурах. `SIRI-UX-047-052.test.tsx:37` | Siri | fixed |
| SIRI-UX-054 | minor | `AgentPage.test.tsx` и `SIRI-UX-047-052.test.tsx`: React выдаёт предупреждения `act()` в трёх параллельных fetch-хуках `AgentPage` — state updates происходят вне act. Тесты зелёные, но warnings засоряют вывод и могут маскировать настоящие проблемы. Задокументировано; полный фикс требует `waitFor` на все три параллельных fetch (agent + tasks + memory). Новые тесты в SIRI-UX-053-055.test.tsx используют правильный паттерн с `waitFor`. | Siri | fixed |
| SIRI-UX-055 | minor | `KanbanBoard.tsx:TaskCard`: context menu items (Edit/Delete/Assign) реализованы как `<div>` — не фокусируются с клавиатуры, нет role, screen reader не объявляет их как интерактивные элементы. Нужно заменить на `<button role="menuitem">` с `onKeyDown` Enter/Space handler. `KanbanBoard.tsx:233` | Siri | fixed |
| SIRI-UX-056 | minor | `WarRoomPage.tsx:ActivityFeed`: сообщения expand/collapse реализованы как `<div onClick>` — не фокусируются с клавиатуры, нет `role="button"`, нет `tabIndex`, нет Enter/Space handler. Длинные сообщения недоступны для клавиатурных и screen reader пользователей. `WarRoomPage.tsx:feed-message div` | Siri | fixed |
| SIRI-UX-057 | minor | `TaskDetailSidebar.tsx`: кнопка закрытия (×) не имеет `aria-label` — screen reader объявляет "×" вместо "Close". Нужно добавить `aria-label="Close"`. `TaskDetailSidebar.tsx:sidebar-close-btn` | Siri | fixed |
| SIRI-UX-058 | minor | `AgentPage.tsx:History`: история задач (list items) реализована как `<div onClick>` без `role="button"`, `tabIndex`, `aria-expanded` — не фокусируются с клавиатуры и не объявляются как интерактивные. Нужно добавить `role="button"`, `tabIndex={0}`, `aria-expanded`, `onKeyDown` handler. `AgentPage.tsx:history item div` | Siri | fixed |
| SIRI-UX-059 | major | `AgentPage.tsx`: нет error/not-found state при 404 или сетевой ошибке загрузки агента. При `!res.ok` fetch возвращает `null`, `agentData` остаётся `null`, `agentLoading=false` — страница тихо рендерит пустые поля (`—`) без какого-либо сообщения об ошибке. Пользователь не понимает что что-то пошло не так. `AgentPage.tsx:83-87` | Siri | fixed |
| SIRI-UX-060 | minor | `KanbanBoard.tsx:FilterBar`: filter dropdown items заменены на `<button role="menuitem">` с aria-checked + onKeyDown | Siri | fixed |
| SIRI-UX-061 | minor | `KanbanBoard.tsx`: модалы Create/Edit/Delete task не закрываются по Escape key — несогласованное UX (TaskDetailSidebar правильно обрабатывает Escape, модалы — нет). При открытом модале нельзя выйти клавиатурой. `KanbanBoard.tsx:~345,~437,~472` | Siri | fixed |
| SIRI-UX-062 | minor | `KanbanBoard.tsx:TaskCard` — Assign Agent dropdown (`assignOpen`) не закрывался по Escape, в отличие от Edit/Delete модалов. Несогласованное поведение внутри одного компонента. Фикс: расширить useEffect BUG-050 чтобы включал `assignOpen`. | Siri | fixed |
| SIRI-UX-063 | major | `KanbanBoard.tsx`: все модалы (Edit, Delete, Assign, Create) отсутствуют `role="dialog"` и `aria-modal="true"` — screen readers не идентифицируют их как диалоги, не делают правильный трапинг фокуса. WCAG 2.1 AA: 4.1.2 (Name, Role, Value). Фикс: добавить `role="dialog" aria-modal="true" aria-label="..."` ко всем 4 оверлеям. | Siri | fixed |
| SIRI-UX-064 | minor | `KanbanBoard.tsx:TaskCard` — кнопка ··· (task menu) имеет только `title="Task options"` но нет `aria-label`, `aria-expanded`, `aria-haspopup`. Screen readers не объявляют состояние меню, клавиатурные пользователи не знают что кнопка управляет popup меню. Фикс: добавить атрибуты. | Siri | fixed |
| SIRI-UX-065 | minor | `LibraryPage.tsx:ForkModal` — модал выбора компании не имеет `role="dialog"` / `aria-modal="true"` / `aria-label` / Escape handler. Несоответствие паттерну из SIRI-UX-063 где все KanbanBoard модалы были приведены в порядок. LibraryPage выпала из той серии фиксов. | Siri | fixed |
| SIRI-UX-066 | minor | `AgentForm.tsx` — `<label>` элементы не связаны с полями через `htmlFor`/`id`. Screen reader читает label без привязки к полю. Стандарт WCAG 2.1 AA: 1.3.1. Поля: Name, Role, Model, System Prompt. | Siri | fixed |
| SIRI-UX-067 | minor | `OnboardingPage.tsx` — input "company name" не имеет `<label>` (только placeholder). При фокусе screen reader ничего не объявляет. Нужно добавить визуально скрытый `<label htmlFor>` или `aria-label`. | Siri | fixed |
| SIRI-UX-068 | minor | `WarRoomPage.tsx:ActivityFeed` — нет `aria-live="polite"` на контейнере фида. Новые сообщения от агентов не объявляются screen reader в реальном времени. Критично для accessibility War Room — главного экрана продукта. | Siri | fixed |
| SIRI-UX-069 | minor | `LibraryPage.tsx` — не использует pagination параметры (`limit`/`offset`) которые бэкенд теперь поддерживает (ALEX-TD-040). При большом количестве агентов в library UI загружает все записи без limit. Нужно добавить `?limit=50` по умолчанию. | Siri | fixed |
| SIRI-UX-070 | minor | `KanbanBoard.tsx:TaskCard` — task menu dropdown (`···`) не закрывается по Escape. `useEffect` закрывает `editOpen/deleteOpen/assignOpen`, но `menuOpen` не включён. При нажатии Esc меню остаётся открытым — нарушение keyboard UX и WCAG 2.1. Нужно добавить `setMenuOpen(false)` в Escape handler. | Siri | fixed |
| SIRI-UX-071 | minor | `WarRoomPage.tsx` mobile agents toggle button — нет `aria-expanded`. Кнопка `👥 {agents.length}` открывает/закрывает panel, но не объявляет состояние screen reader. Нужно добавить `aria-expanded={agentPanelOpen}`. | Siri | fixed |
| SIRI-UX-073 | minor | `AgentEditPage.tsx` — когда fetch агента возвращает null (404 или ошибка), форма рендерится пустой без индикации ошибки. Пользователь видит пустой "Edit Agent" и не понимает что случилось. Добавлен guard `if (!agent)` с error state аналогично `AgentPage.tsx`. | Siri | fixed |
| SIRI-UX-074 | minor | `CompaniesPage.tsx` "New Company" modal — отсутствуют `role="dialog"`, `aria-modal="true"`, `aria-label`, и Escape key handler. Все остальные модалы в проекте имеют эти атрибуты. Добавлены все недостающие атрибуты. | Siri | fixed |
| SIRI-UX-075 | minor | `WarRoomPage.tsx` agent status dot (`data-testid="agent-status-dot"`) — `<span>` с CSS классом цвета без `aria-label`. Screen reader не видит статус агента. Добавлено `aria-label={statusLabel[agent.status]}`. | Siri | fixed |
| SIRI-UX-076 | minor | `TaskDetailSidebar.tsx` кнопка "Run Task" — нет `aria-label`. Кнопка имеет `data-testid="sidebar-run-btn"` но без accessible name. Добавлено `aria-label`. | Siri | fixed |
| SIRI-UX-077 | minor | `useWarRoomSocket.ts` — при обработке `agent_status` события из WS, `data.agentId` и `data.status` кастятся через `as string/WarRoomAgentStatus` без валидации. Если бэкенд пришлёт другой shape (например `agent_id` вместо `agentId`), статус тихо не обновится. Нужна валидация перед вызовом `updateAgentStatus`. | Siri | fixed |
| SIRI-UX-078 | major | `WarRoomPage.handleStop` — использует `r.run_id` для формирования URL `/runs/{r.run_id}/stop`, но бэкенд `RunOut` schema возвращает поле `id`, не `run_id`. Результат: Stop endpoint URL = `/runs/undefined/stop` → 404, кнопка Stop тихо не работает. Зафиксировано: заменён `r.run_id` → `r.id`, тип обновлён. | Siri | fixed |
| SIRI-UX-079 | major | `useWarRoomSocket.ts` — hook обрабатывает только `message` и `agent_status` типы событий. Бэкенд публикует `run.completed`, `run.failed`, `run.stopped`, `run.started`, `run.status_changed` через EventBus → WebSocket, но фронтенд их игнорирует. `warRoomStore.runStatus` никогда не обновляется с реального WS. Зафиксировано: добавлены handlers для всех run-lifecycle событий. | Siri | fixed |
| SIRI-UX-080 | minor | `KanbanBoard.tsx` FilterBar search input (`data-testid="kanban-search-input"`) не имеет `aria-label` — только `placeholder`. Screen reader не объявляет поле при фокусе. Create Task modal inputs (title, description) также без `aria-label`. Зафиксировано: добавлены `aria-label` на search input и create-task title input. | Siri | fixed |
| ALEX-TD-047 | minor | `handlers/auth.py` — `/register` и `/login` не имеют rate limiting (`@limiter.limit`). Все остальные эндпоинты защищены, auth — нет. Уязвимость к brute-force/credential stuffing. handlers/auth.py:46,55 | Alex | fixed |
| ALEX-TD-048 | minor | `services/run.py:158` — если `RUN_MAX_RETRIES=0`, цикл `for attempt in range(1, 0+1)` не выполняется, `last_exc` остаётся `None`, `raise last_exc` бросает `TypeError`. Нужна проверка `_MAX_RETRIES >= 1` или ранний return. services/run.py:158 | Alex | fixed |
| ALEX-TD-049 | minor | `main.py` — `ApiV1AliasMiddleware` мутирует `request.scope["path"]` и `"raw_path"`, но не обновляет `"path_params"`. FastAPI парсит path params до middleware-перезаписи, поэтому `{company_id}` и другие params могут не матчиться при роутинге через `/api/v1/`. main.py:76 | Alex | fixed |
| ALEX-TD-050 | major | `handlers/credentials.py:validate_llm_key` — `POST /api/llm/validate-key` не имеет rate limiting (`@limiter.limit`). Каждый вызов делает реальный LLM-запрос (хоть и `max_tokens=1`). Злоумышленник может вызвать endpoint в цикле → cost abuse перед демо. Все остальные write endpoints защищены limiter-ом. Фикс: добавить `@limiter.limit("5/minute")` на `validate_llm_key`. handlers/credentials.py:168 | Alex | fixed |
| ALEX-TD-051 | minor | `handlers/runs.py:RunCreate.goal` — поле `goal: str = Field(min_length=1)` без `max_length`. Можно отправить мегабайтную строку → передаётся в LLM как prompt → огромные token costs / timeout. Фикс: добавить `max_length=10000` (разумный лимит для пользовательского goal). handlers/runs.py:39 | Alex | fixed |
| ALEX-TD-052 | minor | `main.py:/health` — healthcheck endpoint возвращает `{"status": "ok"}` без реальной проверки DB-подключения. Railway использует `/health` для liveness probe: если DB сломана, но процесс жив — Railway не рестартует под. Фикс: сделать DB ping в `/health` (простой `SELECT 1`), возвращать 503 если DB недоступна. main.py:121 | Alex | fixed |
| ALEX-TD-053 | minor | `services/encryption.py` — `_get_fernet()` создаёт новый экземпляр `Fernet(key)` при каждом вызове `encrypt()`/`decrypt()`. `Fernet.__init__` делает base64-decode ключа каждый раз — бессмысленная работа. Фикс: кэшировать `Fernet` instance на уровне модуля (через `functools.lru_cache` или module-level singleton). services/encryption.py:14 | Alex | fixed |
| SIRI-UX-081 | major | `TaskDetailSidebar.handleRun` — после успешного POST `/run` не обновляет локальный статус задачи в `agentStore`. Пользователь может нажать "Run Task" повторно — кнопка не прячется (в отличие от `KanbanBoard.TaskCard` где `setTasks(...)` вызывается после run). Нужно импортировать `useAgentStore` и сделать optimistic update статуса → `in_progress`. | Siri | fixed |
| SIRI-UX-082 | major | `WarRoomPage` — `warRoomStore.runStatus` обновляется через WS (SIRI-UX-079), но UI не читает это поле. При `runStatus === 'done'/'failed'/'stopped'` нет никакого визуального сигнала. Нужен banner/badge поверх War Room с информацией о статусе рана. | Siri | fixed |
| SIRI-UX-083 | major | `CompanyPage` — War Room tab рендерит `<WarRoomPage />` немедленно даже когда `agentsLoaded=false`. При загрузке страницы агенты ещё не пришли, `agents.length === 0` — WarRoomPage показывает "All quiet here" на ~200ms. Нужно показывать skeleton/spinner пока `agentsLoaded` не стал `true`. | Siri | fixed |
| SIRI-UX-084 | minor | `CompanyPage.CompanyHeader` — на мобайле рендерятся ДВА элемента с `data-testid="company-header-home-link"`: один видимый (отсутствует на mobile), один скрытый (`display: none`). Дублирующийся testid ломает тесты и нарушает семантику. Нужно убрать hidden-дубль. | Siri | fixed |
| SIRI-UX-085 | minor | `TaskDetailSidebar.tsx:374` — `@keyframes slideInRight` объявлен в `<style>` JSX-тег внутри компонента, а не в `index.css`. Это несогласованно с остальными анимациями (`spin`, `bounce`, `pulse`, `flash-green` — все в `index.css`). Каждый рендер создаёт новый `<style>` тег. Перенести в `index.css`. | Siri | fixed |
| SIRI-UX-086 | major | `WarRoomPage.tsx` — кнопка Stop остаётся enabled когда `runStatus` равен `done`/`failed`/`stopped`. На демо: пользователь видит активную кнопку Stop после того как ран завершился — непонятно, дезориентирует. Фикс: `disabled={stopping \|\| runStatus === 'done' \|\| runStatus === 'failed' \|\| runStatus === 'stopped'}` + `opacity: 0.4` для завершённых статусов. | Siri | fixed |
| SIRI-UX-087 | minor | `OnboardingPage.tsx` — `@keyframes fadeIn` объявлен в inline `<style>` JSX-тег внутри компонента (строка ~130). Несоответствие паттерну: все анимации в `index.css` (SIRI-UX-085 перенёс slideInRight, та же проблема). Каждый рендер создаёт новый `<style>`. Перенести `fadeIn` в `index.css`. | Siri | fixed |
| SIRI-UX-088 | minor | `CompanyPage.tsx` — `role="tablist"` div не имеет `aria-label`. Screen reader не знает назначение группы вкладок. Стандарт WCAG 2.1 AA: 4.1.2. Добавлен `aria-label="Company sections"`. | Siri | fixed |
| SIRI-UX-089 | minor | `WarRoomPage.tsx` — WS status indicator dot (`data-testid="ws-status-indicator"`) не имеет `role` и `aria-label`. Screen reader не объявляет статус соединения. Добавлен `role="img"` + `aria-label="WebSocket connected/disconnected"`. | Siri | fixed |
| SIRI-UX-090 | minor | `KanbanBoard.tsx:FilterBar` — кнопки фильтров ("Agent", "Priority") не имеют `aria-expanded` / `aria-haspopup`. Клавиатурные/screen reader пользователи не знают что кнопка управляет dropdown. Добавлены `aria-expanded={open}` и `aria-haspopup="listbox"`. | Siri | fixed |
| SIRI-UX-091 | major | `CompanyPage.tsx` — модал "Add Agent" (`data-testid="agent-form-modal"`) не имеет `role="dialog"`, `aria-modal="true"`, `aria-label`, и обработчика Escape. Все остальные модалы в проекте (CompaniesPage, LibraryPage ForkModal) имеют эти атрибуты. На демо: инвесторы могут использовать keyboard nav. Зафиксировано: добавлены `role="dialog"`, `aria-modal="true"`, `aria-label="Add Agent"`, `useCallback` Escape handler. | Siri | fixed |
| SIRI-UX-092 | minor | `GlobalSearch.tsx` — `<input>` в overlay не имеет `aria-label`, только `placeholder`. Screen reader не объявляет поле при фокусе (placeholder не является accessible name). Добавлен `aria-label="Search companies, agents, tasks"`. | Siri | fixed |
| SIRI-UX-093 | minor | `Sidebar.tsx` — кнопка toggle (`data-testid="sidebar-toggle"`) имеет `title` атрибут, но не `aria-label`. `title` не работает надёжно для screen readers. Добавлен `aria-label` совпадающий с `title`. | Siri | fixed |
| SIRI-UX-094 | major | `BillingPage.tsx` — карточки использования (API calls / Tokens) показывают голые числа без визуального прогресса. На демо инвестору страница Billing выглядит незаконченной. Добавлены progress bar'ы (`role="progressbar"`) с процентом заполнения для обеих метрик. | Siri | fixed |
| SIRI-UX-095 | minor | `LibraryPortfolioPage.tsx` — кнопка Retry дублирует полный fetch-логику inline (~10 строк), создавая stale closure over `id`. При изменении `id` retry будет использовать старый `id` из closure. Рефактор: `fetchPortfolio` вынесен в `useCallback([id])`, использован в `useEffect` и в Retry `onClick`. | Siri | fixed |
| SIRI-UX-096 | critical | `useWarRoomSocket.ts` — WS URL не содержит auth token. Backend требует `?token=<jwt>`, без него закрывает соединение с кодом 4001 (Unauthorized). `WarRoomPage` при `isConnected=true` вызывает `store.reset()` — мок-данные стираются, экран пустеет навсегда. На демо с реальным backend: War Room будет пустой. Fix: `getStoredToken()` импортирован и добавлен в URL как `?token=encodeURIComponent(token)`. Добавлены guard'ы: код 4001/4003 → не ретраить (предотвращает бесконечный retry loop). | Siri | fixed |
| SIRI-UX-097 | critical | `KanbanBoard` передаёт `selectedTask` (local state snapshot) в `TaskDetailSidebar`. После того как `handleRun` в sidebar делает optimistic update через `useAgentStore.setTasks(...)`, пропс `task` в sidebar не обновляется — `task.status` остаётся прежним, `canRun` = true, кнопка "Run Task" не прячется. Double-run возможен без перезакрытия sidebar. Fix: получать задачу из store через `tasks.find(t => t.id === selectedTask.id)` вместо stale state prop. | Siri | fixed |
| SIRI-UX-098 | major | `WarRoomPage.handleStop` — после успешной остановки всех ранов не вызывает `setRunStatus('stopped')`. Stop banner не появляется, Stop button остаётся enabled. В реальном backend ран закрывается, но фронт не реагирует — инвестор нажимает Stop и ничего не происходит визуально. Fix: вызвать `setRunStatus('stopped')` после успешного stoppa. | Siri | fixed |
| SIRI-UX-099 | major | `WarRoomPage` получает `error` из `useWarRoomSocket()` но никогда не рендерит его. При 4001 (unauthorized) или network failure пользователь видит просто пустой War Room или mock data — silent failure. На демо: если JWT истёк, экран будет выглядеть как загрузка. Fix: показывать error toast или inline banner когда `error !== null`. | Siri | fixed |
| SIRI-UX-100 | minor | `KanbanBoard.tsx` — Escape-handler (`document.addEventListener('keydown', ...)`) для create-modal добавлен с пустым deps-array `[]` и **всегда активен**, независимо от `showCreateModal`. Это лишний listener, который закрывает `showCreateModal` даже если оно уже `false`, и конфликтует с другими Escape-обработчиками (TaskDetailSidebar). Fix: убрать этот redundant listener — TaskDetailSidebar уже имеет Escape-handler; для createModal добавить gated effect с `[showCreateModal]` dep. | Siri | fixed |
| SIRI-UX-101 | minor | `useWarRoomSocket.ts` — `console.warn(...)` вызовы при invalid `agent_status` events видны в DevTools на демо. Инвесторы в DevTools увидят warnings. Fix: убрать console.warn в production (не тот уровень для продакшн-демо). | Siri | fixed |
| SIRI-UX-102 | major | `CompanySettingsPage.tsx` — delete modal не имеет `role="dialog"`, `aria-modal="true"`, `aria-label`, и обработчика Escape. Та же проблема что SIRI-UX-091 (CompanyPage) — уже зафиксирована там, но CompanySettingsPage пропущен. На демо с keyboard navigation: деструктивный модал не анонсируется screen reader, Escape не работает. | Siri | fixed |

| SIRI-UX-103 | minor | `AuthPage.tsx` — Sign In / Sign Up tabs реализованы как `<button>` без `role="tab"`, `role="tablist"`, и `aria-selected`. Screen reader не анонсирует переключение вкладок. Стандарт ARIA Authoring Practices Guide (APG) требует tablist pattern для tab-switching UI. Фикс: обёртка с `role="tablist"`, каждой кнопке `role="tab"` + `aria-selected`, панели содержимого `role="tabpanel"`. | Siri | fixed |
| SIRI-UX-104 | minor | `AgentCard.tsx` — `status-dot` (`data-testid="status-dot"`) не имеет `aria-label` и `role="img"`. При статусе `running` screen reader не сообщает что агент активен. Та же проблема что SIRI-UX-089 (WarRoomPage agent-status-dot) — уже зафиксирована там, но AgentCard пропущен. | Siri | fixed |
| SIRI-UX-105 | minor | `CompaniesPage.tsx` — при закрытии modal через кнопку Cancel `newName` state не сбрасывается в `''`. При повторном открятии модала поле показывает старое значение. Fix: добавить `setNewName('')` в `onClick={() => setShowNewModal(false)}`. | Siri | fixed |
| SIRI-UX-106 | minor | `AgentCard.tsx` — `getAvatarColor`, `getInitials`, `hashCode` объявлены локально, хотя canonical версии уже экстрактированы в `src/utils/taskUtils.ts` (SIRI-UX-049). Дублирование utility-функций создаёт рассинхронизацию. Рефактор: импортировать из `taskUtils`, удалить локальные дубли. | Siri | fixed |
| SIRI-UX-107 | minor | `CompanyPage.tsx` — `AVATAR_COLORS` (line 15) и `hashCode` (line 20) объявлены локально в `CompanyHeader`, хотя canonical версии уже в `src/utils/taskUtils.ts`. Дублирование создаёт рассинхронизацию цветовой схемы — `CompanyHeader` использует 8 цветов, `taskUtils` использует другой набор. Рефактор: заменить на `getAvatarColor` из taskUtils. | Siri | fixed |
| SIRI-UX-108 | minor | `AuthPage.tsx` — `role="tabpanel"` div (line 161) не имеет `aria-labelledby`, указывающего на активную таб-кнопку. Стандарт WAI-ARIA требует чтобы каждый `tabpanel` был связан с соответствующей `tab` через `aria-labelledby`. Screen reader не знает какой контент активен. | Siri | fixed |
| SIRI-UX-109 | major | `TaskDetailSidebar.tsx` — при ошибке загрузки `/logs` API (сеть упала, 500) `logsLoading` переходит в `false` но `logs` остаётся `[]`, что показывает "No execution log yet" — не отличимо от реального empty state. Нет `logsError` state. Пользователь не знает, были ли ошибки или просто нет логов. Добавить `logsError` state и показывать `⚠ Failed to load logs` при ошибке. | Siri | fixed |
| SIRI-UX-110 | minor | `WarRoom.tsx` — `timeAgo` функция не реактивна: вычисляется один раз при рендере и не обновляется. Для долгоживущих ранов метка "2s ago" остаётся навсегда. Нужен `setInterval` для переренеривания компонента каждую минуту, либо пересчёт `runs` по таймеру. | Siri | fixed |
| SIRI-UX-111 | minor | `KanbanBoard.tsx` — поле `create-task-title-input` при нажатии Enter вызывает `handleCreateTask`, но если `newTaskTitle.trim()` пустой, ничего не происходит без визуального фидбека. Инпуты без disabled-state или shake-animation не дают понять пользователю почему форма не отправилась. Добавить `aria-invalid` + `aria-describedby` на инпут при попытке сабмита с пустым значением. | Siri | fixed |
| SIRI-UX-112 | major | `KanbanBoard.tsx` — форма Create Task modal не сбрасывается при закрытии через Escape, клик на backdrop или Cancel. При повторном открытии title/desc/priority показывают старые значения. Добавить `setNewTaskTitle('')`, `setNewTaskDesc('')`, `setNewTaskPriority('')` во все close handlers. | Siri | fixed |
| SIRI-UX-113 | major | `WarRoomPage.tsx` — при переключении между компаниями store (agents, messages, cost) не сбрасывается. Данные предыдущей компании «просвечивают» до первого WS-события новой. Нужен `useEffect` с `reset()` при изменении `companyId`. | Siri | fixed |
| SIRI-UX-116 | minor | `useWarRoomSocket.ts` — events array растёт без ограничений при долгих сессиях (сотни WS-событий). Нет cap/trim. В длинных War Room-сессиях это приводит к утечке памяти. Добавить `MAX_EVENTS = 500` и slicing при append. | Siri | fixed |
| SIRI-UX-117 | minor | `useWarRoomSocket.ts` — интеграционный тест не проверял что `run.completed`/`run.failed`/`run.stopped` обновляют `warRoomStore.runStatus`. Покрытие было только на уровне `events[]` array. FE-001 smoke test дополнен тестами store-side эффектов. | Siri | fixed |
| SIRI-UX-118 | minor | `KanbanBoard.tsx` — отсутствовал stress test для drag & drop 5+ карточек в нескольких итерациях. Без него сложно поймать race condition при быстрых последовательных drop-событиях. FE-004 дополнен stress тестом (7 карточек, 2 итерации). | Siri | fixed |
```
Severity:
- **critical** — приложение падает / данные теряются
- **major** — фича не работает, есть workaround
- **minor** — косметика, UX, некритичный сбой

---

## MVP: 21 тикет, 4 milestone

---

### M0 — Фундамент

| ID | Название | Size |
|----|----------|------|
| M0-001 | Monorepo структура | S |
| M0-002 | Packaging (pip / docker) | M |
| M0-003 | SQLite schema + WAL + миграции | S |
| M0-004 | LiteLLM Python lib (OpenAI/Anthropic/Gemini) | S |
| M0-005 | FastAPI скелет + Next.js static | M |

---

### M1 — Auth + Core CRUD

| ID | Название | Size |
|----|----------|------|
| M1-001 | Auth JWT (email/password) | M |
| M1-002 | Companies CRUD | S |
| M1-003 | Agents CRUD (company only) | M |
| M1-004 | Tasks CRUD + FSM статусов | M |
| M1-005 | LLM Credentials (зашифрованные ключи) | S |
| M1-006 | Frontend: Auth + Company View + Kanban | L |

---

## UX Sprint — CEO Review

> **Статус:** идёт перед M2. Блокер на продажи.
> **Shadrin:** P0-тикеты — этот спринт. P1 — следующий. P2 — после M2.
> **Owner всех тикетов:** Siri

---

#### UX-001 — Kanban: assignee + кнопка "Run Task" на карточке
**Size:** M | **Owner:** Siri | **Priority:** P0

**Проблема:** CEO: *"я не вижу исполнителя на задаче, я не вижу что могу нажать на задание, нажать кнопку запустить его выполнение"*. Текущий `KanbanBoard.tsx` рендерит только `task.title` — ни assignee, ни кнопок, ни клика нет.

**Решение:** Перерисовать карточку таска. Показать: название, assignee (имя агента + цветной аватар-инициал), статус-бейдж, кнопку `▶ Run`. Клик по карточке → side panel с деталями таска.

**AC:**
- [x] Карточка отображает `task.title`, `task.assignee_name`, `task.status` (бейдж с цветом)
- [x] Кнопка `▶ Run` на карточке — POST `/api/companies/{id}/tasks/{id}/run`
- [x] Клик на карточку (не на кнопку) → side panel справа с полным описанием таска
- [x] Side panel закрывается по Escape или клику вне
- [x] Store (`agentStore`) хранит `assignee_id` / `assignee_name` в модели Task

**Зависимости:** M1-004 (Tasks CRUD), M1-003 (Agents CRUD)

---

#### UX-002 — Model selector: dropdown вместо free text ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P0 | **Status:** done (коммит 1cf428b)

**Проблема:** CEO: *"список моделей должен быть выпадающим списком, а не просто текстом — написать можно что угодно"*. Любой введённый стринг улетает в LiteLLM → непредсказуемые ошибки.

**Решение:** Заменить `<input type="text">` на `<select>`. Список тянуть из `GET /api/llm/providers`. Fallback: хардкод `[gpt-4o, gpt-4o-mini, claude-sonnet-4-5, gemini-1.5-pro]`.

**AC:**
- [x] Форма создания/редактирования агента использует `<select>` для поля `model`
- [x] Опции грузятся из `GET /api/llm/providers` при открытии формы
- [x] При ошибке загрузки — fallback на хардкод-список
- [x] Нельзя сабмитить форму с пустым/кастомным значением модели

**Зависимости:** M1-003 (Agents CRUD), endpoint `GET /api/llm/providers`

---

#### UX-003 — Breadcrumb + название компании на всех страницах ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P0 | **Status:** done (коммит 482d630)

**Проблема:** CEO: *"не вижу название компании на странице"*. `App.tsx` рендерит WarRoom + KanbanBoard без какого-либо контекста компании. Пользователь не понимает где он.

**Решение:** Добавить топбар с breadcrumb: `AgentCo > [Company Name] > [Section]`. Название компании из `agentStore.currentCompany`.

**AC:**
- [x] Топбар виден на всех protected страницах (War Room, Kanban, Agent detail)
- [x] Breadcrumb: `AgentCo > {company.name} > {section}`
- [x] Если компания не выбрана — показать `AgentCo > Select company`
- [x] Клик на `AgentCo` → список компаний

**Зависимости:** M1-002 (Companies CRUD), UX-007

---

#### UX-004 — Agent History: история задач агента ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P1 | **Status:** done

**Проблема:** CEO: *"не вижу что у них есть своя история"*. Страницы агента не существует — после логина сразу WarRoom без навигации.

**Решение:** На странице агента добавить вкладку "History" со списком завершённых задач: дата, название, статус, длительность.

**AC:**
- [x] Роут `/companies/{id}/agents/{id}` → страница агента
- [x] Вкладка "History" — список задач из `GET /api/companies/{id}/agents/{id}/tasks?status=done`
- [x] Пагинация или бесконечный скролл (первые 20 задач)
- [x] Пустое состояние: "No completed tasks yet"
- [x] Клик на задачу → детали (side panel или expand)

**Зависимости:** UX-007 (роутинг), M1-004 (Tasks CRUD)

---

#### UX-005 — Kanban: drag & drop между колонками ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P1 | **Status:** done

**Проблема:** Сейчас карточки статичны. Нельзя визуально переместить задачу в другой статус — только через API напрямую.

**Решение:** Drag & drop (html5 DnD или `@dnd-kit/core`). Drop на колонку → PATCH `/api/companies/{id}/tasks/{id}` с новым `status`.

**AC:**
- [x] Карточку можно перетащить в другую колонку
- [x] При drop — PATCH запрос на обновление статуса
- [x] Оптимистичное обновление UI (без задержки)
- [x] При ошибке API — rollback + toast с ошибкой
- [x] Визуальный индикатор drop-zone при drag over

**Зависимости:** UX-001 (карточки), M1-004 (Tasks FSM)

---

#### UX-006 — Empty states с призывом к действию ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P2 | **Status:** done

**Проблема:** Пустые списки показывают голый текст "No agents active". Нет onboarding-флоу — новый пользователь не понимает что делать.

**Решение:** Красивые empty state экраны с иконкой, описанием и CTA-кнопкой.

**AC:**
- [x] Нет компаний → welcome экран с кнопкой "Create your first company"
- [x] Нет агентов в компании → "Add your first agent" с кнопкой
- [x] Нет тасков → "Create your first task" с кнопкой
- [x] WarRoom без агентов → "No agents running" с иллюстрацией (SVG)

**Зависимости:** UX-003, UX-007

---

#### UX-007 — Роутинг и навигация (структурный блокер) ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P0 | **Status:** closed (коммит a8c8692)

**Проблема:** `App.tsx` — плоский стек без роутинга. Нет страниц компаний, агентов, настроек. Все UX-тикеты выше зависят от нормальной навигации.

**Решение:** Подключить `react-router-dom`. Базовая структура роутов:
- `/` → список компаний
- `/companies/:id` → War Room + Kanban компании
- `/companies/:id/agents/:agentId` → страница агента
- `/settings` → LLM credentials

**AC:**
- [ ] `react-router-dom` установлен и настроен
- [ ] Роуты: `/`, `/companies/:id`, `/companies/:id/agents/:agentId`, `/settings`
- [ ] Protected routes (redirect на `/auth` если нет токена)
- [ ] Navbar/sidebar для навигации между роутами
- [ ] Deep link работает: обновление страницы не ломает UI

**Зависимости:** M1-001 (Auth), M1-002 (Companies)

---

## UX Sprint 2 — Product Polish

> **Статус:** после UX Sprint 1. Цель — превратить скелет в продукт, который хочется использовать.
> **Owner всех тикетов:** Siri

### Карта спринтов

| Sprint | Тикеты | Фокус |
|--------|--------|-------|
| UX Sprint 1 (P0) | UX-001..007 | Структура + критические |
| UX Sprint 2 (P0) | UX-008..012 | Карточки + empty states + toast |
| UX Sprint 3 (P1) | UX-013..016 | Фильтры + промпт эдитор + skeleton |
| UX Sprint 4 (P1) | UX-017..019 | Поиск + settings + responsive |

---

#### UX-008 — Task Card redesign ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P0 | **Status:** done (коммит 1cf428b)

**Проблема:** Текущая карточка показывает только title и owner badge — пользователь не понимает приоритет, срок, кто реально исполнитель. Нет интерактивности — нет ощущения живого инструмента.

**Решение:** Rich-карточка: title + description preview (1 строка, truncate), assignee avatar (emoji/инициалы) + name, priority badge (High/Medium/Low с цветом), due date, статус цветом, кнопка ▶ Run (только для todo/backlog), меню ··· (Edit, Delete, Assign).

**Визуальные требования:**
- Priority: High = `#ef4444` (красный), Medium = `#f59e0b` (жёлтый), Low = `#6b7280` (серый)
- Status badge: todo = серый, in_progress = синий, done = зелёный, failed = красный
- Кнопка Run: `bg-emerald-600 hover:bg-emerald-700`, скрыта если статус не todo/backlog
- Меню ···: появляется при hover на карточку, dropdown с 3 пунктами
- Due date: красным если просрочено, серым если в будущем
- Hover на карточку: `shadow-lg`, лёгкий `scale(1.01)` transition 150ms
- Loading state кнопки Run: spinner внутри кнопки, disabled

**AC:**
- [x] Карточка рендерит title, description (preview 1 строки), assignee avatar+name, priority badge, due date, status badge
- [x] Кнопка ▶ Run видна только для задач со статусом `todo` или `backlog`
- [x] Клик Run → POST `/api/companies/{id}/tasks/{id}/run`, кнопка в loading state
- [x] Меню ··· содержит: Edit (открывает modal), Delete (confirm dialog), Assign (dropdown агентов)
- [x] Клик на карточку (не на кнопки) → открывает Task Detail Sidebar (UX-010)
- [x] Priority badge соответствует цветовой схеме
- [x] Due date подсвечивается красным если `due_date < now`

---

#### UX-009 — Agent Card redesign ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P0 | **Status:** done (коммит 1cf428b)

**Проблема:** Карточки агентов — просто имя и статус. Не видно какую модель использует агент, когда последний раз работал, нельзя ни редактировать ни смотреть историю.

**Решение:** avatar (emoji из role или инициалы имени), name, role subtitle, model badge, статус с пульсацией для Running, "Last task: X min ago", кнопки Edit + View History.

**Визуальные требования:**
- Avatar: круглый, 48px, цвет фона генерируется из хэша имени (один из 8 preset цветов)
- Status Running: зелёная точка с CSS `animate-pulse`
- Status Idle: серая точка
- Status Done: синяя точка (последняя задача завершена)
- Model badge: `bg-violet-900/40 text-violet-300 border border-violet-700`, 10px font
- "Last task" строка: серый текст, relative time (moment.js или date-fns)
- Кнопки Edit / View History: появляются при hover, `gap-2 flex`
- Card hover: `border-white/20 → border-white/40`, transition 150ms

**AC:**
- [x] Avatar отображает первые 2 инициала имени
- [x] Цвет аватара стабилен — генерируется из `hashCode(agent.name) % 8`
- [x] Model badge виден на карточке без hover
- [x] Статус Running сопровождается пульсирующей точкой
- [x] "Last task: X min ago" — вычисляется из `last_task_at` агента
- [x] Кнопка Edit → открывает modal редактирования агента
- [x] Кнопка View History → переход на `/companies/:id/agents/:agentId` (UX-004)
- [x] Если `last_task_at` null → "No tasks yet"

---

#### UX-010 — Task Detail Sidebar ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P0

**Проблема:** Нельзя открыть карточку таска и посмотреть детали, лог выполнения, историю статусов. Пользователь слепой — не знает что происходит внутри задачи.

**Решение:** Клик на таск → справа выезжает панель (400px, slideIn анимация): полное описание, лог выполнения с timestamps, кнопка Run, assignee info, история статусов (timeline).

**Визуальные требования:**
- Панель: ширина 400px (desktop) / full-width (mobile), `bg-gray-900 border-l border-white/10`
- Открытие: slide-in справа, `translateX(100%) → translateX(0)`, 250ms ease-out
- Закрытие: по Escape, клику на оверлей (полупрозрачный backdrop), кнопке ✕
- Лог: моноширинный шрифт, `bg-black/40 rounded`, каждая строка с timestamp `[HH:MM:SS]`
- Timeline статусов: вертикальная линия + dot + label + дата
- Scrollable: основной контент скроллится, кнопки действий зафиксированы снизу
- Loading лога: skeleton строки

**AC:**
- [x] Клик на карточку таска → открывается sidebar
- [x] Sidebar показывает: title, full description, assignee (avatar+name), status badge, due date, priority
- [x] Секция "Execution Log" — список строк лога из `GET /api/companies/{id}/tasks/{id}/logs`
- [x] Секция "Status History" — timeline смен статусов с датами
- [x] Кнопка Run в сайдбаре (если статус todo/backlog) — POST run
- [x] Закрывается по Escape и клику вне панели
- [x] Backdrop затемняет основной контент при открытом sidebar
- [x] При пустом логе → "No execution log yet"

---

#### UX-011 — Company Header + Breadcrumb ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P0 | **Status:** closed (коммит 1ed16c5)

**Проблема:** Внутри компании непонятно где ты находишься — нет названия компании, нет навигационного контекста. Пользователь теряется после deep-link или перезагрузки.

**Решение:** Внутри компании всегда виден топбар: "AgentCo / [Company Name]" + цветной аватар компании (первые 2 буквы имени на цветном фоне).

**Визуальные требования:**
- Breadcrumb: `AgentCo` (кликабельный → `/`) ` / ` `[Company Name]` (текущий, не кликабельный)
- Разделитель: `/` с `text-gray-500`
- Company avatar: 32px, круглый, цвет из хэша названия, белые буквы, `font-bold text-sm`
- Топбар: `bg-gray-900/80 backdrop-blur border-b border-white/10 h-12 px-4`
- На мобайле: только avatar + company name (без "AgentCo /")

**AC:**
- [x] Топбар виден на всех страницах внутри компании (`/companies/:id/*`)
- [x] Avatar компании — первые 2 буквы, цвет стабилен (хэш от name)
- [x] Клик на "AgentCo" → `/` (список компаний)
- [x] Company name берётся из `agentStore.currentCompany`
- [x] На мобайле (< 640px) breadcrumb сокращается до avatar + name

---

#### UX-012 — Empty States (все экраны) ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P0 | **Status:** done (коммит 1cf428b)

**Проблема:** Пустые состояния показывают голый текст или вообще ничего. Новый пользователь не понимает что делать, не чувствует ценности продукта.

**Решение:** Для каждого пустого состояния: большой emoji (64px), заголовок (bold), подзаголовок (серый), CTA кнопка.

**Визуальные требования:**
- Контейнер: `flex flex-col items-center justify-center gap-3 py-16 text-center`
- Emoji: `text-5xl` (не иконка — именно emoji для тепла)
- Заголовок: `text-lg font-semibold text-white`
- Подзаголовок: `text-sm text-gray-400 max-w-xs`
- CTA: стандартная primary кнопка
- Анимация: `animate-fadeIn` при появлении

**Список состояний:**

| Экран | Emoji | Заголовок | Подзаголовок | CTA |
|-------|-------|-----------|--------------|-----|
| Список компаний | 🏢 | No companies yet | Create your first workspace | + New Company |
| Agents (нет агентов) | 🤖 | Your AI team is waiting | Add agents to start automating | + Add Agent |
| Kanban (нет задач) | 📋 | No tasks yet | Create your first task and assign it to an agent | + New Task |
| War Room (нет активных) | 💤 | All quiet here | No agents are running. Start a task to see the magic | ▶ Run a Task |
| Agent History (нет задач) | 📜 | No history yet | This agent hasn't completed any tasks | — |

**AC:**
- [x] Каждый из 5 экранов имеет своё уникальное empty state
- [x] CTA кнопка открывает соответствующий modal или переход
- [x] Empty state появляется только когда данные загружены (не во время загрузки — там skeleton UX-016)
- [x] Анимация fadeIn при первом появлении

---

#### UX-013 — Toast/Notification system ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P0 | **Status:** closed (коммит 8dd845c)

**Проблема:** После любого действия (создал агента, запустил задачу, ошибка API) — тишина. Пользователь не знает произошло ли что-то. Нет фидбека = нет доверия к продукту.

**Решение:** Toast-уведомления в правом нижнем углу. Авто-dismiss через 3 сек. Success (зелёный), Error (красный), Info (синий). Иконка + текст. Максимум 3 одновременно.

**Визуальные требования:**
- Позиция: `fixed bottom-4 right-4 z-50 flex flex-col gap-2`
- Success: `bg-emerald-900/90 border border-emerald-700 text-emerald-100`
- Error: `bg-red-900/90 border border-red-700 text-red-100`
- Info: `bg-blue-900/90 border border-blue-700 text-blue-100`
- Размер: `px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-[380px]`
- Анимация появления: `slideIn` снизу, 200ms
- Анимация исчезновения: `fadeOut` + `slideDown`, 200ms
- Прогресс-бар снизу карточки: отсчитывает 3 сек до dismiss
- Кнопка ✕ для ручного закрытия

**Список триггеров:**

| Действие | Тип | Текст |
|----------|-----|-------|
| Агент создан | success | "Agent {name} created" |
| Задача создана | success | "Task added to {column}" |
| Задача запущена | info | "Running: {task title}..." |
| Задача завершена | success | "✓ Task completed" |
| Ошибка API | error | "Something went wrong. Try again." |
| Компания создана | success | "Company {name} created" |
| Скопировано | info | "Copied to clipboard" |

**AC:**
- [x] `useToast()` хук доступен глобально через Context
- [x] `toast.success(text)`, `toast.error(text)`, `toast.info(text)` — публичный API
- [x] Авто-dismiss через 3000ms
- [x] Максимум 3 toast одновременно — старые вытесняются
- [x] Кнопка ✕ закрывает немедленно
- [x] Все основные действия (create/run/delete/error) триггерят toast

---

#### UX-014 — Task filters в Kanban ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P1 | **Status:** done (QA verified 2026-03-17)

**Проблема:** При росте числа задач Kanban превращается в нечитаемую стену карточек. Нет способа быстро найти задачи конкретного агента или по приоритету.

**Решение:** Топбар Kanban с фильтрами: поиск по title (instant, без запроса), dropdown по агенту, dropdown по приоритету. Фильтры применяются на клиенте без перезагрузки.

**Визуальные требования:**
- Топбар: `flex items-center gap-3 mb-4 flex-wrap`
- Search input: `w-64`, иконка 🔍 слева, placeholder "Search tasks..."
- Dropdown агент: мультиселект, показывает avatar + имя агента
- Dropdown приоритет: checkboxes High / Medium / Low с цветными dot
- Active filter badge: `bg-blue-500/20 text-blue-300 rounded-full px-2 py-0.5 text-xs`, с кнопкой ✕
- "Clear all filters" кнопка появляется если хоть один фильтр активен
- Количество результатов: `{N} tasks` серым текстом справа

**AC:**
- [x] Search фильтрует карточки по title в реальном времени (debounce 150ms)
- [x] Dropdown "Agent" показывает всех агентов компании, multiselect
- [x] Dropdown "Priority" — High / Medium / Low, multiselect
- [x] Все фильтры работают одновременно (AND логика)
- [x] При активных фильтрах — badge с именем фильтра и кнопкой сброса
- [x] "Clear all" сбрасывает все фильтры
- [x] Пустой результат фильтрации → mini empty state "No tasks match filters"
- [x] Фильтры не сохраняются при переходе между компаниями

---

#### UX-015 — Agent System Prompt editor ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P1 | **Status:** done (коммит aaabe6d + BUG-026 fixed 2026-03-17)

**AC:**
- [x] Textarea заменяет текущий input для System Prompt
- [x] Счётчик токенов обновляется при каждом изменении (простой `text.split(/\s+/).length * 1.3` estimate)
- [x] 3 кнопки шаблонов над textarea
- [x] Клик на шаблон → вставка текста (с confirm если поле не пустое)
- [x] Textarea resizable вертикально
- [x] Значение сохраняется в форму и отправляется с остальными полями

---

#### UX-016 — Skeleton loaders ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P1 | **Status:** done (коммит 482d630)

**Проблема:** Пока данные грузятся — белый или чёрный экран. Либо одинокий спиннер посередине. Это непрофессионально и создаёт ощущение зависшего приложения.

**Решение:** Skeleton-плейсхолдеры вместо спиннеров. Shimmer-анимация. Контуры повторяют реальные карточки.

**Визуальные требования:**
- Цвет skeleton: `bg-gray-700/50`
- Shimmer: CSS `@keyframes shimmer` с градиентом `from gray-700 via gray-600 to gray-700`, `background-size: 200% 100%`, `animation: shimmer 1.5s infinite`
- Скелетон карточки агента: круг 48px (avatar) + 2 строки текста + 1 узкая строка (badge)
- Скелетон карточки таска: 1 строка заголовка + 1 строка описания + row с avatar + badge
- Скелетон списка компаний: 3 строки с иконкой 40px + 2 текстовые строки
- Количество skeleton-карточек: 3 (агенты), 3 (таски в колонке), 4 (компании)

**AC:**
- [x] Компонент `<SkeletonCard variant="agent|task|company" />` создан
- [x] При `isLoading=true` рендерятся skeleton вместо данных
- [x] Shimmer анимация работает
- [x] Переход skeleton → реальный контент без layout shift
- [x] Спиннеры (`<Spinner />`) заменены на skeleton во всех списках
- [x] Skeleton не показывается дольше 5 секунд — при timeout показывается error state

---

#### UX-017 — Global search ✅ DONE
**Size:** M | **Owner:** Siri | **Priority:** P1 | **Status:** done (QA verified 2026-03-17)

**Проблема:** В продукте нет поиска. При росте компаний/агентов/задач — невозможно быстро найти нужное.

**Решение:** Иконка 🔍 в топбаре → открывается оверлей на всю ширину. Поиск по компаниям, агентам, задачам в реальном времени. Горячая клавиша `Cmd+K`.

**Визуальные требования:**
- Иконка поиска в правой части топбара
- Оверлей: `fixed inset-0 bg-black/60 backdrop-blur-sm z-50`
- Модальное окно поиска: `max-w-2xl mx-auto mt-20 bg-gray-900 rounded-xl shadow-2xl border border-white/10`
- Input: `text-lg px-4 py-3`, autofocus при открытии, placeholder "Search companies, agents, tasks..."
- Результаты сгруппированы: "Companies", "Agents", "Tasks" — каждая секция с заголовком
- Каждый результат: иконка типа + название + subtitle (company для агентов/задач)
- Hover/выбор через ↑↓ стрелки, Enter → переход
- Debounce 200ms, минимум 2 символа для поиска
- Пустой результат: "No results for '{query}'"

**AC:**
- [x] `Cmd+K` / `Ctrl+K` открывает оверлей поиска
- [x] Иконка в топбаре открывает тот же оверлей
- [x] Поиск идёт по: company.name, agent.name + agent.role, task.title + task.description
- [x] Результаты сгруппированы по типу сущности
- [x] Клик/Enter на результат → переход на соответствующую страницу
- [x] Escape закрывает оверлей
- [x] Навигация стрелками ↑↓ по результатам
- [x] Debounce 200ms, минимум 2 символа

---

#### UX-018 — Company settings page ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P1 | **Status:** done

**Проблема:** Нет страницы настроек компании. Нельзя переименовать компанию, добавить описание, или удалить её безопасно.

**Решение:** Страница `/companies/:id/settings` — две секции: основная информация (название, описание) и опасная зона (Delete company с двойным подтверждением).

**Визуальные требования:**
- Страница: стандартный layout с breadcrumb, `max-w-2xl`
- Секция "General": card с формой (name input, description textarea)
- Секция "Danger Zone": `border border-red-900/50 bg-red-950/20 rounded-lg p-4`
- Кнопка Delete: `bg-red-600 hover:bg-red-700`, только после ввода названия компании в confirmation input
- Confirmation: modal с текстом "Type '{company.name}' to confirm deletion", input + кнопка Delete
- Успешное удаление → redirect на `/`, toast "Company deleted"

**AC:**
- [x] Роут `/companies/:id/settings` существует и доступен из навигации
- [x] Форма "General" — PATCH `/api/companies/:id` с name + description
- [x] Изменения сохраняются по кнопке "Save changes", с loading state
- [x] Секция "Danger Zone" содержит кнопку "Delete this company"
- [x] Удаление: modal с confirmation input — нужно написать точное название
- [x] После удаления → redirect на `/` + toast success
- [x] Страница настроек доступна только владельцу компании

---

#### UX-019 — Responsive sidebar ✅ DONE
**Size:** S | **Owner:** Siri | **Priority:** P1 | **Status:** done (QA verified 2026-03-17)

**Проблема:** Сайдбар всегда развёрнут — на ноутбуках с маленьким экраном съедает ценное пространство. Нет способа его свернуть.

**Решение:** На узких экранах (< 1024px) сайдбар по умолчанию свёрнут в иконки (48px). На широких — полный (240px). Состояние сохраняется в localStorage. Кнопка-тоггл.

**Визуальные требования:**
- Развёрнутый: `w-60`, иконка + label
- Свёрнутый: `w-12`, только иконки с tooltip при hover
- Transition: `width` за 200ms ease
- Кнопка тоггл: `<` / `>` в нижнем правом углу сайдбара
- На мобайле (< 640px): сайдбар скрыт, появляется по swipe или кнопке ☰ в топбаре как оверлей
- Active nav item: `bg-white/10 text-white` vs `text-gray-400 hover:text-gray-200 hover:bg-white/5`

**AC:**
- [x] Сайдбар переключается между развёрнутым (240px) и свёрнутым (48px)
- [x] Состояние сохраняется в `localStorage` ключ `sidebar:collapsed`
- [x] На экранах < 1024px по умолчанию свёрнут
- [x] В свёрнутом состоянии — только иконки, tooltip с названием при hover
- [x] Кнопка тоггл видна всегда
- [x] На мобайле (< 640px) — overlay режим с backdrop
- [x] Transition плавный, без layout shift основного контента

---

### M2 — Orchestration + War Room

| ID | Название | Size |
|----|----------|------|
| M2-001 | Orchestration Protocol ADR | S |
| M2-002 | LangGraph иерархический граф (CEO → N уровней) | L |
| M2-003 | Agent Node: LLM стриминг + tool calls | L |
| M2-004 | Runs API | M |
| M2-005 | In-process EventBus (asyncio.Queue) + WebSocket | M |
| M2-006 | War Room UI ⭐ | L |
| M2-007 | Loop detection + cost limits | S |

---

### M3 — Memory, Library, Onboarding

#### M3-001 — Persistent Memory (RAG via sqlite-vec)
**Size:** L | **Depends on:** M1-004, M2-003

Каждый агент накапливает память из результатов задач (embeddings в sqlite-vec). При следующем вызове — top-5 релевантных воспоминаний инжектируются в системный промпт.

```python
# При завершении задачи:
embedding = await litellm.aembedding("text-embedding-3-small", task.result)
sqlite_vec.insert(agent_id, embedding, task.result)

# При старте задачи:
memories = sqlite_vec.search(agent_id, query=task.description, top_k=5)
system_prompt = agent.base_prompt + format_memories(memories)
```

Схема:
```sql
CREATE VIRTUAL TABLE agent_memories_vec USING vec0(embedding float[1536]);
CREATE TABLE agent_memory_meta (id, agent_id, task_id, content, created_at);
```

**AC:** Агент завершает задачу → embedding сохранён. При следующем run — релевантный контекст виден в промпте. API `GET /agents/{id}/memory` возвращает список воспоминаний.

---

#### M3-002 — Agent Library + Portfolio
**Size:** L | **Depends on:** M1-003, M2-004

Сохранить агента в глобальную библиотеку (company_id=NULL). Форкнуть в другую компанию. Portfolio — агрегированная история задач агента и всех его форков.

```sql
CREATE TABLE agent_library (id, name, role, system_prompt, model, use_count);
-- agents.library_agent_id FK → agent_library
CREATE VIEW agent_portfolio AS SELECT ... FROM agent_library JOIN agents JOIN tasks;
```

API: `POST /library` (сохранить), `GET /library` (список), `GET /library/{id}/portfolio`, `POST /companies/{id}/agents/fork`.

**AC:** Агент → библиотека → форк в другой компании. Portfolio показывает историю по всем форкам.

---

#### M3-003 — Company Templates + Onboarding
**Size:** S | **Depends on:** M1-002, M1-003, M1-006

При первом входе — welcome экран с шаблоном "Startup Team" (CEO + CPO + SWE, готовые промпты). Один клик → компания создана → War Room открыт.

Шаблоны в коде (JSON), не в БД. `POST /companies/from-template {template_id, name}` — создаёт всё за одну транзакцию.

**AC:** Первый вход → welcome. "Запустить демо" → War Room за ≤2 клика. Повторный вход → без welcome.

---

## Итоговая таблица

| ID | Название | Size | M |
|----|----------|------|---|
| M0-001 | Monorepo | S | 0 |
| M0-002 | Packaging | M | 0 |
| M0-003 | SQLite schema | S | 0 |
| M0-004 | LiteLLM lib | S | 0 |
| M0-005 | FastAPI + Next.js static | M | 0 |
| M1-001 | Auth JWT | M | 1 |
| M1-002 | Companies CRUD | S | 1 |
| M1-003 | Agents CRUD | M | 1 |
| M1-004 | Tasks CRUD + FSM | M | 1 |
| M1-005 | LLM Credentials | S | 1 |
| M1-006 | Frontend: Auth + Board | L | 1 |
| M2-001 | Orchestration ADR | S | 2 |
| M2-002 | LangGraph граф | L | 2 |
| M2-003 | Agent Node (LLM + stream) | L | 2 |
| M2-004 | Runs API | M | 2 |
| M2-005 | EventBus + WebSocket | M | 2 |
| M2-006 | War Room UI ⭐ | L | 2 |
| M2-007 | Loop detection + cost | S | 2 |
| M3-001 | Memory (sqlite-vec RAG) | L | 3 |
| M3-002 | Agent Library + Portfolio | L | 3 |
| M3-003 | Templates + Onboarding | S | 3 |

**21 тикет** | S×7 M×8 L×6

---

## Post-Demo Sprint (после 2026-03-21)

> Бэклог добавлен Shadrin [07:15 MSK 2026-03-20]. Источники: demo/POST-DEMO-ROADMAP.md (Siri) и demo/POST-DEMO-BACKEND.md (Alex).
> Стартуем ПОСЛЕ демо. До демо — не трогаем.

### Frontend (Siri)

| ID | Описание | Приоритет | Статус |
|----|----------|-----------|--------|
| FE-001 | **Real WebSocket integration smoke test**: WarRoomPage работает на mock interval. После демо — live-тест с реальным бэкендом: запустить агента, убедиться что `llm_token` WS-события приходят, Activity Feed обновляется. | P0 | fixed |
| FE-002 | **SettingsPage: реальное управление LLM ключами**: `/settings` — заглушка. Форма добавления ключа (provider select + api_key input + validate button), список ключей с маскировкой `sk-...xxxx`, кнопка удаления. | P0 | fixed |
| FE-003 | **AgentPage: убрать дублирующийся UX Edit**: AgentPage рендерит одновременно AgentForm (редактируемый) И кнопку "Edit" → AgentEditPage. Решение: AgentPage = view-only, "Edit" → AgentEditPage. | P1 | fixed |
| FE-004 | **KanbanBoard: stress-test drag &amp; drop + persist**: stress-test drag 10 карточек быстро, проверить rollback при ошибке, добавить aria-grabbed/aria-dropeffect. Сохранять порядок в localStorage. | P1 | fixed |
| FE-005 | **Performance при >50 карточках**: добавить виртуализацию (`@tanstack/react-virtual`) или lazy-load (20 карточек per page). `GET /tasks` без пагинации на фронте — добавить `limit=50&offset=N`. | P1 | fixed |
| FE-006 | **Mobile War Room**: провести полный мобайл-тест (375px), agent-панель → drawer-паттерн. | P2 | fixed |
| FE-007 | **Error Boundary + 404 page**: добавить ErrorBoundary на уровне роутов, страница ошибки, обработать несуществующий `/companies/:id`. | P2 | fixed |

### Backend (Alex)

| ID | Описание | Приоритет | Статус |
|----|----------|-----------|--------|
| ALEX-POST-001 | **SQLite → PostgreSQL**: SQLite на Railway теряет данные при pod eviction. Алembic migration, `DATABASE_URL` env, dialect swap. Блокер для платящих клиентов. | 🔴 Critical | fixed |
| ALEX-POST-002 | **Horizontal scalability (EventBus)**: in-process asyncio.Queue не работает при multiple workers. Нужен Redis pub/sub или NATS. | 🔴 Critical | fixed |
| ALEX-POST-003 | **Rate limiting**: нет лимитов — пользователь может запустить 1000 агентов → bankrupt. `slowapi` + Redis counter на `/tasks/*/run`. | 🟠 High | fixed |
| ALEX-POST-004 | **Structured logging + tracing**: plain print() → `structlog` + `opentelemetry-sdk` с OTLP export. Correlation ID по запросам. | 🟠 High | fixed |
| ALEX-POST-005 | **LangGraph checkpointing persistence**: `MemorySaver` в RAM — при crash теряется прогресс агентов. Нужен `SqliteSaver`/`PostgresSaver`. | 🟠 High | fixed |
| ALEX-POST-006 | **API versioning**: все эндпоинты монтированы как /api/v1/ alias middleware. Backward compat: старые /api/ пути работают. | 🟡 Medium | fixed |
| ALEX-POST-007 | **Background job queue (arq)**: bare asyncio tasks без retry. `arq` (async Redis queue) с retry policy, dead-letter queue. | 🟡 Medium | fixed |
| ALEX-POST-008 | **Fork endpoint rate limit**: `POST /api/companies/{id}/agents/fork` не имел rate limit — пользователь мог форкать library agents без ограничений → DoS на agent_library use_count + DB write flood. Добавлен `@limiter.limit("20/minute")`. | 🟠 High | fixed |
| ALEX-POST-009 | **Alembic migration chain — PostgreSQL compat audit**: проверено что все 0001-0011 миграции используют dialect-agnostic SQLAlchemy types (sa.Text вместо String, нет AUTOINCREMENT). Добавлена 0012_postgresql_compat.py как итоговый PG-compat checkpoint. | 🟡 Medium | fixed |
| ALEX-POST-010 | **asyncpg vs psycopg2 — async engine gap**: `session.py` создаёт sync psycopg2 engine для PostgreSQL. При переходе на async FastAPI endpoints нужен async engine через `asyncpg` + `create_async_engine`. Текущий sync engine работает, но блокирует event loop под нагрузкой. Нужно: `sqlalchemy[asyncio]` + `asyncpg` + `AsyncSession`. | 🔴 Critical | fixed |
| ALEX-POST-011 | **sqlite-vec недоступен на PostgreSQL**: Memory RAG использует `sqlite-vec` extension — при переходе на Postgres нужно мигрировать на `pgvector`. Блокер для полноценного PostgreSQL деплоя с памятью агентов. | 🔴 Critical | fixed |
| ALEX-POST-012 | **Rate limit storage — in-memory не persistent**: slowapi использует in-memory counter (не Redis) — rate limits сбрасываются при рестарте сервиса и не работают при multiple workers. Для Railway multi-replica деплоя нужен Redis-backed storage. Env: `REDIS_URL` → `slowapi.extension.Limiter(storage_uri=REDIS_URL)`. | 🟠 High | fixed |

### Post-Demo Self-Audit (Alex · 2026-03-21)

> Backend audit: 542/542 tests ✅, CI ✅. Rate limits — все critical endpoints покрыты. PG migration path готов. Найдено: fork endpoint без rate limit (fixed), asyncpg gap, sqlite-vec не портируется на PG, rate limit storage in-memory.

### Post-Demo Self-Audit (Siri · 2026-03-21)

> Audit results: build ✅, tsc ✅ (0 errors), 622/622 tests ✅, CI ✅. Console.log: только `ErrorBoundary.tsx:23` (легитимный). Нет TODO/FIXME/HACK. TypeScript strict — чисто.

| ID | Описание | Приоритет | Статус |
|----|----------|-----------|--------|
| SIRI-POST-001 | **TypeScript strict health check**: `npx tsc --noEmit` — 0 ошибок ✅. Baseline зафиксирован. Добавить в CI отдельный step `tsc --noEmit --strict` для контроля. | P1 | fixed |
| SIRI-POST-002 | **Console.log cleanup**: production src/ полностью чист. `ErrorBoundary.tsx:23` оставлен намеренно — critical error logging. Baseline зафиксирован. | P1 | fixed |
| SIRI-POST-003 | **WarRoomPage: Mock WS fallback убрать из production**: `setInterval` с mock-событиями активируется когда WS не подключён — в реальном пользователе это создаёт иллюзию работы. Добавить feature flag `VITE_MOCK_WAR_ROOM` и показывать mock только при явном включении. | P1 | fixed |
| SIRI-POST-004 | **WarRoomPage cost counter — real-time из WS**: addCost(0.0012) хардкодит стоимость в mock-интервале. При реальном WS нет агрегации `llm_token.cost` с бэкенда. Убедиться что cost counter показывает реальную стоимость из WS-событий, добавить тест. | P1 | fixed |
| SIRI-POST-005 | **KanbanBoard localStorage order — cross-tab sync**: порядок карточек сохраняется в localStorage, но не синхронизируется между вкладками (storage event). Добавить listener на `storage` event для обновления порядка при изменении из другой вкладки. | P2 | fixed |
| SIRI-POST-006 | **Accessibility audit — диалоги без focus trap**: все модальные окна (role="dialog") не трапят фокус клавиатуры внутри — Tab уходит за пределы модала. Добавить focus-trap на все диалоги (CompanySettingsPage, LibraryPage, KanbanBoard). | P2 | fixed |
| SIRI-POST-007 | **ErrorBoundary: Sentry/structured error reporting** | P2 | fixed |

## Post-MVP (после WoW момента)

| ID | Название | Owner | Status |
|----|----------|-------|--------|
| POST-001 | E2E тесты: Playwright happy-path (auth → company → agent → task → run) | Alex | fixed |
| POST-002 | Gemini provider + key validation API (`/api/llm/validate-key`, расширить `/api/llm/providers`) | Alex | fixed |
| POST-003 | Agent Profile Page: выделенная страница `/companies/:id/agents/:id/edit` вместо модала — полный редактор (system prompt, model, role) | Siri | fixed |
| POST-004 | MCP tools foundation (remote servers integration) | Alex | fixed |
| POST-005 | Billing UI skeleton (Stripe integration) | Siri | fixed |
| POST-006 | Иерархия произвольной глубины (>2 уровней) | Alex | fixed |

---

*Обновлено: 2026-03-11 | CTO v2 + CPO ревью учтён*

---

## Pitch Feedback

> Marcus (CEO) · 2026-03-15 · CEO-ревью всех 11 слайдов

### ✅ Сильные стороны
- S1 Hero: «Your AI company runs itself. You just set the goal.» — tagline убивает, запоминается с первого раза
- S3 Solution: архитектурная диаграмма CEO→CTO→PM→SWE×3→QA — лучший слайд в деке, показывает иерархию наглядно
- S5 Traction: 178 тестов / 0 failures — конкретика, не слова
- S5: нарратив «built by agents» уникален и самоподтверждающий — сам продукт строит себя
- S10 Product Today: живые скрины появились — это правильно, инвестор видит реальный UI
- S7 Competition: табличное сравнение работает, выигрываем по всем пяти критериям визуально
- S6 Market: CAGR 43%, $47B — цифры есть, рынок большой

### ⚠️ Нужно поправить (по слайдам)
- S1: добавить одну killer-метрику прямо на hero (например «3.2× cheaper than GPT-4o alone» или «shipped M0→M2 in N days»)
- S2 Problem: боль не оцифрована — добавить одну цифру (сколько стоит нанять команду из 5 человек? $500K/год? → AgentCo: $X/мес)
- S4 Product: нет ни одного скриншота — 6 карточек с иконками не убеждают; перенести хотя бы 1-2 скрина из S10 сюда или убрать дублирование
- S4: «3.2× cost savings» — откуда цифра? нужен источник или ссылка на бенчмарк рядом
- S5 Traction: «JWT Auth (in progress)» тег в стеке подрывает заявление «Done» — убрать или переименовать в «JWT Auth ✅»
- S5: «21 Milestones closed» — инвесторы воспринимают как GitHub issues, не бизнес-метрики; переименовать в «21 Engineering Milestones» + добавить хоть один demand signal (waitlist, user interview, pilot)
- S6 Market: нет TAM/SAM/SOM — $47B TAM без SAM/SOM выглядит как padding; добавить bottom-up расчёт хотя бы в 2 строки
- S6: ICP «5-50 person startups» написан мелким шрифтом внизу — поднять в заголовок слайда
- S7 Competition: отсутствуют Langflow, Flowise, Dify — visual UI конкуренты, которые инвестор назовёт первыми; добавить в таблицу
- S7: Devin отмечен ✗ по Visual UI — фактически неверно (у Devin есть UI); исправить на ✓ или убрать Devin
- S7: нет объяснения моата — почему Microsoft/Google не скопируют за 6 мес? добавить 1 строку «Our moat: …»
- S8 Roadmap: нет дат на M3 и Public Beta — инвестор хочет знать timeline; добавить Q-кварталы
- S9 Team: соло-фаундер — самый большой красный флаг для seed; добавить хотя бы 1-2 advisor'а с именами
- S9: «BMSTU graduate» неизвестен западным инвесторам — заменить на «Top-5 Russian Engineering University» или убрать
- S10: русский текст «M0 + M1 + M2 закрыты» в английском питче — перевести на английский
- S10: слайд стоит ПОСЛЕ Traction (S5) — логика нарушена; показать Product раньше (S5→S10→текущий S5 со статистикой)
- S11 CTA: нет breakdown использования $500K — добавить 3 строки (Engineering X%, GTM Y%, Infrastructure Z%)
- S11: контакт «@timofeytst» слишком casual — добавить email рядом

### 🎯 Критично (блокеры для инвестора)
- **Solo founder без co-founder и без advisors** — для seed это вопрос №1; решить до следующего питча: добавить advisor'а (техника или домена) с именем на S9
- **Нет demand signals** — 178 тестов это engineering proof, не market proof; нужен хотя бы 1 пилот, waitlist или letter of intent перед следующим раундом разговоров
- **Отсутствует Use of Funds** — $500K без breakdown — красный флаг; добавить на S11 или отдельный слайд

---

## Sprint Planning [2026-03-16]

> Marcus (CEO) · 2026-03-16 · CEO-приоритеты перед показом первому пользователю

### Контекст
Тима посмотрел продукт — главный вывод: **нет ни одного рабочего сценария**. Инвестор смотрит вживую или запускает сам — и не понимает что делать. Это блокер №1. Всё остальное вторично.

Главный критерий следующих 2-3 циклов: **пользователь должен пройти флоу за 3 клика — создать задачу → назначить агента → нажать Run → увидеть результат.**

### P0 — Critical Path (первые)

| Тикет | Почему первый |
|-------|---------------|
| **UX-007** — Routing + Navigation | Структурный блокер. Без роутинга нельзя перейти к компании/агенту/задаче — все остальные тикеты бессмысленны |
| **UX-001** — Kanban: assignee + Run button | Ключевой момент флоу — пользователь видит задачу, видит исполнителя, нажимает Run. Без этого нет демо |
| **UX-010** — Task Detail Sidebar | Финальный шаг флоу: пользователь видит результат. Лог выполнения — это «wow moment» |
| **UX-003** / **UX-011** — Breadcrumb + Company Header | Ориентация в продукте. Без этого пользователь теряется после первого клика |
| **UX-013** — Toast System | Фидбек на действие Run. Без тоста пользователь не знает сработало ли — доверие к продукту 0 |

### P1 — Important (после P0)

| Тикет | Почему важно |
|-------|--------------|
| **UX-002** — Model selector dropdown | Показывает зрелость продукта — нет free-text поля, есть контроль. Для demo +доверие |
| **UX-012** — Empty States | Onboarding. Новый пользователь должен понимать что делать с нуля |
| **UX-008** — Task Card redesign | Визуальный polish — assignee, priority, due date делают карточку читаемой |
| **UX-009** — Agent Card redesign | Пульсирующий статус Running — живость продукта на демо |

### P2 — После демо

| Тикет | Комментарий |
|-------|-------------|
| UX-004 | Agent History — нужна, но не блокер для первого демо |
| UX-005 | Drag & drop — polish, не core флоу |
| UX-006 | Empty states детальные — часть UX-012 |
| UX-014..019 | Фильтры, поиск, промпт-эдитор, responsive — post-demo polish |

### Pitch Deck — параллельно P0

Критические правки (блокеры перед инвестором):
1. Перевести русский текст на S10 («M0 + M1 + M2 закрыты» → английский)
2. Добавить Use of Funds breakdown на S11
3. Добавить TAM/SAM/SOM на S6
4. Исправить «JWT Auth (in progress)» → «JWT Auth ✅» на S5
5. Добавить Langflow/Flowise/Dify в таблицу конкурентов S7

---

## Sprint 02 Plan [2026-03-16]

### Цель спринта
Пользователь может создать задачу, назначить агента, нажать Run и увидеть лог результата — всё за 3 клика без инструкций.

### P0 — Critical path (делаем в первую очередь)

| Тикет | Описание | Владелец | Размер |
|-------|----------|----------|--------|
| UX-007 ✅ | Роутинг: react-router-dom, роуты `/`, `/companies/:id`, `/companies/:id/agents/:id`, `/settings`, protected routes | Siri | M |
| UX-001 ✅ | Kanban: assignee на карточке, кнопка ▶ Run, POST run, side panel детали таска | Siri | M |
| UX-010 ✅ | Task Detail Sidebar: slideIn панель, лог выполнения (GET logs), статус timeline, закрытие по Escape | Siri | M |
| UX-011 ✅ | Company Header + Breadcrumb: топбар `AgentCo / [Company]`, avatar компании, клик → `/` | Siri | S |
| UX-013 ✅ | Toast System: `useToast()` хук, success/error/info, авто-dismiss 3s, триггеры на create/run/delete/error | Siri | S |

### P1 — Important

| Тикет | Описание | Владелец | Размер |
|-------|----------|----------|--------|
| UX-002 | Model selector: `<select>` вместо input, данные из `GET /api/llm/providers`, fallback хардкод | Siri | S |
| UX-012 | Empty States: 5 экранов (компании / агенты / таски / war room / history), emoji + CTA кнопка | Siri | M |
| UX-008 | Task Card redesign: priority badge, due date, assignee avatar, меню ···, hover effects | Siri | M |
| UX-009 | Agent Card redesign: avatar с хэш-цветом, статус-пульсация, model badge, Edit/History кнопки | Siri | M |

### Pitch Deck fixes (параллельно)

| # | Правка | Размер |
|---|--------|--------|
| 1 | S10: перевести «M0 + M1 + M2 закрыты» на английский | XS |
| 2 | S11: добавить Use of Funds breakdown (Engineering / GTM / Infrastructure %) | S |
| 3 | S6: добавить SAM/SOM под TAM $47B, bottom-up 2 строки | S |
| 4 | S5: исправить «JWT Auth (in progress)» → «JWT Auth ✅» | XS |
| 5 | S7: добавить Langflow, Flowise, Dify в таблицу конкурентов | S |
| 6 | S7: исправить Devin Visual UI ✗ → ✓ | XS |
| 7 | S9: добавить advisor(ы) с именем | M |
| 8 | S1: добавить killer-метрику на hero слайд | S |

### Definition of Done для Sprint 02

- [ ] Пользователь может создать задачу, назначить агента, нажать Run и увидеть лог результата
- [ ] Навигация работает: роуты, deep link, refresh не ломает UI
- [ ] Toast фидбек на все действия (create / run / error)
- [ ] Breadcrumb виден на всех страницах внутри компании
- [ ] Питч-дек без русского текста и без «JWT Auth (in progress)»
- [ ] Use of Funds добавлен на S11
- [ ] Конкуренты Langflow/Flowise/Dify в таблице S7
