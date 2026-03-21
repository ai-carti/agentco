# CRITICAL-DEPLOY-001 — Продукт не работает. Дедлайн провален.

**Priority:** 🚨 БЛОКЕР
**Date:** 2026-03-21
**Status:** OPEN — немедленно

---

## Факты

- Демо было назначено на 2026-03-21
- Бэкенд Railway **не поднимается** — 502 на всех запросах с 2026-03-20 17:00 до сейчас
- Фронт `https://ai-carti.github.io/agentco` живёт но не работает (API недоступен)
- Тима НЕ получил: скрины работающего продукта, PDF-отчёт, работающий deploy URL
- Команда отрапортовала "демо прошло" — это ложь. Продукт не работал.

## Root Cause (установлен)

Railway деплоит старый Docker-образ, не подхватывая git push.
Последний crash: `NoReferencedTableError: companies.owner_id → users` — ORM модели импортировались не все, `create_all` не видел `UserORM`.

Фикс в коде есть (`cd8a8db` — orm/__init__.py с полным импортом), но Railway не подхватил.

## Задача для Alex

**Цель: поднять бэкенд в Railway. Критерий успеха — register + login работают.**

### Шаг 1: Привязать GitHub к Railway

Railway сейчас деплоит из старого образа без связи с GitHub.

Нужно удалить сервис и пересоздать с GitHub source:

```bash
# Railway CLI (если есть) или через dashboard:
# railway up --service backend --detach
```

**ИЛИ** — через Railway dashboard:
1. Открыть `railway.app` → проект `affectionate-achievement`
2. Сервис `agentco` → Settings → Source → Connect GitHub → выбрать `ai-carti/agentco`
3. Root Directory: `backend`
4. Branch: `main`
5. Deploy

### Шаг 2: Проверить что деплой подхватил правильный коммит

```bash
curl https://agentco-production-890d.up.railway.app/health
# Должно быть: {"status":"ok"}

curl -X POST https://agentco-production-890d.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@agentco.ai","password":"Demo1234!"}'
# Должно быть: {"id":...,"email":"demo@agentco.ai"}
```

### Шаг 3: Скриншоты

После того как бэкенд работает — сделать скриншоты через Playwright или браузер:
1. `https://ai-carti.github.io/agentco` → страница логина
2. Register → войти → дашборд с компаниями
3. Создать компанию → War Room
4. Канбан с задачами

Скриншоты сохранить в `/home/clawdbot/projects/agentco/screenshots/demo/`

### Шаг 4: PDF отчёт

После скринов — собрать PDF с:
- Ссылки: фронт + бэкенд
- Скриншоты (5-7 штук)
- Кратко: что сделано, стек, как запустить

Сохранить в `/home/clawdbot/projects/agentco/DEMO-REPORT.pdf`

---

## Credentials для Railway (в .secrets)

```
RAILWAY_TOKEN=<см. /home/clawdbot/projects/agentco/.secrets>
ENCRYPTION_KEY=<см. /home/clawdbot/projects/agentco/.secrets>
```

Railway Project ID: `fc836a2c-124d-467f-afc3-e04c1748daf6`
Railway Service ID: `ef58499b-1070-4f87-b02c-b3f25a2972dc`
Railway Environment ID: `dc318c8a-d1be-473c-8810-b02862913c38`
Backend URL: `https://agentco-production-890d.up.railway.app`
Frontend URL: `https://ai-carti.github.io/agentco`

---

## Критерий закрытия тикета

1. `GET /health` → `{"status":"ok"}` ✅
2. `POST /auth/register` → 201 ✅
3. `POST /auth/login` → token ✅
4. Скриншоты в `/home/clawdbot/projects/agentco/screenshots/demo/` (5+ штук) ✅
5. PDF-отчёт в `/home/clawdbot/projects/agentco/DEMO-REPORT.pdf` ✅
6. Shadrin отправляет PDF и ссылки Тиме в Telegram ✅

**Без этих 6 пунктов тикет не закрыт.**
