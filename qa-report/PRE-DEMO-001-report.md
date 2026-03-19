# PRE-DEMO-001 — Final UI Smoke Test Report

**Дата:** 2026-03-19 (01:35 MSK / 22:35 UTC)  
**Исполнитель:** Siri (Frontend Engineer)  
**Демо:** 2026-03-21

---

## 1. TypeScript + Build

```
npx tsc --noEmit → ✅ 0 ошибок
npm run build    → ✅ успешно (4.05s, 306KB JS + 9.95KB CSS)
```

---

## 2. Тесты

```
npm test -- --run
Test Files  58 passed (58)
Tests       511 passed (511)
Duration    45.16s
```
✅ **511/511 зелёных** — регрессий нет

---

## 3. Визуальная проверка (code review + static analysis)

Headless Chromium недоступен в среде (отсутствуют системные библиотеки libatk). Проведён code review ключевых компонентов.

### /auth — AuthPage
- ✅ Форма login/register с табами Sign In / Sign Up
- ✅ Dark theme (#0a0a0f background, #111118 card)
- ✅ BUG-010/011/012 fix: сохранение location.state.from, initAuth(), защита от /auth loop
- ✅ Поля email/password, кнопка submit, error state

### / — CompaniesPage
- ✅ Список компаний + EmptyState (OnboardingPage) при отсутствии компаний
- ✅ SkeletonCard при загрузке
- ✅ Toast при создании/удалении (BUG-021 fix)
- ✅ BASE_URL через `import.meta.env.VITE_API_URL ?? 'http://localhost:8000'` ✅

### /companies/:id — CompanyPage + Kanban + WarRoom
- ✅ Три таба: War Room / Board / Agents
- ✅ WarRoomPage (BUG-028 fix — использует правильный компонент, не старый WarRoom.tsx)
- ✅ KanbanBoard с TaskDetailSidebar (открывается по клику на таск)
- ✅ Skeleton при загрузке board (BUG-023 fix)

### War Room — WebSocket
- ✅ `useWarRoomSocket` подключается к `/ws/companies/{company_id}/events` (BUG-029 fix)
- ✅ URL через `VITE_API_URL` с заменой http→ws (BUG-038 fix)
- ✅ Exponential backoff reconnect (max 30s)
- ✅ Mock fallback — при отсутствии backend агенты видны через `loadMockData()`

### Task Detail Sidebar
- ✅ Открывается по клику на таск (KanbanBoard.tsx:1017-1019)
- ✅ Показывает logs, statusHistory, run button
- ✅ Toast при ошибке run (BUG-025 fix)

---

## 4. deploy.yml — SIRI-UX-072

```yaml
- name: Install & build
  working-directory: frontend
  env:
    GITHUB_REPOSITORY: ${{ github.repository }}
    VITE_API_URL: ${{ secrets.VITE_API_URL }}  ← ✅ ПРИСУТСТВУЕТ
  run: |
    npm ci
    npm run build
```

✅ **SIRI-UX-072 fix корректен** — `VITE_API_URL` передаётся в build шаг

---

## 5. Найденные баги / visual issues

**Нет новых major/critical багов.** Все предыдущие баги (BUG-001..038) помечены fixed.

---

## 6. Требует action от @timofeytst

| # | Описание | Приоритет |
|---|----------|-----------|
| 1 | **GitHub Secret `VITE_API_URL`** — задать в `Settings → Secrets → Actions → New secret` = Railway backend URL. Без этого GitHub Pages → localhost (демо сломано) | 🔴 CRITICAL |
| 2 | **Railway Variable `AGENTCO_DB_URL`** — задать = `sqlite:////data/agentco.db` + создать Volume. Без этого данные теряются при рестарте контейнера | 🔴 CRITICAL |
| 3 | **Headless browser** — visual screenshot не выполнен (нет libatk в среде). Рекомендую вручную пройти happy-path на GitHub Pages URL после деплоя | 🟡 WARN |

---

## Итог

| Проверка | Статус |
|----------|--------|
| TypeScript | ✅ чисто |
| Build | ✅ успешно |
| Tests 511/511 | ✅ зелёные |
| deploy.yml VITE_API_URL | ✅ на месте |
| AuthPage | ✅ OK |
| CompaniesPage | ✅ OK |
| CompanyPage / War Room / Kanban | ✅ OK |
| WebSocket hook | ✅ OK |
| TaskDetailSidebar | ✅ OK |
| **Visual screenshot** | ⚠️ не выполнен (нет браузера в среде) |

**Продукт готов к демо по коду.** Осталось 2 infrastructure action от @timofeytst (GitHub Secret + Railway Volume).
