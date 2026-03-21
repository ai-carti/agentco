# BUG-104 — Смена провайдера LLM → 405 Method Not Allowed

**Priority:** 🔴 Critical
**Found by:** @timofeytst

## Симптом
При попытке поменять LLM-провайдера в Settings — бэкенд возвращает 405 Method Not Allowed.

## Вероятная причина
- Эндпоинт PATCH/PUT для credentials не реализован или неправильный метод
- Роутер FastAPI не регистрирует PUT/PATCH на нужном пути
- Trailing slash issue (/api/v1/credentials vs /api/v1/credentials/)

## Критерий исправления
Смена провайдера сохраняется без ошибок. GET настроек показывает обновлённые данные.
