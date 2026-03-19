# DEPLOY-E2E-001 — Отчёт по деплою

**Дата:** 2026-03-18 07:40 UTC  
**Исполнитель:** Alex (CTO / Lead Backend)  
**Тикет:** DEPLOY-E2E-001 (critical)

---

## Результат: ⚠️ ДЕПЛОЙ НЕВОЗМОЖЕН — отсутствует RAILWAY_TOKEN

---

## Шаг 1: Проверка railway.toml ✅

```toml
[build]
builder = "nixpacks"

[[services]]
name = "backend"
root = "backend"

[services.build]
buildCommand = "pip install uv && uv sync --frozen --no-dev"

[services.deploy]
startCommand = "uv run uvicorn agentco.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 3

[services.variables]
PYTHONPATH = "src"
AGENTCO_DB_URL = "sqlite:///./data/agentco.db"

[[services]]
name = "frontend"
root = "frontend"

[services.build]
buildCommand = "npm ci && npm run build"

[services.deploy]
startCommand = "npx serve out -l $PORT"
```

**Оценка:** Конфиг корректен. Healthcheck настроен (`/health`), restart policy задана.  
**Риск:** `AGENTCO_DB_URL=sqlite:///./data/agentco.db` — SQLite на Railway ephemeral filesystem. При рестарте контейнера данные будут потеряны. Нужен persistent volume или PostgreSQL.

---

## Шаг 2: Проверка GitHub Actions workflow ✅

Файл: `.github/workflows/deploy.yml`

- Trigger: `push` → `main`
- Jobs: `test` → `build-frontend` → `deploy-railway`
- Backend tests (pytest) ✅ 
- Frontend tests + build ✅
- `deploy-railway` job: `npm install -g @railway/cli` + `railway up --detach`
- Environment: `production`

**Оценка:** Workflow структурно корректен.

---

## Шаг 3: Проверка RAILWAY_TOKEN ⚠️

В workflow файле:
```yaml
- name: Deploy to Railway
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
  run: railway up --detach
```

**Статус:** `RAILWAY_TOKEN` корректно ссылается на GitHub Secret.  
**БЛОКЕР:** Secret `RAILWAY_TOKEN` **не задан** в GitHub Secrets репозитория. Railway CLI недоступен в текущей среде (`railway: command not found`). Деплой без токена невозможен.

---

## Шаг 4: Попытка деплоя через railway CLI ❌

```bash
$ which railway
railway not found
```

**Railway CLI не установлен** в текущей среде. Деплой через CLI невозможен.

---

## Шаг 5: Что нужно для деплоя

### Точные шаги для деплоя на Railway:

1. **Создать аккаунт Railway** (railway.app)
2. **Создать новый Project** в Railway dashboard
3. **Получить Railway Token:**
   - Railway Dashboard → Account Settings → Tokens → "New Token"
   - Скопировать токен
4. **Добавить RAILWAY_TOKEN в GitHub Secrets:**
   - GitHub repo → Settings → Secrets and variables → Actions → "New repository secret"
   - Name: `RAILWAY_TOKEN`, Value: `<токен с Railway>`
5. **Создать Railway Service для backend:**
   - В Railway project → "New Service" → "GitHub Repo"
   - Указать root `/backend`
   - Railway автоматически обнаружит `railway.toml`
6. **Добавить переменные окружения в Railway:**
   - `SECRET_KEY` = `$(openssl rand -hex 32)` — обязательно
   - `ENCRYPTION_KEY` = сгенерировать через `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
   - `OPENAI_API_KEY` или `ANTHROPIC_API_KEY` — для работы LLM
7. **Persistent Storage:**
   - Добавить Railway Volume к backend service (для SQLite persistence)
   - Обновить `AGENTCO_DB_URL=sqlite:////data/agentco.db`
8. **Деплой фронта:**
   - Отдельный Railway service для frontend
   - Или Vercel/Netlify (рекомендую Vercel — zero-config для Next.js)
   - Переменная `VITE_API_URL` = URL backend service
9. **Push в main** → GitHub Actions запустит `deploy-railway` job автоматически

---

## Шаг 6: Текущее состояние конфига

| Компонент | Статус |
|-----------|--------|
| `railway.toml` | ✅ Корректен |
| `.github/workflows/deploy.yml` | ✅ Структурно верен |
| `RAILWAY_TOKEN` в workflow | ✅ Ссылается на secret |
| `RAILWAY_TOKEN` в GitHub Secrets | ❌ Не задан |
| Railway CLI | ❌ Не установлен в среде |
| Railway account/project | ❓ Неизвестно |
| `.env.example` | ✅ Полный (SECRET_KEY, ENCRYPTION_KEY, DB_URL, LLM keys) |
| `GET /health` endpoint | ✅ Реализован, возвращает `{"status": "ok"}` |

---

## E2E User Flow: Не выполнен (нет публичного URL)

Деплой заблокирован → пройти E2E флоу невозможно. После получения токена и деплоя:

| Шаг | Ожидаемый результат |
|-----|---------------------|
| 1. Открыть URL | Загрузка Next.js фронта |
| 2. Зарегистрироваться | POST /api/auth/register → JWT token |
| 3. Создать компанию | POST /api/companies → редирект на /companies/:id |
| 4. Добавить агента | GET /api/llm/providers → dropdown с моделями |
| 5. Создать задачу | POST /api/companies/:id/tasks |
| 6. Назначить агента | PATCH task с agent_id |
| 7. Нажать Run | POST /api/companies/:id/tasks/:id/run |
| 8. War Room | WS /ws/companies/:id/events — live updates |
| 9. Task Detail Sidebar | GET /api/companies/:id/tasks/:id/logs |
| 10. Agent History | GET /api/companies/:id/agents/:id/tasks?status=done |

---

## Итог

**Деплой: ❌ ЗАБЛОКИРОВАН**  
**Причина:** Отсутствует `RAILWAY_TOKEN` в GitHub Secrets  
**Блокер снимается:** Создать Railway project → получить токен → добавить в Secrets → push в main → CI задеплоит автоматически  
**Публичный URL:** Недоступен до снятия блокера
