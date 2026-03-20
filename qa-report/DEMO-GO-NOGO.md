# Demo Go/No-Go — 2026-03-20

| Компонент | Статус | Примечание |
|---|---|---|
| Backend Tests | ✅ 403/403 passed | uv run pytest --tb=short -q, 3m 24s |
| CI last 5 | ✅ All green | pages-build-deployment, Deploy, CI — все success |
| VITE_API_URL secret | ❌ Missing | Не найден в `gh secret list` — baked-in URL будет пустым |
| RAILWAY_TOKEN secret | ✅ Present | 2026-03-18T07:53:39Z |
| ENCRYPTION_KEY secret | ❌ Missing | Не найден в `gh secret list` — Railway переменная требует проверки |
| railway.toml | ✅ Correct | healthcheckPath="/health", port=$PORT, PYTHONPATH=src |
| deploy.yml VITE_API_URL | ✅ Passed | env: VITE_API_URL: ${{ secrets.VITE_API_URL }} — в build step |

## Action Items для @timofeytst

### 🔴 VITE_API_URL secret (критично для demo)
```bash
# Установи GitHub secret с Railway backend URL:
gh secret set VITE_API_URL --repo ai-carti/agentco
# Value: https://<your-railway-backend-url>
# Затем пересобери фронт:
git commit --allow-empty -m "chore: trigger rebuild with VITE_API_URL" && git push
```

### 🟡 ENCRYPTION_KEY (важно для production)
```bash
# Проверь в Railway dashboard (Variables tab) для backend service:
# ENCRYPTION_KEY должен быть установлен там, а не в GitHub secrets
# Если не установлен:
openssl rand -hex 32  # сгенерируй значение
# Добавь в Railway Variables: ENCRYPTION_KEY = <generated_value>
```

## Вердикт

⚠️ **CONDITIONAL GO**: backend полностью готов (403/403 ✅, CI ✅, railway.toml ✅).
Блокер: VITE_API_URL не установлен — frontend будет делать запросы на пустой URL.
Установи secret + пересобери фронт до демо.
