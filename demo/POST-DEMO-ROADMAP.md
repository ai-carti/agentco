# Post-Demo Frontend Roadmap
> Owner: Siri | Written: 2026-03-20 (eve of demo) | Scope: 1 week after demo

## After Demo: Frontend Priorities

| ID | Описание | Приоритет | Оценка |
|----|----------|-----------|--------|
| FE-001 | **Real WebSocket integration smoke test** — WarRoomPage сейчас работает на mock interval (`setInterval` с `getNextMockEvent`). После демо нужно провести live-тест с реальным бэкендом: запустить агента → убедиться что `llm_token` события приходят в WS, Activity Feed обновляется в реальном времени, spinner "Connecting…" правильно меняется на connected. Без этого WoW-момент War Room виден только на mock-данных. | P0 | M |
| FE-002 | **SettingsPage: реальное управление LLM ключами** — сейчас `/settings` рендерит только текст "LLM credentials" и ссылку на Billing (SIRI-UX-010). Бэкенд `POST /api/credentials` + `GET /api/credentials` готов и протестирован. Нужно: форма добавления ключа (provider select + api_key input + validate button), список добавленных ключей с маскировкой (`sk-...xxxx`), кнопка удаления. Без этого пользователь после демо не знает как подключить свой LLM ключ. | P0 | M |
| FE-003 | **AgentPage: дублирующийся UX Edit** — сейчас `AgentPage.tsx` рендерит одновременно `AgentForm` (редактируемый) и кнопку "Edit" ведущую на `AgentEditPage` (SIRI-UX-007). Два способа редактирования на одном экране — путаница для пользователя. Решение: AgentPage = view-only (имя, роль, модель, промпт — read-only), кнопка "Edit" ведёт на AgentEditPage. Убрать inline `AgentForm` с AgentPage. | P1 | S |
| FE-004 | **KanbanBoard: stateful drag & drop с persist** — drag & drop работает (UX-005 closed), но оптимистичное обновление не проверялось при реальном API. После демо: провести stress-test (drag 10 карточек быстро), убедиться что rollback при ошибке работает корректно, добавить `aria-grabbed`/`aria-dropeffect` для accessibility. Дополнительно: сохранять порядок колонок/карточек в localStorage для быстрого восстановления при refresh. | P1 | M |
| FE-005 | **Performance: список задач при >50 карточках** — сейчас KanbanBoard рендерит все карточки без виртуализации. При 50+ задачах на компанию (реальный сценарий через месяц) — layout shift + медленный DnD. Нужно: добавить `@tanstack/react-virtual` для виртуализации колонок, или lazy-load следующие 20 карточек при scroll. Также: `GET /api/companies/{id}/tasks` без пагинации на фронте — добавить `limit=50&offset=N`. | P1 | L |
| FE-006 | **Mobile: War Room на телефоне** — SIRI-UX-017 закрыт (sidebar collapsible), но War Room на мобайле всё ещё неудобен. Agent cards в sidebar 280px занимают половину экрана при развёрнутом. Activity feed почти не видно. После демо: провести полный мобайл-тест (375px viewport), убедиться что War Room читаем, агент-панель переключается drawer-паттерном. Инвестор может захотеть показать демо на телефоне инвестиционному партнёру. | P2 | M |
| FE-007 | **Error Boundary + 404 page** — сейчас при JS-исключении в компоненте (например, сетевой сбой + неожиданный API-ответ) React показывает белый экран без объяснения. Нужно: добавить `ErrorBoundary` на уровне роутов, красивую страницу ошибки ("Something went wrong. Refresh the page.") + кнопку возврата на главную. Также: обработать несуществующий `/companies/:id` — сейчас страница рендерится пустой, нужен чёткий "Company not found" + redirect на `/`. | P2 | S |

---

## Контекст

Что уже **хорошо** и не требует срочной правки:
- Toast system (UX-013) — все 7 триггеров работают, прогресс-бар, auto-dismiss ✅
- Empty states (UX-012) — все 5 экранов, анимация, CTA ✅
- Global search Cmd+K (UX-017) — группировка, стрелки ↑↓, Escape ✅
- Skeleton loaders (UX-016) — везде где грузятся данные ✅
- Accessibility basics — aria-labels, role="dialog", keyboard nav на модалах ✅

Что **работает но сырое** (выше зафиксировано):
- WarRoom — красивый mock, реальный WS-поток не тестировался в prod
- Settings — заглушка без реального функционала ключей
- AgentPage — дублирующийся edit UX
