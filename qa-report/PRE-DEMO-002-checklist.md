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

## DEMO-FINAL-ALEX Update (2026-03-20 05:20 MSK)

### Backend Tests (re-run)
- ✅ **403/403 passed** — подтверждено, все зелёные
- Duration: 197s

### CI (latest 5 runs from 2026-03-20)
- ✅ `pages build and deployment` — success (2026-03-20T02:09)
- ✅ `Deploy` (DEMO-DAY-BACKEND-001) — success (2026-03-20T02:08)
- ✅ `CI` (DEMO-DAY-BACKEND-001) — success (2026-03-20T02:08)
- ✅ `pages build and deployment` — success (2026-03-20T01:48)
- ✅ `Deploy` (fix BUG-053) — success (2026-03-20T01:47)

### GitHub Secrets (актуально)
- ✅ `RAILWAY_TOKEN` — присутствует
- ❌ **`VITE_API_URL` — ОТСУТСТВУЕТ**
- ❌ **`ENCRYPTION_KEY` — ОТСУТСТВУЕТ** (NEW — critical для prod!)

### ENCRYPTION_KEY — что это и почему критично
Бэкенд использует Fernet encryption для sensitive данных (см. `backend/src/agentco/services/encryption.py`).
Если `ENCRYPTION_KEY` не задан в production — используется dev-заглушка `b'\x00'*32` с предупреждением в логах.
Для демо это некритично (данные не шифруются правильно, но приложение работает), но **лучше задать**.

### 🔴 NEW CRITICAL #3 — Задать ENCRYPTION_KEY GitHub Secret
1. Сгенерировать ключ локально:
   ```bash
   python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
2. GitHub → репо ai-carti/agentco → **Settings → Secrets and variables → Actions**
3. **New repository secret**: `ENCRYPTION_KEY` = сгенерированный ключ
4. **Также добавить в Railway dashboard** → backend service → Variables → `ENCRYPTION_KEY`

---

## Итог

| Пункт | Статус |
|---|---|
| 403 тестов backend | ✅ Green (403/403) |
| CI/Deploy last 5 runs | ✅ All green |
| railway.toml корректность | ✅ OK (volume — мануально) |
| Railway CLI / URL | ❌ CLI не установлен, URL unknown |
| RAILWAY_TOKEN GitHub Secret | ✅ Присутствует |
| VITE_API_URL GitHub Secret | ❌ ОТСУТСТВУЕТ (critical) |
| ENCRYPTION_KEY GitHub Secret | ❌ ОТСУТСТВУЕТ (critical for prod) |
| Railway persistent volume | ❌ Требует настройки в dashboard |

**3 критических action item требуют ручного действия @timofeytst перед демо.**

### Приоритет для @timofeytst:
1. 🔴 **VITE_API_URL** — без этого фронт на GitHub Pages не работает (демо провалится)
2. 🔴 **ENCRYPTION_KEY** — Railway Variables (не в GitHub Secrets) — для корректного шифрования в prod
3. 🟡 **AGENTCO_DB_URL + Railway Volume** — без этого данные ephemeral (сбрасываются при рестарте)
