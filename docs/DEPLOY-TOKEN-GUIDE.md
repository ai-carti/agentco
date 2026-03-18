# Deploy Token Guide

Полная инструкция по настройке деплоя AgentCo на Railway через GitHub Actions.

---

## DEPLOY-TOKEN-001 — Настройка RAILWAY_TOKEN

### Шаг 1: Создать Railway аккаунт и проект

1. Зайти на [railway.app](https://railway.app) и зарегистрироваться
2. Нажать **"New Project"** → **"Empty Project"**
3. Дать проекту имя, например `agentco`

---

### Шаг 2: Получить RAILWAY_TOKEN

1. Перейти в **Account Settings** → **[Tokens](https://railway.app/account/tokens)**
2. Нажать **"New Token"**
3. Дать токену имя, например `github-actions`
4. Скопировать токен — он показывается **один раз**, сохраните его

---

### Шаг 3: Добавить токен в GitHub Secrets

1. Открыть репозиторий на GitHub
2. Перейти **Settings** → **Secrets and variables** → **Actions**
3. Нажать **"New repository secret"**
4. Заполнить:
   - **Name:** `RAILWAY_TOKEN`
   - **Value:** вставить скопированный токен с Railway
5. Нажать **"Add secret"**

---

### Шаг 4: Добавить прочие переменные в Railway

В Railway dashboard для backend сервиса добавить переменные окружения:

| Переменная | Описание | Как получить |
|---|---|---|
| `SECRET_KEY` | JWT signing key | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Fernet key для хранения секретов | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `OPENAI_API_KEY` | OpenAI ключ (для LLM) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Anthropic ключ (для Claude) | [console.anthropic.com](https://console.anthropic.com) |
| `AGENTCO_DB_URL` | URL базы данных | См. раздел про Volume ниже |
| `CORS_ORIGINS` | URL фронтенда | Например `https://agentco.vercel.app` |

---

### Шаг 5: Проверить что деплой прошёл

1. Сделать любой коммит в `main` ветку (или push в main)
2. Открыть вкладку **Actions** в GitHub репозитории
3. Найти workflow **"Deploy"** → убедиться что все три job'а зелёные:
   - ✅ Tests
   - ✅ Build Frontend
   - ✅ Deploy to Railway
4. В Railway dashboard посмотреть логи деплоя сервиса
5. Проверить healthcheck: `GET https://<your-railway-url>/health` → должен вернуть `{"status": "ok"}`

---

## ALEX-TD-002 — SQLite Persistent Volume на Railway

### Проблема

По умолчанию Railway запускает контейнер с **ephemeral filesystem** — при рестарте или редеплое все данные SQLite файла теряются.

Текущее значение в `railway.toml`:
```toml
AGENTCO_DB_URL = "sqlite:///./data/agentco.db"
```

Этот путь (`./data/agentco.db`) указывает на временную файловую систему контейнера.

### Решение: Railway Volume

#### Шаг 1: Создать Volume в Railway dashboard

1. Открыть **Railway project** → выбрать **backend** сервис
2. Перейти во вкладку **"Volumes"**
3. Нажать **"Add Volume"**
4. Задать параметры:
   - **Mount Path:** `/data`
   - **Size:** минимум 1 GB
5. Нажать **"Create Volume"**

Railway примонтирует volume по пути `/data` — содержимое этой директории сохраняется между рестартами.

#### Шаг 2: Установить переменную окружения AGENTCO_DB_URL

В Railway dashboard → backend сервис → **Variables**:

```
AGENTCO_DB_URL = sqlite:////data/agentco.db
```

> **Важно:** Четыре слеша `////` — это `sqlite://` + абсолютный путь `/data/agentco.db`.

Альтернативно через Railway CLI:
```bash
railway variables set AGENTCO_DB_URL="sqlite:////data/agentco.db"
```

#### Шаг 3: Задеплоить

После установки переменной Railway автоматически перезапустит сервис с новым значением. Данные теперь будут храниться в `/data/agentco.db` на персистентном volume.

#### Шаг 4: Проверить

```bash
# Проверить что БД доступна
curl https://<your-railway-url>/health
# → {"status": "ok"}

# Зарегистрироваться и проверить что данные сохраняются после рестарта
curl -X POST https://<your-railway-url>/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'
```

### Альтернатива: PostgreSQL

Для продакшн-нагрузок рекомендуется перейти на PostgreSQL:

1. В Railway project → **"New Service"** → **"Database"** → **"PostgreSQL"**
2. Railway автоматически добавит переменную `DATABASE_URL`
3. Обновить бэкенд для поддержки PostgreSQL (заменить `sqlite` на `postgresql`)

> **Текущий статус:** ALEX-TD-002 остаётся **open** — требует ручных действий в Railway dashboard.  
> Бэкенд уже читает `AGENTCO_DB_URL` из переменной окружения (не хардкодит путь).

---

## Быстрая проверка деплоя

```bash
# 1. Healthcheck
curl https://<your-railway-url>/health

# 2. Зарегистрироваться
curl -X POST https://<your-railway-url>/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'

# 3. Войти
curl -X POST https://<your-railway-url>/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'
# → {"access_token": "...", "token_type": "bearer"}
```
