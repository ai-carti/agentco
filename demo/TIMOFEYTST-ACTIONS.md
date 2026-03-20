# 🚨 Demo Day Actions — @timofeytst

Нужно сделать ДО демо (2026-03-21). Блокеры без которых фронт не работает в production.

---

## 🔴 CRITICAL #1 — VITE_API_URL (без этого демо провалится)

**Проблема:** GitHub Pages фронт вызывает `localhost:8000` вместо Railway URL. Без этого секрета весь API трафик идёт в никуда.

**Шаги:**

1. **Узнать Railway URL:**
   - Зайти на [railway.app](https://railway.app) → твой проект agentco
   - Слева выбрать сервис `backend`
   - Вкладка **Settings** → раздел **Networking** → **Public Networking**
   - Нажать **Generate Domain** (если ещё нет) или скопировать существующий домен
   - URL будет вида: `https://agentco-backend-production-xxxx.up.railway.app`

2. **Добавить секрет в GitHub:**
   - Открыть: https://github.com/ai-carti/agentco/settings/secrets/actions
   - Нажать **New repository secret**
   - Name: `VITE_API_URL`
   - Value: `https://YOUR-RAILWAY-URL.up.railway.app` (без слэша в конце)
   - Нажать **Add secret**

3. **Запустить новый деплой фронта:**
   - Открыть: https://github.com/ai-carti/agentco/actions
   - Найти workflow **Deploy**
   - Нажать **Run workflow** → **Run workflow** (на ветке main)
   - Дождаться зелёного чекмарка (~2-3 минуты)

4. **Проверка:** Открыть GitHub Pages URL → открыть DevTools → Network → проверить что XHR запросы идут на Railway URL, а не localhost.

---

## 🔴 CRITICAL #2 — ENCRYPTION_KEY (шифрование API ключей)

**Проблема:** Backend шифрует API ключи пользователей (OpenAI, Anthropic и т.д.) через `cryptography` с `ENCRYPTION_KEY`. Без этой переменной сохранение/чтение credentials упадёт с 500 ошибкой.

**Шаги:**

1. **Сгенерировать ключ** (выполнить локально или в Railway Shell):
   ```bash
   python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
   Получишь строку вида: `dGhpcyBpcyBhIHRlc3Qga2V5IGZvciBkZW1v...`

2. **Добавить в Railway:**
   - Railway → проект agentco → сервис `backend`
   - Вкладка **Variables**
   - Нажать **Add Variable**
   - Name: `ENCRYPTION_KEY`
   - Value: (вставить сгенерированный ключ)
   - Нажать **Add** → Railway автоматически перезапустит сервис

3. **Важно:** Этот ключ нельзя менять после того как пользователи сохранили credentials — данные зашифрованы им. Сохрани ключ в надёжном месте (1Password, Bitwarden и т.д.)

4. **Проверка:** Зайти в демо → Settings → добавить тестовый API ключ OpenAI → перезагрузить страницу → ключ должен остаться.

---

## 🔴 CRITICAL #3 — CORS_ORIGINS (если будет кастомный домен)

**Проблема:** Backend разрешает CORS только для `localhost` по умолчанию. GitHub Pages фронт будет блокироваться браузером.

**Шаги:**

1. Railway → сервис `backend` → Variables
2. Добавить переменную:
   - Name: `CORS_ORIGINS`
   - Value: `https://ai-carti.github.io,https://YOUR-CUSTOM-DOMAIN.com` (через запятую, без пробелов)
3. Сервис перезапустится автоматически.

---

## 🟡 OPTIONAL — Railway Persistent Volume (данные не теряются при рестарте)

**Проблема:** По умолчанию Railway использует ephemeral filesystem. При каждом деплое/рестарте SQLite база (`agentco.db`) сбрасывается — все данные пропадают.

**Для демо:** Если база создаётся прямо перед демо и данные не критичны — можно пропустить. Если хочешь чтобы данные жили между рестартами:

**Шаги:**

1. Railway → проект → сервис `backend` → вкладка **Volumes**
2. Нажать **Add Volume**
3. Mount Path: `/data`
4. Нажать **Create**
5. Добавить переменную окружения:
   - Name: `AGENTCO_DB_URL`
   - Value: `sqlite:////data/agentco.db`
6. Деплой произойдёт автоматически. База будет сохраняться в volume.

---

## ✅ Проверка что всё работает

**Чеклист перед демо (выполнить за 30 минут до):**

```
[ ] 1. Открыть GitHub Pages URL фронта
[ ] 2. Открыть DevTools → Console — нет CORS ошибок
[ ] 3. Открыть DevTools → Network — XHR идут на Railway URL (не localhost)
[ ] 4. Зарегистрироваться / войти — работает
[ ] 5. Создать компанию — работает
[ ] 6. Добавить агента — работает
[ ] 7. Settings → добавить API ключ → сохранить → обновить страницу → ключ есть
[ ] 8. Запустить Run — агенты отвечают
[ ] 9. Railway dashboard → сервис backend → Logs — нет 500 ошибок
```

**Быстрый healthcheck backend:**
```bash
curl https://YOUR-RAILWAY-URL.up.railway.app/health
# Ожидаем: {"status":"ok"}
```

---

*Создано Alex (Backend) — 2026-03-20 05:34 MSK. Если вопросы — пинг в чат.*
