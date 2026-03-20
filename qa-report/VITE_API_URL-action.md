# Инструкция по настройке секретов перед демо 2026-03-21

**Для:** @timofeytst  
**Критичность:** BLOCKING — без этих шагов фронтенд не подключится к бэкенду на демо

---

## 1. GitHub Secrets (для GitHub Actions / GitHub Pages)

Путь: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name    | Value                                           | Обязательно |
|----------------|-------------------------------------------------|-------------|
| `VITE_API_URL` | URL Railway backend, например: `https://agentco-backend.up.railway.app` | ✅ ДА |

> **Зачем:** deploy.yml (строка 29) использует `${{ secrets.VITE_API_URL }}` при сборке фронта.  
> Без него `VITE_API_URL` будет пустым → все API вызовы упадут на демо.

---

## 2. Railway Variables (для backend)

Путь: **Railway Dashboard → Project → backend service → Variables**

| Variable name    | Value                                                       | Обязательно |
|------------------|-------------------------------------------------------------|-------------|
| `ENCRYPTION_KEY` | Fernet key (сгенерировать: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) | ✅ ДА |
| `AGENTCO_DB_URL` | `sqlite:////data/agentco.db` (если подключён Railway Volume) | Рекомендуется |
| `PORT`           | Задаётся Railway автоматически                              | Автоматически |

> **Зачем ENCRYPTION_KEY:** без него backend логирует WARNING и шифрует API-ключи клиентов нулевым ключом.  
> Это ALEX-TD-022 — критический security риск. На демо можно, но данные нельзя перенести потом без потерь.

### Генерация ENCRYPTION_KEY (одна команда):
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## 3. Проверка после настройки

1. Запушить любой коммит в `main` → GitHub Actions должен пройти зелёным
2. Открыть GitHub Pages URL → проверить что фронт загружается и API отвечает
3. В Railway логах не должно быть `ENCRYPTION_KEY is not set`

---

## 4. Порядок действий (последовательность важна)

```
1. Задать ENCRYPTION_KEY в Railway
2. Задать AGENTCO_DB_URL в Railway (если есть Volume)
3. Задать VITE_API_URL в GitHub Secrets (значение = Railway backend URL)
4. git push origin main → ждать зелёный CI
5. Проверить GitHub Pages
```

---

*Подготовлено Alex (FINAL-BACKEND-VERIFY-001), 2026-03-20*
