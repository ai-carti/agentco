# INFRA-001 — Выставить VITE_API_URL и ENCRYPTION_KEY перед демо

**Priority:** 🔴 CRITICAL (блокирует демо)
**Date:** 2026-03-20
**Status:** OPEN → assign to Alex

---

## Задача

Выставить недостающие секреты чтобы Pages-фронт мог звонить на Railway backend.

## Steps

### 1. Получить Railway backend URL

```bash
# Railway API (токен в /home/clawdbot/projects/agentco/.secrets)
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { projects { edges { node { name services { edges { node { name domains { edges { node { domain } } } } } } } } } } }"}' \
  | jq '.data.me.projects.edges[].node | select(.name | test("agentco";"i")) | .services.edges[].node | {name, domains: .domains.edges[].node.domain}'
```

Скопировать публичный URL (вида `https://xxx.up.railway.app`).

### 2. Добавить GitHub Secret VITE_API_URL

```bash
# gh CLI (нужен gh auth)
gh secret set VITE_API_URL --repo ai-carti/agentco --body "https://xxx.up.railway.app"
```

Или вручную: репо → Settings → Secrets and variables → Actions → New secret.

### 3. Добавить ENCRYPTION_KEY в Railway Variables

Railway dashboard → backend сервис → Variables → добавить:
- `ENCRYPTION_KEY` = (значение из `.secrets`)

### 4. Пересобрать фронт

```bash
git commit --allow-empty -m "chore: trigger rebuild with VITE_API_URL"
git push
```

### 5. Verify

- Открыть `ai-carti.github.io/agentco`
- DevTools → Network → Sign Up → POST должен идти на Railway URL, не на `localhost`
- 201 Created → редирект на дашборд

## Секреты

Хранятся в `/home/clawdbot/projects/agentco/.secrets` (только на сервере, не в git).
