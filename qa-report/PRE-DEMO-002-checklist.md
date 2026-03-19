# PRE-DEMO-002 — Final Backend Deployment Check

**Date:** 2026-03-19  
**Executor:** Alex  
**Demo date:** 2026-03-21  

---

## Checklist

### 1. Backend Tests (403 total)
- ✅ **403/403 passed** — `uv run pytest -q` в `/home/clawdbot/projects/agentco/repo/backend`
- Duration: ~3.5 min (203s)
- Zero failures, zero errors

### 2. CI/Deploy Runs (last 5)
- ✅ `pages build and deployment` — success (2026-03-19T22:22)
- ✅ `CI` (fix SIRI-UX-072) — success (2026-03-19T22:21)
- ✅ `Deploy` (fix SIRI-UX-072) — success (2026-03-19T22:21)
- ✅ `pages build and deployment` — success (2026-03-19T22:12)
- ✅ `Deploy` (fix BUG-053) — success (2026-03-19T22:11)
- **All 5 latest runs: GREEN ✅**

### 3. railway.toml [deploy] Block
- ✅ `[services.deploy]` присутствует для backend
- ✅ `startCommand`: `uv run uvicorn agentco.main:app --host 0.0.0.0 --port $PORT`
- ✅ `healthcheckPath`: `/health`
- ⚠️ **Persistent volume НЕ задан в railway.toml** — это intentional
  - Комментарий в `railway.toml` объясняет: `AGENTCO_DB_URL` нужно задать вручную в Railway dashboard + создать Volume
  - Без этого используется fallback `sqlite:///./agentco.db` — **ephemeral** (данные теряются при рестарте)

### 4. Railway CLI Variables
- ❌ **Railway CLI не установлен** (`railway: command not found`)
- Переменные задать через Railway dashboard вручную:
  - `AGENTCO_DB_URL` = `sqlite:////data/agentco.db`
  - Требуется создать Volume с mount path `/data`

### 5. GitHub Secrets
- ✅ `RAILWAY_TOKEN` — присутствует
- ❌ **`VITE_API_URL` — ОТСУТСТВУЕТ** (критический баг для демо!)
  - Фронт на GitHub Pages будет звонить на `localhost:8000` → демо сломано
  - `deploy.yml` уже настроен принимать этот secret (исправлено Siri в SIRI-UX-072)
  - **Нужно задать вручную** через GitHub Settings → Secrets → Actions

### 6. Railway Backend URL
- ❓ **Railway backend URL неизвестен** — Railway CLI недоступен, URL нет в конфигах
  - URL вида `https://<something>.up.railway.app` доступен только в Railway dashboard
  - **Требует мануального action** — узнать URL и задать его как `VITE_API_URL` secret

---

## Критические Action Items для @timofeytst

### 🔴 CRITICAL #1 — Задать VITE_API_URL GitHub Secret
1. Войти в Railway dashboard → найти backend сервис
2. Скопировать публичный URL (вида `https://agentco-backend.up.railway.app`)
3. GitHub → репо ai-carti/agentco → **Settings → Secrets and variables → Actions**
4. **New repository secret**: `VITE_API_URL` = скопированный Railway URL
5. Запустить деплой (push в main или ручной rerun workflow)

### 🔴 CRITICAL #2 — Настроить persistent volume для SQLite
1. Railway dashboard → проект → backend сервис → вкладка **Volumes**
2. **Add Volume**: Mount Path = `/data`, Size = 1 GB
3. Вкладка **Variables** → добавить: `AGENTCO_DB_URL` = `sqlite:////data/agentco.db`
4. Сервис перезапустится автоматически

---

## Итог

| Пункт | Статус |
|---|---|
| 403 тестов backend | ✅ Green |
| CI/Deploy last 5 runs | ✅ All green |
| railway.toml корректность | ✅ OK (volume — мануально) |
| Railway CLI variables | ❌ CLI не установлен |
| VITE_API_URL GitHub Secret | ❌ ОТСУТСТВУЕТ (critical) |
| Railway persistent volume | ❌ Требует настройки в dashboard |

**2 критических action item требуют ручного действия @timofeytst перед демо.**
