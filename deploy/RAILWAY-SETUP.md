# Railway Deployment Setup

Ручные шаги для первоначального деплоя и настройки Railway.

---

## DEPLOY-TOKEN-001 — GitHub Secret: RAILWAY_TOKEN

### Статус
`RAILWAY_TOKEN` был добавлен в GitHub Secrets 2026-03-18 (07:53 UTC) через `gh secret set`.

### Как получить RAILWAY_TOKEN
1. Войти на [railway.app](https://railway.app)
2. Перейти: **Account Settings → Tokens**
3. Нажать **New Token**, дать имя (например `agentco-ci`)
4. Скопировать токен

### Как добавить в GitHub Secrets
```bash
# Если есть токен в буфере обмена:
gh secret set RAILWAY_TOKEN --repo ai-carti/agentco

# Или передать напрямую:
echo "your-token-here" | gh secret set RAILWAY_TOKEN --repo ai-carti/agentco
```

Или через GitHub UI:
- **Repo → Settings → Secrets and variables → Actions → New repository secret**
- Name: `RAILWAY_TOKEN`, Value: токен из Railway

### Проверка CI/Deploy
```bash
gh run list --repo ai-carti/agentco --limit 5
gh run view <run-id> --log
```

---

## ALEX-TD-002 — Persistent Volume для SQLite

### Проблема
Без persistent volume данные теряются при каждом рестарте контейнера Railway.

### Решение: Railway Volume

#### 1. Создать Volume в Railway Dashboard
1. Открыть проект на [railway.app](https://railway.app)
2. Выбрать сервис **backend**
3. Вкладка **Volumes** → **Add Volume**
4. Mount Path: `/app/data`
5. Нажать **Create**

#### 2. Установить Environment Variables в Railway
В разделе **Variables** сервиса backend добавить:

| Variable | Value |
|----------|-------|
| `AGENTCO_DB_URL` | `sqlite:////app/data/agentco.db` |
| `AGENTCO_DB_PATH` | `/app/data/agentco.db` |

> Примечание: `AGENTCO_DB_URL` использует 4 слеша (`////`) — это SQLAlchemy абсолютный путь.
> `AGENTCO_DB_PATH` — обычный абсолютный путь для checkpointer и memory.

#### 3. Проверить после деплоя
```bash
# В Railway console или через railway CLI:
ls -la /app/data/
# Должен быть agentco.db
```

### Ручной деплой (если CI не работает)

```bash
# Установить Railway CLI
npm install -g @railway/cli

# Логин
railway login

# В директории репо:
cd /home/clawdbot/projects/agentco/repo

# Деплой backend
railway up --service backend

# Проверить статус
railway status
railway logs
```

### Переменные окружения для production (Railway Variables)

```
AGENTCO_DB_URL=sqlite:////app/data/agentco.db
AGENTCO_DB_PATH=/app/data/agentco.db
OPENAI_API_KEY=sk-...
SECRET_KEY=<strong-random-secret>
CORS_ORIGINS=https://your-frontend.vercel.app
EMBEDDING_MODEL=text-embedding-3-small
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

---

## Архитектура данных

```
/app/data/          ← Railway persistent volume
  agentco.db        ← основная БД (компании, агенты, задачи, раны)
                       + LangGraph checkpoints
                       + sqlite-vec память агентов
```

Все три компонента используют один файл через разные переменные:
- `AGENTCO_DB_URL` → SQLAlchemy engine (session.py)
- `AGENTCO_DB_PATH` → checkpointer (services/run.py) + MemoryStore (memory/service.py)
