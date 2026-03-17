"""
orchestration/state.py — AgentState TypedDict и вспомогательные типы.

AgentState — основное состояние графа, передаётся между узлами.
TaskMessage — сообщение о задаче (CEO → subagent).
TaskResult — результат выполнения задачи.
"""
from __future__ import annotations

from typing import Annotated, Literal, TypedDict

from langgraph.graph.message import add_messages


def _dict_merge(a: dict, b: dict) -> dict:
    """Кастомный reducer для dict: мержит b поверх a (не перезаписывает весь dict)."""
    return {**a, **b}


class TaskMessage(TypedDict):
    """Задача, делегируемая от одного агента другому."""

    task_id: str          # UUID задачи
    from_agent_id: str    # кто поставил задачу
    to_agent_id: str      # кому назначена
    description: str      # текст задачи
    context: dict         # дополнительный контекст


class TaskResult(TypedDict):
    """Результат выполнения задачи агентом."""

    task_id: str
    agent_id: str
    status: Literal["done", "failed", "delegated"]
    result: str
    delegated_tasks: list[TaskMessage]
    tokens_used: int
    cost_usd: float


class AgentState(TypedDict):
    """Полное состояние выполнения Run в LangGraph StateGraph."""

    # Входные данные Run
    run_id: str
    company_id: str
    input: str

    # Сообщения (LangGraph reducer: add_messages аппендит, не перезаписывает)
    messages: Annotated[list, add_messages]

    # Очередь задач
    pending_tasks: list[TaskMessage]          # ожидают выполнения
    active_tasks: dict[str, TaskMessage]      # task_id → в работе
    results: Annotated[dict, _dict_merge]     # task_id → результаты (merge reducer)

    # Метрики
    iteration_count: int
    total_tokens: int
    total_cost_usd: float

    # Идентификатор агента и уровень в иерархии
    agent_id: str       # текущий агент (ceo / subagent / swe-001 etc.)
    level: int          # уровень в иерархии: 0 = CEO, 1 = CTO/PM, 2 = SWE

    # Управление выполнением
    status: Literal["running", "completed", "failed", "error"]
    error: str | None
    final_result: str | None
