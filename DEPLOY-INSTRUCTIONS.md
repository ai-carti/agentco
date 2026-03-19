# AgentCo — Deploy Instructions для @timofeytst

> Актуально на 2026-03-20. Backend деплоится на Railway, Frontend — GitHub Pages.

---

## 1. Узнать Railway backend URL

1. Открой [railway.app](https://railway.app) → войди в аккаунт
2. Выбери проект **AgentCo**
3. Кликни на сервис **backend**
4. Вкладка **Settings** → секция **Domains**
5. Скопируй URL вида `https://agentco-backend-production.up.railway.app`

Это и есть `VITE_API_URL` для фронтенда.

---

## 2. Задать `VITE_API_URL` в GitHub Secrets

1. Открой репозиторий на GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Нажми **New repository secret**
4. Name: `VITE_API_URL`
5. Secret: вставь Railway backend URL из шага 1 (например `https://agentco-backend-production.up.railway.app`)
6. Нажми **Add secret**

После этого следующий push на `main` автоматически соберёт фронт с правильным API URL.

---

## 3. Добавить Railway Volume для persistent DB

1. Railway → проект **AgentCo** → сервис **backend**
2. Вкладка **Settings** → секция **Volumes**
3. Нажми **Add Volume**
4. Mount Path: `/data`
5. Нажми **Create**

Volume создан — данные теперь переживают редеплои.

---

## 4. Задать Railway Variable `AGENTCO_DB_URL`

1. Railway → проект **AgentCo** → сервис **backend**
2. Вкладка **Variables**
3. Нажми **New Variable**
4. Key: `AGENTCO_DB_URL`
5. Value: `sqlite:////data/agentco.db`
6. Нажми **Add**

> ⚠️ Четыре слеша после `sqlite:` — это правильно: `sqlite:////data/agentco.db`
> (три — протокол, один — абсолютный путь `/data/agentco.db`)

После добавления переменной Railway автоматически сделает редеплой.

---

## 5. Проверить что деплой прошёл успешно

### GitHub Actions (фронтенд)
1. Репозиторий → вкладка **Actions**
2. Находишь последний workflow **Deploy**
3. Все шаги зелёные ✅ — фронт задеплоен на GitHub Pages

### Railway (бэкенд)
1. Railway → сервис **backend** → вкладка **Deployments**
2. Последний деплой должен быть в статусе **Active** (зелёный)
3. Кликни на деплой → логи должны показывать:
   ```
   INFO: Application startup complete.
   ```
4. Зайди на `https://<твой-railway-url>/health` — должен вернуть:
   ```json
   {"status": "ok"}
   ```

### Smoke test
```bash
curl https://<твой-railway-url>/health
# → {"status":"ok"}

curl https://<твой-railway-url>/api/health  
# → {"status":"ok","version":"0.1.0"}
```

---

## Быстрый чеклист перед демо

- [ ] Railway backend URL известен
- [ ] `VITE_API_URL` задан в GitHub Secrets
- [ ] Railway Volume `/data` создан
- [ ] `AGENTCO_DB_URL=sqlite:////data/agentco.db` задан в Railway Variables
- [ ] GitHub Actions — последний Deploy зелёный
- [ ] `GET /health` возвращает `{"status": "ok"}`
- [ ] Фронтенд открывается и видит бэкенд
