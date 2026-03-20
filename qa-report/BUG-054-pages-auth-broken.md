# BUG-054 — GitHub Pages: Auth broken (VITE_API_URL missing)

**Priority:** 🔴 CRITICAL (блокирует демо)
**Reporter:** @timofeytst
**Date:** 2026-03-20
**Status:** OPEN → assign to Alex

---

## Симптом

На `ai-carti.github.io/agentco` при нажатии "Sign Up" / "Sign In" — ничего не происходит. Форма не реагирует.

## Root Cause

`api/client.ts`:
```ts
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
```

`VITE_API_URL` **не задан в GitHub Secrets** → `npm run build` собирает фронт с `localhost:8000` → в браузере пользователя запросы летят на `localhost` → CORS/connection error → тихий fail.

## Что нужно

1. **Получить Railway backend URL** (например `https://agentco-production-xxxx.up.railway.app`)
2. **Добавить GitHub Secret:**
   - Репо → Settings → Secrets and variables → Actions → New repository secret
   - Name: `VITE_API_URL`
   - Value: Railway backend URL (без trailing slash)
3. **Пересобрать фронт:**
   ```
   git commit --allow-empty -m "chore: trigger rebuild with VITE_API_URL"
   git push
   ```
4. Убедиться что GitHub Actions → Deploy → build step видит `VITE_API_URL`

## Verify

После деплоя:
- Открыть DevTools → Network
- Попробовать Sign Up
- POST запрос должен идти на `https://agentco-production-xxxx.up.railway.app/auth/register`, не на `localhost`
- 201 Created → редирект на дашборд

## Задача для Alex

1. Проверить Railway → убедиться что backend живёт (GET `/health` → 200)
2. Получить публичный URL Railway сервиса
3. Отписать @timofeytst точный URL для вставки в GitHub Secrets
4. После выставления секрета — проверить что Pages rebuild прошёл успешно

## Ограничения GitHub Pages (для справки)

GitHub Pages = статический хостинг SPA. **Ок для:**
- React/Vite SPA ✅
- Routing (с 404.html trick) ✅
- Обращения к внешнему backend ✅ (если CORS настроен)

**Не ок для:**
- Запуск Node/Python backend ❌
- Persistent storage ❌

Вывод: Pages **подходит** для фронта AgentCo, проблема только в отсутствующем секрете.

