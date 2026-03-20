# FINAL-BACKEND-VERIFY-001 — Финальная backend верификация

**Дата:** 2026-03-20  
**Автор:** Alex (CTO / Lead Backend)  
**Статус:** ✅ ЗАВЕРШЕНО

---

## 1. Тесты (pytest)

**Команда:** `cd backend && uv run pytest --tb=short -q`

```
403 passed in 203.48s (0:03:23)
```

**Результат:** ✅ 403/403 зелёных, 0 упавших  
**Примечание:** deprecation warning от uv (tool.uv.dev-dependencies → dependency-groups.dev) — некритично, не влияет на работу

---

## 2. deploy.yml — VITE_API_URL

**Файл:** `.github/workflows/deploy.yml`

```
29: VITE_API_URL: ${{ secrets.VITE_API_URL }}
```

**Результат:** ✅ VITE_API_URL присутствует в deploy.yml строка 29  
**Статус секрета:** ⚠️ ТРЕБУЕТ ДЕЙСТВИЯ — нужно задать `VITE_API_URL` в GitHub Secrets  
**Инструкция:** см. `/home/clawdbot/projects/agentco/qa-report/VITE_API_URL-action.md`

---

## 3. railway.toml

**Конфигурация проверена:**

```toml
[build]
builder = "nixpacks"

[[services]]
name = "backend"
root = "backend"

[services.deploy]
startCommand = "uv run uvicorn agentco.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 3

[[services]]
name = "frontend"
root = "frontend"
```

**Результат:** ✅ railway.toml корректный  
**Замечание:** AGENTCO_DB_URL намеренно не захардкожен — нужно задать вручную в Railway dashboard (инструкция в docs/DEPLOY-TOKEN-GUIDE.md)

---

## 4. ENCRYPTION_KEY warning (ALEX-TD-022)

**Файл:** `backend/src/agentco/services/encryption.py`

```python
# строка 17-21
# ALEX-TD-022 fix: warn loudly when ENCRYPTION_KEY is not set.
logger.warning(
    "ENCRYPTION_KEY is not set — using insecure dev key (b'\\x00'*32). "
    "Set ENCRYPTION_KEY env variable in production!"
)
```

**Результат:** ✅ Warning реализован (ALEX-TD-022 fix присутствует)  
**Статус:** ⚠️ ENCRYPTION_KEY нужно задать в Railway перед демо  
**Риск:** Без ENCRYPTION_KEY API-ключи клиентов шифруются нулевым ключом — security риск и невозможность миграции данных

---

## 5. GitHub Actions Secrets — документация

**Файл создан:** `/home/clawdbot/projects/agentco/qa-report/VITE_API_URL-action.md`

**Содержит:**
- Инструкцию по GitHub Secrets (VITE_API_URL)
- Инструкцию по Railway Variables (ENCRYPTION_KEY, AGENTCO_DB_URL)
- Команду генерации Fernet key
- Порядок действий перед демо

**Результат:** ✅ Создано

---

## Итог

| Шаг | Статус |
|-----|--------|
| pytest 403/403 | ✅ ВСЕ ЗЕЛЁНЫЕ |
| VITE_API_URL в deploy.yml | ✅ ПРИСУТСТВУЕТ |
| railway.toml | ✅ КОРРЕКТНЫЙ |
| ENCRYPTION_KEY warning (ALEX-TD-022) | ✅ РЕАЛИЗОВАН |
| Документация secrets для @timofeytst | ✅ СОЗДАНА |

## Блокеры перед демо (требуют ручных действий от @timofeytst)

1. **[CRITICAL]** Задать `VITE_API_URL` в GitHub Secrets → без этого фронт не подключится к бэку
2. **[HIGH]** Задать `ENCRYPTION_KEY` в Railway Variables → без этого шифрование работает на нулевом ключе
3. **[MEDIUM]** Задать `AGENTCO_DB_URL` в Railway → без этого БД эфемерная (сбрасывается при рестарте)

**Инструкция:** `/home/clawdbot/projects/agentco/qa-report/VITE_API_URL-action.md`
