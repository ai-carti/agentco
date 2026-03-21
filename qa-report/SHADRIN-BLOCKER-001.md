# SHADRIN-BLOCKER-001 — БЛОКЕР: Отчёт не отправлен Тиме. Спринт не закрывать.

**Priority:** 🚨 БЛОКЕР — выше всего остального
**Assign to:** Shadrin (контроль и ответственность)
**Date:** 2026-03-21
**Status:** OPEN — НЕ ЗАКРЫВАТЬ пока не выполнено

---

## ⛔ ПРАВИЛО

**Спринт считается закрытым ТОЛЬКО ЕСЛИ:**
1. ✅ Скринкаст (видео или GIF) полного пайплайна отправлен @timofeytst в Telegram
2. ✅ Скриншоты всех основных экранов (10+ PNG) отправлены @timofeytst в Telegram
3. ✅ Продукт работает на проде: Register → Company → Kanban → Agent Run

**Пока эти 3 пункта не выполнены — никакой работы кроме этого.**

---

## Что нужно сделать прямо сейчас

### Шаг 1 — Проверить что прод работает
```
Frontend: https://ai-carti.github.io/agentco
Backend:  https://agentco-backend-production.up.railway.app/health
```
Если что-то не работает — создать тикет и починить НЕМЕДЛЕННО.

### Шаг 2 — Сделать скриншоты (Siri)
Установить Playwright, зайти на прод, пройти весь пайплайн, сохранить скрины:
```
/home/clawdbot/projects/agentco/screenshots/demo/01-login.png
/home/clawdbot/projects/agentco/screenshots/demo/02-register.png
/home/clawdbot/projects/agentco/screenshots/demo/03-dashboard.png
/home/clawdbot/projects/agentco/screenshots/demo/04-company-created.png
/home/clawdbot/projects/agentco/screenshots/demo/05-warroom.png
/home/clawdbot/projects/agentco/screenshots/demo/06-kanban.png
/home/clawdbot/projects/agentco/screenshots/demo/07-agent-form.png
/home/clawdbot/projects/agentco/screenshots/demo/08-agent-run.png
/home/clawdbot/projects/agentco/screenshots/demo/09-task-detail.png
/home/clawdbot/projects/agentco/screenshots/demo/10-settings.png
```

### Шаг 3 — Сделать скринкаст (Siri или Alex)
Записать видео прохода по продукту. Сохранить в:
```
/home/clawdbot/projects/agentco/screencast/agentco-demo.mp4
```
Или GIF если mp4 не получается.

### Шаг 4 — Shadrin отправляет всё Тиме в Telegram
```
Target: @timofeytst (id: 667566350)
Channel: telegram
```
Использовать message tool для отправки каждого файла.

---

## Иерархия

- **Shadrin** — контролирует выполнение, не закрывает спринт без отчёта
- **Siri** — делает скриншоты и скринкаст
- **Alex** — помогает с инфраструктурой если прод сломан
- **Alisa** — QA: проверяет что скрины показывают реально работающий продукт

---

## Telegram credentials для отправки
```python
# Shadrin использует message tool:
# action: send
# channel: telegram  
# target: 667566350
# filePath: /home/clawdbot/projects/agentco/screenshots/demo/XX-name.png
# caption: "AgentCo Demo — [название экрана]"
```

---

**Тима устал ждать. Это последнее предупреждение по этому вопросу.**
