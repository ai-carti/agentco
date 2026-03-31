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
| SIRI-UX-449 | minor | **Dead route `/companies/:id/warroom`**: `App.tsx:49` — separate lazy route for WarRoomPage, but War Room is always accessed via CompanyPage tab panel. This route is unreachable from any UI link/navigation. Investigate if it's used externally (deep links) or remove. | Siri | open |
| SIRI-UX-450 | minor | **Sidebar inline `style` for width/position**: `Sidebar.tsx` — uses inline `style={{ width, minHeight, position, top, left, bottom, zIndex }}` instead of Tailwind classes. Prevents CSS caching, makes responsive breakpoints harder. Incremental migration to Tailwind. | Siri | open |

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
