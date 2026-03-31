# AgentCo — ROADMAP

> Стек: Python (FastAPI) + SQLite + LangGraph + LiteLLM + React/Vite
> Архив закрытых тикетов: `archive/ROADMAP-FULL-2026-03-28.md`

---

## Статус проекта

**Готовность: ~99%** | 800+ тикетов закрыто | 21/21 milestones done | CI ✅ | Deployed on Railway

| Блок | Статус |
|------|--------|
| M0 Фундамент (5 тикетов) | ✅ done |
| M1 Auth + CRUD (6 тикетов) | ✅ done |
| M2 Orchestration + War Room (7 тикетов) | ✅ done |
| M3 Memory, Library, Onboarding (3 тикета) | ✅ done |
| UX Sprint 1 (19 тикетов) | ✅ done |
| UX Sprint 2 (430+ тикетов) | ✅ done |
| Post-Demo Sprint (19 тикетов) | ✅ done |
| Post-MVP (6 тикетов) | ✅ done |
| Bugs (80+ тикетов) | 5 open, остальные fixed |

---

## Open Bugs 🐛

> Shadrin: **всегда проверяй этот раздел первым**. Незакрытые баги — блокер для всего остального.
> Alisa: когда находишь баг — добавляй сюда. Не просто в changelog.

| ID | Severity | Описание | Владелец | Статус |
|----|----------|----------|----------|--------|
| BUG-076 | critical | **Mock LLM в production**: `AGENTCO_USE_REAL_LLM=true` не установлен в Railway env → агент выполняет задачи через mock LLM, `total_tokens=0`, War Room Activity Feed пуст. Фикс: установить `AGENTCO_USE_REAL_LLM=true` в Railway Variables + добавить LLM API key. **Требует action от @timofeytst** в Railway dashboard. | Alisa | open |
| BUG-075 | critical | **E2E prod флоу (conditional)**: шаги 1–6 работают ✅. Без real LLM — mock ответ. Заблокировано BUG-076. | Alisa | open |
| BUG-077 | low | **tsc --noEmit fail**: `SIRI-UX-464-468-SelfAudit.test.tsx` — unused `afterEach` import (TS6133). Fix: убрать `afterEach` из import на строке 8. | Siri | fixed (SIRI-UX-469) |
| BUG-NEW-001 | medium | **Backend pytest isolation — 19 тестов падают при полном suite**: shared state / mock pollution. Затронуты: `test_alex_td_088_091.py`, `test_alex_td_267_271.py`, `test_bug_068_069.py` и ещё 7 файлов. Нужен аудит setup/teardown. | Alisa | fixed |
| BUG-084 | minor | **KanbanBoard canRun не включает 'error'**: TaskDetailSidebar.tsx:158 позволяет retry для error задач (SIRI-UX-427), но KanbanBoard.tsx:111 — нет. Кнопка Run не видна на карточке в error колонке. Fix: добавить `|| task.status === 'error'` в KanbanBoard canRun. | Siri | fixed |
| BUG-085 | major | **KanbanBoard.tsx дублирует className на 2 элементах** (строки 572, 1253): JSX элементы имеют два `className` атрибута → `tsc --noEmit` падает с TS17001, `npm run build` сломан. Fix: объединить className в один атрибут. | Siri | fixed |

---

## Open Tasks

| ID | Severity | Описание | Владелец | Статус |
|----|----------|----------|----------|--------|
| ALEX-TD-288 | minor | **`orchestration/agent_node.py` — `tools=[]` передаётся в LiteLLM**: пустой `[]` вызывает `400 Bad Request` у Anthropic/Gemini. Fix: guard `if tools:`. | Alex | done (was already guarded) |
| ALEX-TD-289 | minor | **`memory/service.py` — `_EMBEDDING_MODEL` и `_DEFAULT_DB` при импорте без cache_clear**: тесты с monkeypatch.setenv не влияют. Fix: `@functools.lru_cache`. | Alex | done |
| ALEX-TD-290 | minor | **README.md пустой или слишком короткий**: `backend/README.md` — должен содержать Quick Start, API, Environment секции. Fix: написать реальную документацию. | Alex | done |
| ALEX-TD-291 | minor | **`_COST_PER_1K_TOKENS` не покрывает новые имена моделей**: `claude-sonnet-4-5`, `claude-opus-4-20250514` → падают в `"default"` rate. Fix: добавить `"claude-sonnet"` и `"claude-opus"` префиксы. | Alex | done |
| ALEX-TD-292 | minor | **`PROVIDER_MODELS` устарел**: не содержит `claude-sonnet-4-5`, `claude-opus-4-20250514`, `claude-sonnet-4-20250514`. Fix: обновить список. | Alex | done |
| ALEX-TD-293 | minor | **`_COST_PER_1K_TOKENS` prefix ordering не задокументирован**: `gpt-4o-mini` должен идти перед `gpt-4o`, иначе `gpt-4o-mini` матчится на `gpt-4o` rate. Fix: порядок + тест. | Alex | done |
| ALEX-TD-294 | minor | **`GET /api/library` нет `sort_by` параметра**: нет способа получить агентов отсортированных по `use_count DESC`. `use_count` индекс добавлен в ALEX-TD-266 "for future ORDER BY" но endpoint не реализован. Fix: `?sort_by=use_count\|created_at`, валидация allowlist. | Alex | done |
| ALEX-TD-295 | minor | **`LibraryAgentOut` не имеет поля `avatar`**: frontend `LibraryPage.tsx` ожидает `avatar?: string` и рендерит emoji если оно есть, иначе Bot icon. `AgentLibraryORM` не хранит avatar. Fix: добавить nullable `avatar` column в ORM + поле в схему. | Alex | done |
| ALEX-TD-296 | minor | **`GET /api/library` нет фильтра `?mine=true`**: ALEX-TD-269 добавил `owner_id` в DB с индексом "for future GET /api/library?mine=true" но endpoint не реализован. Fix: `?mine=true` фильтрует по `owner_id = current_user.id`. | Alex | done |
| ALEX-TD-297 | minor | **`SqliteVecStore` — missing index on `agent_id`**: `agent_memory_meta` table has no index on `agent_id` column. Every `search()`, `get_all()`, `delete_by_agent()` does a full table scan on meta table. Fix: add `CREATE INDEX IF NOT EXISTS idx_agent_memory_meta_agent_id ON agent_memory_meta(agent_id)` in `_setup()`. | Alex | done |
| ALEX-TD-298 | minor | **`handlers/memory.py` — creates new MemoryService + sqlite connection per request**: каждый GET `/memory` создаёт новый `sqlite3.connect()` + `sqlite_vec.load()` extension. При 60 RPS — 60 параллельных connections + extension loads. Fix: module-level singleton `_memory_store` для `SqliteVecStore`, передавать в `MemoryService`. | Alex | done |
| ALEX-TD-299 | minor | **`_estimate_cost` uses flat rate — no input/output differentiation**: all major LLM providers charge different rates for input vs output tokens. Current code uses single `total_tokens * rate` which overestimates for input-heavy workloads and underestimates for output-heavy. Fix: split into `_COST_INPUT` / `_COST_OUTPUT` dicts, use `prompt_tokens` / `completion_tokens` from `chunk.usage` when available. | Alex | done |
| ALEX-TD-300 | minor | **Stale тесты после ALEX-TD-298/299**: `test_alex_td_092_094.py` проверял `_extract_tokens() == int` (старая сигнатура), `test_alex_td_099_102.py` проверял `try/finally close()` (per-request паттерн). Оба паттерна изменились в TD-298/299 → тесты упали. Fix: обновить ассерты под новые сигнатуры и singleton паттерн. | Alex | done |

---

## Frontend UX Audit — Siri

| ID | Severity | Описание | Владелец | Статус |
|----|----------|----------|----------|--------|
| SIRI-UX-433 | minor | **Missing document titles on 9 pages**: AgentPage, AgentEditPage, CompanyPage, CompanySettingsPage, OnboardingPage, AuthPage, SettingsPage, LibraryPortfolioPage, NotFoundPage — no `useDocumentTitle()` call. Screen readers and browser tabs show generic title. WCAG 2.4.2. Fix: add `useDocumentTitle('Page Name — AgentCo')` to each. | Siri | done |
| SIRI-UX-434 | minor | **Breadcrumb separators not hidden from screen readers**: `Breadcrumb.tsx:76,87` — `>` separator spans lack `aria-hidden="true"`. Screen readers announce "greater than" between crumbs. WCAG 1.3.1. Fix: add `aria-hidden="true"` to separator spans + wrap in `<nav aria-label="Breadcrumb">`. | Siri | done |
| SIRI-UX-435 | minor | **KanbanBoard TaskCard not memoized**: `KanbanBoard.tsx:42` — `TaskCard` function component re-renders all cards when any column state changes. Fix: wrap with `React.memo` and extract stable callback props. | Siri | done |
| SIRI-UX-436 | minor | **tsc --noEmit errors (14 total)**: WarRoomPage unused destructured vars (isNearBottom, scrollToBottom); test files using Node.js APIs (node:fs, node:path, __dirname) in browser tsconfig; KanbanBoard.test.tsx unused variables. Fix: remove unused destructure, rewrite test file imports to use import.meta.glob ?raw pattern, remove unused test vars. | Siri | done |
| SIRI-UX-437 | minor | **BillingPage missing useDocumentTitle**: `pages/BillingPage.tsx` — missed in SIRI-UX-433 (it's in `pages/` not `components/`). Browser tab shows generic title. WCAG 2.4.2. Fix: add `useDocumentTitle('Billing — AgentCo')`. | Siri | done |
| SIRI-UX-438 | minor | **ToastContext missing aria-live**: `context/ToastContext.tsx` — toast container lacks `role="status"` and `aria-live="polite"`, screen readers don't announce toasts. WCAG 4.1.3. Fix: add `role="status" aria-live="polite"` to toast container div. | Siri | done |
| SIRI-UX-439 | minor | **AgentCard not memoized**: `components/AgentCard.tsx` — rendered N times via `.map()` in agents grid, re-renders all cards on any CompanyPage state change. Fix: wrap with `React.memo` (same pattern as SIRI-UX-435). | Siri | done |
| SIRI-UX-440 | minor | **CompanyHeader not memoized**: `components/CompanyPage.tsx` — receives stable props but re-renders on every CompanyPage state change (tab switch, tasks loaded). Fix: wrap with `React.memo`. | Siri | done |
| SIRI-UX-441 | minor | **FilterBar not memoized**: `components/KanbanBoard.tsx` — receives stable useCallback props but re-renders on every KanbanBoard state change (drag, selection, modal). Fix: wrap with `React.memo`. | Siri | done |
| SIRI-UX-442 | minor | **Unused vitest imports in audit test**: `__tests__/SIRI-UX-437-441-Audit.test.tsx:8` — `vi` and `beforeEach` imported but never used → `tsc --noEmit` errors (TS6133). Fix: remove unused imports. | Siri | done |
| SIRI-UX-443 | minor | **vendor-router bundle 178KB (58KB gzip)**: react-router-dom v7.13.1 produces a 178KB chunk. v6 was ~30KB. Evaluate: lazy-load router, or pin v6 if v7 features aren't needed. | Siri | done |
| SIRI-UX-444 | minor | **CompanyPage chunk 45KB (11KB gzip) — split KanbanBoard**: `CompanyPage-*.js` bundles KanbanBoard+TaskDetailSidebar+AgentForm. Split KanbanBoard into its own lazy chunk since Board tab is not always active. | Siri | done |
| SIRI-UX-445 | minor | **464 inline styles vs 71 className usages — migrate to Tailwind classes**: Heavy inline style usage across all components. Increases bundle size, prevents CSS caching, makes theming/dark mode harder. Incremental migration per component recommended. | Siri | done |
| SIRI-UX-446 | minor | **ToastContext inline `<style>` keyframe**: `context/ToastContext.tsx` — `@keyframes toast-slide-in` defined in JSX `<style>` tag, bypasses Tailwind CSS pipeline and caching. Fix: move to `index.css`, reference via `animate-[toast-slide-in]`. | Siri | done |
| SIRI-UX-447 | minor | **React Router v6 future flag warnings**: `main.tsx` — `BrowserRouter` missing `future={{ v7_startTransition, v7_relativeSplatPath }}` flags. Console polluted with deprecation warnings on every nav. Fix: add both flags to BrowserRouter. | Siri | done |
| SIRI-UX-448 | minor | **LibraryPage retry button — no AbortController**: `components/LibraryPage.tsx` — `handleRetry` re-uses initial fetch logic without a cancellation signal. If component unmounts during retry, setState called on dead component. Fix: add `retryController` ref, abort on unmount. | Siri | done |
| SIRI-UX-449 | minor | **Dead route `/companies/:id/warroom`**: `App.tsx:49` — separate lazy route for WarRoomPage, but War Room is always accessed via CompanyPage tab panel. This route is unreachable from any UI link/navigation. Investigate if it's used externally (deep links) or remove. | Siri | done |
| SIRI-UX-450 | minor | **Sidebar inline `style` for width/position**: `Sidebar.tsx` — uses inline `style={{ width, minHeight, position, top, left, bottom, zIndex }}` instead of Tailwind classes. Prevents CSS caching, makes responsive breakpoints harder. Incremental migration to Tailwind. | Siri | done |
| SIRI-UX-451 | minor | **CompanyPage document title не включает имя компании**: `useDocumentTitle('Company — AgentCo')` — статическое название. Должно быть динамическим: `${companyName} — AgentCo`. Улучшает browser history + tab management. | Siri | done |
| SIRI-UX-452 | minor | **KanbanBoard нет `overflow-x-auto`**: 6 колонок сжимаются на узких экранах вместо горизонтального скролла. Fix: добавить `overflow-x-auto` на wrapper колонок. | Siri | done |
| SIRI-UX-453 | minor | **Toast auto-dismiss одинаковый для error и success**: error тосты должны держаться дольше (5s) чем success (3s) — у пользователя меньше времени осознать что пошло не так. Fix: `{ success: 3000, info: 3000, error: 5000 }`. | Siri | done |
| SIRI-UX-454 | minor | **OnboardingPage поле company name без `autoFocus`**: первый ввод на странице онбординга не фокусируется автоматически. Плохой UX для клавиатурных пользователей. Fix: `autoFocus` на input. | Siri | done |
| SIRI-UX-455 | minor | **LibraryPortfolioPage пустой список задач — голый `<p>`**: `No tasks yet` выводится как bare `<p>` без иконки и структуры. Несоответствует стилю остального приложения. Fix: стилизованный empty state с emoji и двумя строками текста. | Siri | done |
| SIRI-UX-456 | minor | **AgentPage статический document title**: `AgentPage.tsx` — `useDocumentTitle('Agent — AgentCo')` статическая строка. После загрузки агента должно быть `${agent.name} — AgentCo`. Улучшает browser history + tabs. | Siri | done |
| SIRI-UX-457 | minor | **AgentPage saveToLibraryError span без `role="alert"`**: `AgentPage.tsx` — ошибка "Failed to save to library" рендерится как обычный `<span>` без `role="alert"`. Screen readers не анонсируют ошибку. WCAG 4.1.3. Fix: добавить `role="alert"`. | Siri | done |
| SIRI-UX-458 | minor | **WarRoomPage Stop button — `disabled` без `aria-disabled`**: `WarRoomPage.tsx` — кнопка Stop имеет `disabled={runStatus !== 'running'}` но не `aria-disabled`. Некоторые screen readers читают нативный `disabled` как "недоступно", но паттерн с `aria-disabled` более консистентен с WCAG. Fix: добавить `aria-disabled={runStatus !== 'running'}`. | Siri | done |
| SIRI-UX-459 | minor | **OnboardingPage `console.warn` не guard'ится DEV**: `OnboardingPage.tsx:83` — `console.warn('[SIRI-UX-421] from-template endpoint failed...')` вызывается в production. Fix: обернуть в `if (import.meta.env.DEV)`. | Siri | done |
| SIRI-UX-460 | minor | **CompanySettingsPage — нет loading skeleton**: компонент рендерит пустые инпуты пока fetch company не завершится. Пользователь видит пустую форму → путает с ошибкой. Fix: `loadingCompany` state + `SkeletonCard` пока данные загружаются. | Siri | done |
| SIRI-UX-461 | minor | **AgentEditPage saving `<p>` без `role="status"`**: `AgentEditPage.tsx` — текст "Saving…" рендерится как bare `<p>` без semantic role. Screen readers не анонсируют состояние сохранения. Fix: добавить `role="status" aria-live="polite"`. WCAG 4.1.3. | Siri | done |
| SIRI-UX-462 | minor | **WarRoomPage agent card `marginLeft` inline style**: `WarRoomPage.tsx:532` — inline `style={{ marginLeft: level*24 }}` для иерархии агентов. Мешает CSS кэшированию и темизации. Fix: `data-level` + CSS variable `--agent-level` + `.war-room-agent-card { margin-left: calc(var(--agent-level) * 24px) }`. | Siri | done |
| SIRI-UX-463 | minor | **AgentForm Submit button — нет `aria-busy`**: кнопка "Save Agent" в `AgentForm.tsx` не сообщает screen readers о процессе сохранения. Fix: добавить `saving` prop + `aria-busy={saving}` + `disabled={saving}` + label "Saving…". | Siri | done |
| SIRI-UX-459 | minor | **OnboardingPage `console.warn` без DEV guard**: `OnboardingPage.tsx` — `console.warn(...)` вызов не обёрнут в `import.meta.env.DEV` guard → засоряет production консоль. Fix: `if (import.meta.env.DEV) console.warn(...)`. | Siri | done |
| SIRI-UX-460 | minor | **CompanySettingsPage нет loading skeleton**: `CompanySettingsPage.tsx` — пока компания загружается показывается пустой экран. Несоответствие со стилем остальных страниц. Fix: добавить `data-testid="company-settings-loading"` skeleton пока `isLoading=true`. | Siri | done |
| SIRI-UX-461 | minor | **AgentEditPage "Saving..." индикатор без `role="status"`**: `AgentEditPage.tsx` — `<p>Saving...</p>` рендерится без `role="status"`. Screen readers не анонсируют изменение статуса. WCAG 4.1.3. Fix: добавить `role="status"`. | Siri | done |
| SIRI-UX-462 | minor | **WarRoomPage agent card — inline `marginLeft` для иерархического отступа**: `WarRoomPage.tsx` — `style={{ marginLeft: level * 24 }}` inline style. Блокирует CSS caching, сложнее тестировать. Fix: `data-level={level}` атрибут + CSS переменная `--level` в index.css. | Siri | done |
| SIRI-UX-463 | minor | **AgentForm Submit кнопка без `aria-busy`**: `AgentForm.tsx` — кнопка Submit не имеет `aria-busy={isSaving}`. Screen readers не анонсируют процесс сохранения. WCAG 4.1.3. Fix: добавить `aria-busy={isSaving}`. | Siri | done |
| SIRI-UX-464 | minor | **SettingsPage API key input `.trim()` on every keystroke**: `SettingsPage.tsx:325` — `onChange` вызывает `.trim()` при каждом нажатии клавиши. Вызывает прыжки курсора, ломает paste. Trim уже есть в `handleSubmit`. Fix: убрать `.trim()` из `onChange`. | Siri | done |
| SIRI-UX-465 | minor | **CompanySettingsPage delete confirm — нет `aria-disabled`**: кнопка "Delete permanently" имеет `disabled` без `aria-disabled`. Несоответствие паттерну (KanbanBoard, CompaniesPage, AuthPage, WarRoomPage — все с `aria-disabled`). Fix: добавить `aria-disabled`. | Siri | done |
| SIRI-UX-466 | minor | **WarRoom run items без `tabIndex`**: `WarRoom.tsx` — элементы с `role="article"` не имеют `tabIndex={0}`. Keyboard users не могут сфокусировать отдельные runs. Fix: добавить `tabIndex={0}` + focus ring CSS. | Siri | done |
| SIRI-UX-467 | minor | **GlobalSearch Escape без `stopPropagation`**: `GlobalSearch.tsx` — Escape handler не вызывает `e.stopPropagation()`. Если GlobalSearch открыт внутри другого контекста, Escape закрывает оба. Fix: добавить `stopPropagation()`. | Siri | done |
| SIRI-UX-468 | minor | **Navbar Logout без `aria-label`**: `Navbar.tsx` — кнопка "Logout" не имеет `aria-label`. Screen readers не дают достаточного контекста. Fix: добавить `aria-label="Sign out"`. | Siri | done |
| SIRI-UX-469 | minor | **Unused `afterEach` import в тесте — TS warning при build**: `__tests__/SIRI-UX-464-468-SelfAudit.test.tsx:8` — `afterEach` импортирован но не используется. `tsc --noEmit` выдаёт TS6133 warning. Fix: убрать `afterEach` из импорта. | Siri | done |
| SIRI-UX-470 | minor | **SystemPromptEditor token counter не связан с textarea через `aria-describedby`**: `SystemPromptEditor.tsx` — screen readers не анонсируют количество токенов при вводе. WCAG 1.3.1. Fix: добавить `id` на token counter span + `aria-describedby` на textarea. | Siri | done |
| SIRI-UX-471 | minor | **CompaniesPage Edit buttons без company-specific `aria-label`**: `CompaniesPage.tsx` — каждая кнопка Edit не содержит имя компании. Screen readers слышат "Edit" N раз без контекста (паттерн уже фиксили в LibraryPage SIRI-UX-220). Fix: `aria-label={`Edit ${co.name}`}`. | Siri | done |

---

## Known Limitations (не фиксим, задокументировано)

| ID | Описание | Владелец |
|----|----------|----------|
| ALEX-TD-252 | `get_agents_tree` — unbounded SELECT, rate-limited 30/min, задокументировано | Alex |
| ALEX-TD-254 | stdlib logging не интегрирован со structlog — задокументировано | Alex |

---

## Как добавлять баги

```
| BUG-NNN | critical/major/minor | Краткое описание + файл/строка | Кто фиксит | open/fixed |
```

Severity:
- **critical** — продукт не работает / данные теряются
- **major** — фича сломана, есть workaround
- **minor** — косметика / edge case / tech debt
