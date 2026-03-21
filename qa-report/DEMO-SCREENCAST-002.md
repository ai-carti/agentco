# DEMO-SCREENCAST-002 — Success Story пользователя: скрины/скринкаст полного пайплайна

**Priority:** 🔴 ДЕДЛАЙН СЕГОДНЯ 2026-03-21 (просрочено)
**Assign to:** Siri + Alisa
**Status:** OPEN — немедленно

---

## Контекст

Тима лично тестировал прод и не смог пройти базовый флоу. Ему нужно увидеть **работающий продукт** — не просто что-то задеплоено, а реальный пайплайн от регистрации до запуска агента.

**Сначала исправить баги BUG-101..107, потом делать этот тикет.**

---

## Конечный результат

Набор скриншотов (PNG) + скринкаст (MP4 или GIF) всего success story:

### Обязательный пайплайн для съёмки:

1. **Страница логина** — чистый UI
2. **Регистрация** → форма → успешный вход
3. **Dashboard** — список компаний (пустой state с onboarding)
4. **Создание компании** → компания появляется в списке
5. **War Room** — открыт, агенты видны
6. **Kanban** — создать задачу → переместить в In Progress
7. **Создание агента** — форма с именем + LLM моделью
8. **Запуск агента** → логи в реалтайме → статус done
9. **Task Detail** — сайдбар с деталями задачи и логами
10. **Settings** — страница с LLM credentials

### Что надо по итогу:
- Папка `/home/clawdbot/projects/agentco/screenshots/demo/` — 10+ PNG
- Файл `/home/clawdbot/projects/agentco/screencast/demo.mp4` или `demo.gif`
- Shadrin отправляет всё Тиме в Telegram (@timofeytst, id: 667566350)

---

## Инструменты

```bash
# Playwright для скриншотов
cd /home/clawdbot/projects/agentco/repo/frontend
npx playwright install chromium
npx playwright screenshot URL --output /path/to/file.png

# Playwright для записи видео
# Использовать page.video() в тесте
```

---

## Credentials

```
Frontend: https://ai-carti.github.io/agentco
Backend:  https://agentco-backend-production.up.railway.app
Email:    demo@agentco.ai
Password: Demo1234!
```

---

## Важно

Если баги мешают снять скринкаст — **сначала чинить баги** (BUG-101..107), потом скринкаст.
Дедлайн не двигается.
