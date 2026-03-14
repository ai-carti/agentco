# ADR M2-001 — Orchestration Protocol

**Status:** Accepted  
**Date:** 2026-03-14  
**Author:** Alex (CTO / Lead Backend)  
**Ticket:** M2-001 (Milestone 2 — Orchestration + War Room)  

---

## Контекст

AgentCo — платформа для создания иерархических команд AI-агентов. Пользователь создаёт компанию с набором агентов (CEO, CPO, SWE и т.д.) и запускает **Run** — сеанс выполнения задачи командой агентов.

Проблемы без оркестрации:
- Нет способа передать задачу от CEO к подчинённым и дождаться результата
- Нет сохранения промежуточного состояния (обрыв соединения = потеря прогресса)
- Нет защиты от бесконечных циклов (агент гоняет задачу в петле)
- Нет реального прогресса в War Room UI — нужен стриминг событий

Требования к оркестратору:
1. Иерархия агентов произвольной глубины: CEO → менеджеры → исполнители
2. Персистентное состояние: можно возобновить после краша
3. Детекция петель: лимит итераций и лимит стоимости
4. Стриминг событий в War Room через WebSocket

---

## Решение

### LangGraph StateGraph + иерархия CEO → N уровней

Выбран **LangGraph** (`langgraph>=0.2`) как оркестратор.

**Ключевые свойства:**

| Свойство | Значение |
|----------|----------|
| Граф | `StateGraph` — направленный граф с узлами-агентами |
| State | Типизированный `TypedDict`, передаётся между узлами |
| Checkpointing | `SqliteSaver` — сохраняет state в SQLite после каждого шага |
| Прерывания | `interrupt_before` / `interrupt_after` — точки паузы |
| Потоки | `.astream_events()` — async-генератор событий |

---

## Иерархия агентов

```
Run (точка входа)
└── CEO Node
    ├── SubAgent Node A (менеджер)
    │   ├── SubAgent Node A1 (исполнитель)
    │   └── SubAgent Node A2 (исполнитель)
    └── SubAgent Node B (менеджер)
        └── SubAgent Node B1 (исполнитель)
```

**Реализация иерархии через subgraph:**

Каждый агент с подчинёнными компилируется как отдельный `StateGraph` и монтируется как `subgraph` в родительский граф. Это позволяет:
- Изолировать состояние подграфа
- Переиспользовать субграфы
- Поддерживать произвольную глубину

---

## Протокол коммуникации между агентами

### Модель: Task Delegation

CEO не вызывает подчинённого напрямую — он создаёт **TaskMessage** и добавляет его в очередь. Подчинённый берёт задачу, выполняет, возвращает **TaskResult**.

```python
class TaskMessage(TypedDict):
    task_id: str          # UUID задачи
    from_agent_id: str    # кто поставил задачу
    to_agent_id: str      # кому назначена
    description: str      # текст задачи
    context: dict         # дополнительный контекст (результаты других агентов)

class TaskResult(TypedDict):
    task_id: str
    agent_id: str
    status: Literal["done", "failed", "delegated"]
    result: str           # текстовый результат
    delegated_tasks: list[TaskMessage]  # если агент делегировал подзадачи
    tokens_used: int
    cost_usd: float
```

### Флоу CEO → подчинённый

```
1. CEO получает RunInput (задача + контекст компании)
2. CEO вызывает LLM → генерирует список TaskMessage для подчинённых
3. TaskMessage → помещаются в state.pending_tasks
4. Router Node → читает pending_tasks, диспатчит к нужным агентам
5. SubAgent Node → берёт свой TaskMessage, выполняет, возвращает TaskResult
6. TaskResult → аккумулируется в state.results
7. CEO получает все results → синтезирует финальный ответ → Run завершён
```

---

## Схема состояния графа (GraphState)

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # Входные данные Run
    run_id: str
    company_id: str
    input: str                          # задача пользователя

    # Сообщения (LangGraph reducer: add_messages добавляет, не перезаписывает)
    messages: Annotated[list, add_messages]

    # Очередь задач
    pending_tasks: list[TaskMessage]    # задачи ожидающие выполнения
    active_tasks: dict[str, TaskMessage]  # task_id → задачи в работе
    results: dict[str, TaskResult]      # task_id → результаты

    # Метрики выполнения
    iteration_count: int                # счётчик итераций CEO-цикла
    total_tokens: int                   # суммарные токены по всему run
    total_cost_usd: float               # суммарная стоимость

    # Управление
    status: Literal["running", "completed", "failed", "loop_detected", "cost_exceeded"]
    error: str | None                   # сообщение об ошибке
    final_result: str | None            # финальный результат CEO
```

**Важно:** LangGraph редьюсеры управляют тем, как state обновляется при параллельных узлах. `add_messages` — встроенный редьюсер, который аппендит сообщения, а не перезаписывает. Для `results` используем кастомный `dict_merge` редьюсер.

---

## Checkpointing (SQLite)

LangGraph сохраняет полный `AgentState` в SQLite после каждого узла через `SqliteSaver`.

```python
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# Инициализация checkpointer (один экземпляр на приложение)
async def get_checkpointer() -> AsyncSqliteSaver:
    return AsyncSqliteSaver.from_conn_string("agentco.db")

# Компиляция графа с checkpointer
checkpointer = await get_checkpointer()
graph = build_orchestration_graph()
compiled = graph.compile(checkpointer=checkpointer)

# Запуск Run с thread_id = run_id (позволяет возобновить)
config = {"configurable": {"thread_id": run_id}}
async for event in compiled.astream_events(initial_state, config=config):
    await event_bus.publish(run_id, event)
```

**Схема хранения в SQLite (создаётся автоматически LangGraph):**

```sql
-- LangGraph создаёт эти таблицы сам:
-- checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
-- checkpoint_blobs (thread_id, checkpoint_ns, channel, type, blob)
-- checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, blob)
```

**Возобновление после краша:**

```python
# Получить последнее состояние Run
state = await compiled.aget_state(config)
# Возобновить с последней точки
async for event in compiled.astream_events(None, config=config):
    ...
```

---

## Loop Detection

Бесконечные циклы возможны когда:
- CEO делегирует задачу → SubAgent делегирует обратно CEO → петля
- CEO не может завершить задачу и продолжает генерировать подзадачи

**Два механизма защиты:**

### 1. Лимит итераций

```python
MAX_ITERATIONS = 10  # конфигурируется через env MAX_AGENT_ITERATIONS

def ceo_node(state: AgentState) -> AgentState:
    if state["iteration_count"] >= MAX_ITERATIONS:
        return {
            "status": "loop_detected",
            "error": f"Max iterations ({MAX_ITERATIONS}) exceeded",
        }
    # ... выполнение CEO
    return {"iteration_count": state["iteration_count"] + 1, ...}
```

### 2. Лимит стоимости (cost limit)

```python
MAX_COST_USD = 1.0  # конфигурируется через env MAX_RUN_COST_USD

def check_cost_limit(state: AgentState) -> AgentState:
    if state["total_cost_usd"] >= MAX_COST_USD:
        return {
            "status": "cost_exceeded",
            "error": f"Cost limit ${MAX_COST_USD} exceeded (spent ${state['total_cost_usd']:.4f})",
        }
    return state
```

**Маршрутизация на основе статуса:**

```python
def should_continue(state: AgentState) -> str:
    """Conditional edge: решает продолжать ли выполнение."""
    if state["status"] in ("loop_detected", "cost_exceeded", "failed"):
        return "end"
    if state["pending_tasks"]:
        return "dispatch"
    if not state["active_tasks"] and not state["pending_tasks"]:
        return "ceo_finalize"
    return "wait"
```

---

## EventBus: asyncio.Queue → WebSocket

Каждый Run имеет свою очередь событий. Граф публикует события, WebSocket-хендлер читает и отправляет клиенту.

### Структура события

```python
class RunEvent(TypedDict):
    run_id: str
    event_type: Literal[
        "run_started", "run_completed", "run_failed",
        "agent_started", "agent_completed", "agent_failed",
        "task_created", "task_completed",
        "llm_token",        # streaming токен от LLM
        "llm_chunk",        # чанк завершения
        "loop_detected", "cost_exceeded",
    ]
    agent_id: str | None
    task_id: str | None
    data: dict              # payload специфичный для event_type
    timestamp: str          # ISO 8601
```

### EventBus implementation

```python
import asyncio
from collections import defaultdict

class EventBus:
    """In-process event bus: граф → asyncio.Queue → WebSocket."""
    
    def __init__(self):
        self._queues: dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)
    
    async def publish(self, run_id: str, event: RunEvent) -> None:
        await self._queues[run_id].put(event)
    
    async def subscribe(self, run_id: str) -> AsyncIterator[RunEvent]:
        queue = self._queues[run_id]
        while True:
            event = await queue.get()
            yield event
            if event["event_type"] in ("run_completed", "run_failed", "loop_detected", "cost_exceeded"):
                break
    
    def cleanup(self, run_id: str) -> None:
        self._queues.pop(run_id, None)

# Singleton (создаётся при старте FastAPI)
event_bus = EventBus()
```

### WebSocket хендлер (M2-005)

```python
@router.websocket("/ws/runs/{run_id}")
async def run_websocket(websocket: WebSocket, run_id: str):
    await websocket.accept()
    try:
        async for event in event_bus.subscribe(run_id):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass

# Запуск Run (M2-004)
@router.post("/api/companies/{company_id}/runs", status_code=201)
async def start_run(company_id: str, body: RunCreate, ...):
    run_id = str(uuid.uuid4())
    # Стартуем граф в background task
    asyncio.create_task(
        execute_run(run_id, company_id, body.input, event_bus)
    )
    return {"run_id": run_id, "status": "running"}
```

### Публикация событий из графа

LangGraph `.astream_events()` возвращает стандартные события LangGraph. Адаптер конвертирует их в `RunEvent`:

```python
async def execute_run(run_id: str, company_id: str, input: str, bus: EventBus):
    await bus.publish(run_id, RunEvent(event_type="run_started", run_id=run_id, ...))
    
    config = {"configurable": {"thread_id": run_id}}
    initial_state = AgentState(run_id=run_id, company_id=company_id, input=input, ...)
    
    async for lg_event in compiled_graph.astream_events(initial_state, config=config, version="v2"):
        run_event = adapt_langgraph_event(lg_event, run_id)
        if run_event:
            await bus.publish(run_id, run_event)
    
    final_state = await compiled_graph.aget_state(config)
    if final_state.values["status"] == "completed":
        await bus.publish(run_id, RunEvent(event_type="run_completed", ...))
    else:
        await bus.publish(run_id, RunEvent(event_type="run_failed", ...))
```

---

## Альтернативы, которые рассматривались

### 1. Celery + Redis
**Почему отвергнуто:** Нарушает принцип "один процесс, ноль внешних сервисов". Redis — внешний сервис. Celery добавляет значительную сложность без прироста для нашего масштаба.

### 2. Кастомный рекурсивный вызов агентов (вручную)
**Почему отвергнуто:** Нет встроенного checkpointing. При падении процесса — потеря всего прогресса Run. Нужно самим имплементировать детекцию циклов, сохранение state, возобновление. LangGraph даёт это из коробки.

### 3. CrewAI
**Почему отвергнуто:** Менее гибкий граф, хуже поддерживает произвольную иерархию. LangGraph — более низкоуровневый, даёт полный контроль над структурой графа и state.

### 4. AutoGen (Microsoft)
**Почему отвергнуто:** Actor-based model хуже подходит для иерархической структуры. Сложнее интегрировать с FastAPI/WebSocket стримингом. Нет нативного checkpointing в SQLite.

### 5. Простой while-loop с промптами
**Почему отвергнуто:** Не масштабируется, нет checkpointing, нет стриминга, нет детекции циклов без ad-hoc кода.

---

## Последствия решения

### Плюсы

- **Checkpointing из коробки** — Run можно возобновить после краша сервера без потери прогресса
- **Стриминг событий** — `.astream_events()` нативно поддерживает LLM-стриминг токенов для War Room
- **Граф = документация** — структура иерархии видна в коде как граф, не как вложенные вызовы
- **Детекция петель** — итерационный счётчик + cost limit защищают от runaway агентов
- **SQLite** — нет новых зависимостей, тот же файл БД что и для основных данных
- **Тестируемость** — граф можно тестировать без реального LLM через мок LiteLLM

### Минусы / риски

- **LangGraph API нестабилен** — активно меняется между minor версиями. Pinning `langgraph==0.2.x` обязателен.
- **SqliteSaver thread safety** — SQLite WAL режим нужен (уже включён в `session.py`). При параллельных Run возможны lock contention.
- **Один процесс** — нет горизонтального масштабирования. Для MVP приемлемо. Post-MVP: Postgres checkpointer + Redis EventBus.
- **asyncio.Queue** — In-process EventBus не работает при нескольких воркерах uvicorn. В production: `--workers 1` или вынести в Redis Pub/Sub.

### Требования к имплементации M2-002

При кодинге M2-002 следовать этому ADR:
1. Файл `backend/src/agentco/orchestration/graph.py` — граф и компиляция
2. Файл `backend/src/agentco/orchestration/nodes.py` — CEO и SubAgent узлы
3. Файл `backend/src/agentco/orchestration/state.py` — `AgentState`, `TaskMessage`, `TaskResult`
4. Файл `backend/src/agentco/orchestration/event_bus.py` — `EventBus` singleton
5. Файл `backend/src/agentco/orchestration/checkpointer.py` — инициализация `AsyncSqliteSaver`
6. Тесты: `backend/tests/test_orchestration.py` — TDD, мокировать LLM через `litellm.mock_completion`

---

## Зависимости

Добавить в `pyproject.toml`:
```toml
[project.dependencies]
langgraph = ">=0.2,<0.3"
langgraph-checkpoint-sqlite = ">=1.0"
```

---

*ADR создан: 2026-03-14 | Alex (CTO)*
