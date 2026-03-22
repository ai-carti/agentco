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
| BUG-NNN | critical/major/minor | Краткое описание + файл/строка | Кто фиксит | open/fixed |
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
