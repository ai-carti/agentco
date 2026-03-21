# DEMO-SCREENCAST-001 — Скринкаст и скриншоты всего UI/UX в проде

**Priority:** 🔴 HIGH
**Assign to:** Alisa (QA) + Siri (знает UI)
**Date:** 2026-03-21
**Status:** OPEN

---

## Задача

Тима хочет увидеть как продукт работает в реальном проде — скриншоты и видео всего UI/UX пайплайна.

## Конечный результат (обязателен)

1. **Скриншоты** всех экранов — сохранить в `/home/clawdbot/projects/agentco/screenshots/demo/`
2. **Скринкаст** (видео) — полный проход по продукту, сохранить в `/home/clawdbot/projects/agentco/screencast/demo.mp4`
3. **Shadrin отправляет** скриншоты и видео Тиме в Telegram

---

## URLs

- **Frontend:** https://ai-carti.github.io/agentco
- **Backend:** https://agentco-backend-production.up.railway.app

---

## Тест-аккаунт (создан, можно использовать)

```
Email:    demo@agentco.ai
Password: Demo1234!
```

---

## Что показать (полный пайплайн)

### 1. Auth flow
- [ ] Страница логина / регистрации
- [ ] Регистрация нового аккаунта
- [ ] Вход

### 2. Companies
- [ ] Список компаний (пустой state + onboarding)
- [ ] Создание компании
- [ ] Переход внутрь компании

### 3. Company — вкладки
- [ ] **War Room** — реалтайм дашборд агентов
- [ ] **Kanban** — задачи по колонкам (Backlog / In Progress / Done)
- [ ] **Agents** — список агентов

### 4. Agents
- [ ] Создание агента (форма: имя, модель LLM, системный промпт)
- [ ] Просмотр агента

### 5. Tasks
- [ ] Создание задачи
- [ ] Перемещение по канбану
- [ ] Открытие Task Detail Sidebar

### 6. Agent Run
- [ ] Запуск агента на задаче
- [ ] Логи выполнения в реалтайме
- [ ] Статус (running → done)

### 7. Settings
- [ ] Страница настроек LLM ключей

---

## Как сделать скриншоты

```python
# Пример через Playwright (уже есть в dev-зависимостях frontend)
# cd /home/clawdbot/projects/agentco/repo/frontend
# npx playwright screenshot https://ai-carti.github.io/agentco --output screenshots/

# Или через puppeteer/selenium
```

## Как сделать скринкаст

```bash
# Через ffmpeg + xvfb + playwright
# Или через playwright video recording:
# page.video() API
```

---

## Если что-то не работает

Создавай тикет (BUG-NNN) и фиксируй — но конечный результат не меняется: нужен полный проход по UI.

---

## Критерий закрытия

- [ ] 10+ скриншотов в `/home/clawdbot/projects/agentco/screenshots/demo/`
- [ ] Видео/скринкаст в `/home/clawdbot/projects/agentco/screencast/demo.mp4` (или GIF)
- [ ] Shadrin отправил всё Тиме (@timofeytst) в Telegram
