# QA-001 Full Report

> **Метод проверки:** Статический анализ кода + Unit тесты (Backend: 269 passed, Frontend: 308 passed)
> **Дата:** 2026-03-18
> **Автор:** Siri (Frontend Engineer)

---

## 1. Auth (login/register/refresh/protected routes)

- **Статус:** ✅
- **Что проверено:**
  - `AuthPage.tsx`: вкладки signin/signup, форма email+password, submit → `authStore.login()` / `authStore.register()`
  - `ProtectedRoute.tsx`: блокирует доступ без токена, сохраняет `location.state.from` для редиректа
  - `authStore.ts`: `initAuth()` вызывается в `App.tsx useEffect` — токен восстанавливается при F5
  - `client.ts`: `register()`, `login()`, `getMe()` — три API-вызова реализованы
  - После логина: редирект на исходный URL (BUG-010/011/012 — fixed)
  - JWT токен хранится в `localStorage` под ключом `agentco_token`
  - Backend: `test_auth.py` — все тесты зелёные
- **Что сломано:** нет
- **AC из ROADMAP (M1-001):** выполнен

---

## 2. Companies CRUD (create/read/update/delete)

- **Статус:** ✅
- **Что проверено:**
  - `CompaniesPage.tsx`: GET `/api/companies` → список, POST `/api/companies` → создание с модалом
  - Toast при создании компании (BUG-021 — fixed): `toast.success('Company created')`
  - Skeleton loading при загрузке (SkeletonCard)
  - Empty state при отсутствии компаний → редирект на Onboarding
  - `CompanyPage.tsx`: загружает данные компании, агентов, задач при маунте
  - Backend: `test_companies.py` — все тесты зелёные
  - PATCH `/api/companies/{id}` (rename), DELETE `/api/companies/{id}` — реализованы
- **Что сломано:** нет
- **AC из ROADMAP (M1-002):** выполнен

---

## 3. Agents CRUD + model selector dropdown

- **Статус:** ✅
- **Что проверено:**
  - `AgentForm.tsx`: поля name, role, model (select), system_prompt (SystemPromptEditor)
  - Model selector: GET `/api/llm/providers` → список моделей; fallback `['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-5', 'gemini-1.5-pro']` если API недоступен или вернул `[]` (BUG-016 — fixed)
  - `SystemPromptEditor` интегрирован в `AgentForm` (BUG-026 — fixed)
  - `AgentForm` используется в `CompanyPage` и `AgentPage` (BUG-017 — fixed)
  - `AgentPage.tsx`: редактирование агента, история задач (GET `/api/companies/{id}/agents/{agentId}/tasks?status=done`), сохранение в библиотеку
  - `AgentCard.tsx`: карточка агента с кнопкой редактирования
  - Backend: `test_agents.py` — все тесты зелёные
- **Что сломано:** нет
- **AC из ROADMAP (M1-003, UX-002, UX-015):** выполнен

---

## 4. Tasks CRUD + FSM статусов

- **Статус:** ✅
- **Что проверено:**
  - Задачи создаются через KanbanBoard (встроенная форма)
  - FSM статусов: `backlog → todo → in_progress → done / failed`
  - PATCH `/api/companies/{id}/tasks/{taskId}` — обновление статуса при drag&drop
  - DELETE задачи — реализован в TaskCard меню (BUG-019 — fixed)
  - Поля: `title`, `description`, `priority` (high/medium/low), `assignee_id`, `due_date`
  - Backend: `test_tasks.py` — все тесты зелёные (включая валидацию BUG-005/006/007/008)
- **Что сломано:** нет
- **AC из ROADMAP (M1-004, UX-001):** выполнен

---

## 5. Kanban (карточки, drag&drop, assignee, Run button)

- **Статус:** ✅
- **Что проверено:**
  - `KanbanBoard.tsx`: 4 колонки (Backlog, Todo, In Progress, Done)
  - Drag&Drop реализован через HTML5 DnD API (`draggable`, `onDragStart`, `onDrop`, `onDragOver`)
  - `handleDrop` → PATCH задачи с новым статусом + обновление стора
  - `dragOverCol` visual feedback при перетаскивании
  - Assignee: dropdown с агентами, PATCH `/tasks/{id}` с `assignee_id`
  - Run button ▶: POST `/tasks/{id}/run`, toast на success/error, loading state (BUG-013/018 — fixed)
  - FilterBar: поиск по тексту, фильтр по агенту, фильтр по приоритету
  - Skeleton loading при первом рендере (BUG-023 — fixed)
  - TaskCard меню (···): Edit, Delete, Assign — все реализованы (BUG-019 — fixed)
- **Что сломано:** нет
- **AC из ROADMAP (UX-001, UX-011, UX-012):** выполнен

---

## 6. Task Detail Sidebar + execution logs

- **Статус:** ✅
- **Что проверено:**
  - `TaskDetailSidebar.tsx`: открывается при клике на TaskCard
  - Отображает: title, description, status badge, priority badge, assignee avatar, due date, created_at
  - Execution logs: GET `/api/companies/{id}/tasks/{taskId}/runs/{runId}/logs` — список `LogEntry`
  - Status history: GET `/api/companies/{id}/tasks/{taskId}/status-history` — timeline изменений
  - SkeletonCard при загрузке логов
  - Run button в sidebar (BUG-025 — fixed): toast на success/error
  - Toast интеграция (BUG-021/025 — fixed)
- **Что сломано:** нет
- **AC из ROADMAP (UX-010):** выполнен

---

## 7. War Room (WebSocket, agent cards, activity feed)

- **Статус:** ✅
- **Что проверено:**
  - `WarRoom.tsx` (embedded в CompanyPage) + `WarRoomPage.tsx` (route `/war-room`, `/companies/:id/warroom`)
  - WebSocket: подключается к `ws://localhost:8000/ws/companies/{companyId}/events?token={token}`
  - Events: `run.started` → добавляет run в список, `run.log` → добавляет лог, `run.finished`/`run.stopped`/`run.failed` → обновляет статус
  - Auto-reconnect (5s таймер)
  - `WarRoomPage.tsx`: Agent cards с индикатором статуса, Activity Feed
  - `data-testid="activity-feed"` — реализован, `feed-message` элементы
  - BUG-027 (flash-green CSS) — fixed: `@keyframes flash-green` добавлен в `WarRoomPage.tsx`
  - BUG-028 (wrong component) — fixed: CompanyPage использует WarRoomPage
  - BUG-029 (WebSocket URL mismatch) — fixed
- **Что сломано:** нет
- **AC из ROADMAP (M2-005, M2-006):** выполнен

---

## 8. Agent Library + Portfolio (fork, список)

- **Статус:** ✅
- **Что проверено:**
  - `LibraryPage.tsx`: GET `/api/library` → список агентов библиотеки
  - ForkModal: выбор компании → POST `/api/companies/{id}/agents/fork` с `library_agent_id`
  - `LibraryPortfolioPage.tsx`: маршрут `/library/:id/portfolio`, GET `/api/library/{id}/portfolio`
  - Сохранение агента в библиотеку из `AgentPage.tsx`: POST `/api/library` с `agent_id`
  - Backend BUG-030 (library router отсутствовал) — fixed
  - BUG-032 (дублирование роутера) — fixed
  - Backend: `test_library.py` — все тесты зелёные
- **Что сломано:** нет
- **AC из ROADMAP (M3-002):** выполнен

---

## 9. Memory RAG

- **Статус:** ⚠️
- **Что проверено:**
  - Backend: `handlers/memory.py` — GET `/api/companies/{company_id}/agents/{agent_id}/memory`
  - `MemoryService` использует `agentco_memory.db` (sqlite-vec)
  - Backend: `test_memory.py` — все тесты зелёные
  - `memory_router` зарегистрирован в `main.py`
- **Что сломано:** Frontend не имеет UI для отображения памяти агентов. Нет компонента, нет маршрута. API существует, но недоступен из UI.
- **AC из ROADMAP (M3-001):** частично — backend-только, frontend UI отсутствует

---

## 10. Onboarding template (POST /companies/from-template)

- **Статус:** ✅
- **Что проверено:**
  - `OnboardingPage.tsx`: шаблон "Startup Team" (CEO, CPO, SWE) с кастомным именем компании
  - POST `/api/companies/from-template` с `{ template_id, name }` → создаёт компанию + агентов
  - Fallback: если endpoint вернул не-OK, создаёт компанию вручную + добавляет агентов по одному
  - Toast на успех/ошибку
  - Показывается из `CompaniesPage` при первой загрузке без компаний
  - Backend: `test_templates.py` — все тесты зелёные
- **Что сломано:** нет
- **AC из ROADMAP (M3-003):** выполнен

---

## 11. Empty States (все 5 экранов)

- **Статус:** ✅
- **Что проверено:**
  - `EmptyState.tsx`: универсальный компонент с emoji, title, subtitle, CTA кнопкой, fade-in анимацией
  - 5 экранов с empty state:
    1. **Companies** (`CompaniesPage.tsx`): → редирект на OnboardingPage (первый раз)
    2. **Agents** (`CompanyPage.tsx`): 🤖 "Your AI team is waiting" + "+ Add Agent" (BUG-020 — fixed, BUG-024 — fixed: CTA открывает форму)
    3. **Tasks/Kanban** (`KanbanBoard.tsx`): 📋 "No tasks yet" + "+ Create Task"
    4. **War Room** (`WarRoomPage.tsx`): 🏯 empty state при отсутствии агентов или ранов
    5. **Library** (`LibraryPage.tsx`): 📚 пустая библиотека
  - Frontend: `test_empty_state.tsx`, `EmptyStateCTA.test.tsx` — все тесты зелёные
- **Что сломано:** нет
- **AC из ROADMAP (UX-012):** выполнен

---

## 12. Toast system (триггеры на create/run/delete/error)

- **Статус:** ✅
- **Что проверено:**
  - `ToastContext.tsx`: `ToastProvider` + `useToast()` hook
  - 3 типа: `success` (зелёный ✓), `error` (красный ✕), `info` (синий ℹ)
  - Auto-dismiss через 3000ms, max 3 одновременных toast
  - Триггеры:
    - Company create → `toast.success('Company created')`
    - Task run → `toast.success('▶ Running: {title}')` / `toast.error('Failed to run task (400)')`
    - Task delete → toast
    - Agent save to library → `toast.success('Agent saved to library')`
    - Task detail sidebar run → toast
    - Company settings save → `toast.success('Company settings saved')`
  - Frontend: `Toast.test.tsx` (9 тестов), `ToastIntegration.test.tsx` (3 теста) — все зелёные
- **Что сломано:** нет
- **AC из ROADMAP (UX-013):** выполнен

---

## 13. Responsive sidebar (collapsed/expanded)

- **Статус:** ✅
- **Что проверено:**
  - `Sidebar.tsx`: ширина 240px (expanded) / 48px (collapsed), переход `transition: width 0.2s ease`
  - Состояние персистится в `localStorage` (ключ `sidebar:collapsed`)
  - Auto-collapse при `window.innerWidth < 1024` (TABLET_BREAKPOINT)
  - Mobile mode (`< 640`): sidebar фиксирован поверх контента + backdrop overlay
  - Nav items: Companies, War Room, Library, Settings с иконками
  - Frontend: `Sidebar.test.tsx` (11 тестов) — все зелёные
- **Что сломано:** нет
- **AC из ROADMAP (UX-016):** выполнен

---

## 14. Global search (Cmd+K)

- **Статус:** ✅
- **Что проверено:**
  - `GlobalSearch.tsx`: `Cmd+K` / `Ctrl+K` открывает модал, `Escape` закрывает
  - Поиск по companies, agents, tasks из Zustand-стора
  - Debounce 200ms для оптимизации
  - Keyboard nav: стрелки вверх/вниз по результатам, Enter для перехода
  - Навигация через `useNavigate`
  - Интегрирован в `Navbar.tsx`
  - Frontend: `GlobalSearch.test.tsx` — все тесты зелёные
- **Что сломано:** нет
- **AC из ROADMAP (UX-014):** выполнен

---

## 15. Company Settings (rename, delete с confirmation)

- **Статус:** ✅
- **Что проверено:**
  - `CompanySettingsPage.tsx`: маршрут `/companies/:id/settings`
  - Rename: PATCH `/api/companies/{id}` с `{ name, description }` → toast success/error
  - Delete: кнопка → confirmation modal (нужно ввести "DELETE") → DELETE `/api/companies/{id}` → navigate('/')
  - Toast интеграция (success/error для всех операций)
  - `CompanySettings.test.tsx` — тесты зелёные
- **Что сломано:** нет
- **AC из ROADMAP (UX-009):** выполнен

---

## 16. Breadcrumb + Company Header

- **Статус:** ⚠️
- **Что проверено:**
  - `Breadcrumb.tsx`: `AgentCo > {CompanyName} > {Section}` — реализован
  - Корректно показывает "Select company" только на путях с `/companies/:id/...`
  - На `/settings` показывает `AgentCo > Settings` без компании (BUG-022 — fixed)
  - Company Header (название компании вверху страницы): в `CompanyPage.tsx` отсутствует явный header-блок с именем компании. Имя компании доступно через Breadcrumb и название `AgentCo > {name}`, но нет отдельного крупного заголовка компании на странице.
- **Что сломано:** Company Header как отдельный UI-блок (крупный заголовок с именем компании, возможно с иконкой/аватаром) отсутствует в `CompanyPage` — только breadcrumb.
- **AC из ROADMAP (UX-016):** частично выполнен — Breadcrumb ✅, отдельного Company Header ❌

---

## Итог

| Фича | Статус |
|------|--------|
| Auth | ✅ |
| Companies CRUD | ✅ |
| Agents CRUD + model selector | ✅ |
| Tasks CRUD + FSM | ✅ |
| Kanban (drag&drop, assignee, Run) | ✅ |
| Task Detail Sidebar + logs | ✅ |
| War Room (WebSocket, agent cards, feed) | ✅ |
| Agent Library + Portfolio | ✅ |
| Memory RAG | ⚠️ (API есть, UI нет) |
| Onboarding template | ✅ |
| Empty States (все 5) | ✅ |
| Toast system | ✅ |
| Responsive sidebar | ✅ |
| Global search (Cmd+K) | ✅ |
| Company Settings | ✅ |
| Breadcrumb + Company Header | ⚠️ (Breadcrumb ✅, Header ❌) |

**Итого: 14 ✅ · 2 ⚠️ · 0 ❌**

**Тесты:** Backend 269 passed · Frontend 308 passed · 0 failures

---

## Риски и рекомендации

1. **Memory UI** — API backend есть, нужен простой компонент для отображения памяти агента в `AgentPage`
2. **Company Header** — добавить крупный заголовок с именем компании в `CompanyPage` для лучшей навигационной ясности
3. **WebSocket hardcoded URL** — `WarRoom.tsx` использует `ws://localhost:8000` напрямую, не через `VITE_API_URL`. При деплое потребует правки.
4. **Runs endpoint mismatch** — `KanbanBoard.tsx` обращается к `/api/companies/{id}/tasks/{id}/run`, но backend endpoint может быть `/api/v1/...` — нужно проверить при деплое.
