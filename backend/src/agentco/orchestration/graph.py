"""
orchestration/graph.py — LangGraph StateGraph: CEO → subagents иерархия.

Архитектура:
- CEO node: получает задачу, делегирует subagent-ам, финализирует результат
- SubAgent node: выполняет задачи от CEO
- Router: conditional edge — решает следующий узел по состоянию
- Loop detection: вшита в CEO node (проверяет MAX_ITERATIONS + MAX_COST_USD)
"""
from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from agentco.orchestration.nodes import ceo_node, subagent_node
from agentco.orchestration.state import AgentState


# ─── Router (conditional edge) ────────────────────────────────────────────────

def _should_continue(state: AgentState) -> str:
    """
    Conditional edge после CEO node.

    Возможные переходы:
    - "subagent" — есть pending задачи → отправить к subagent
    - "__end__" — статус не "running" (error/completed/failed) → завершить
    """
    status = state.get("status", "running")

    if status in ("error", "completed", "failed"):
        return END

    if state.get("pending_tasks"):
        return "subagent"

    # Нет pending задач и не финализировано — продолжаем CEO
    return "ceo"


def _after_subagent(state: AgentState) -> str:
    """
    Conditional edge после SubAgent node.

    - "ceo" — subagent завершил задачи → CEO синтезирует результат
    - "subagent" — ещё есть pending задачи → продолжаем выполнять
    """
    if state.get("pending_tasks"):
        return "subagent"
    return "ceo"


# ─── Graph builder ────────────────────────────────────────────────────────────

def build_orchestration_graph() -> StateGraph:
    """
    Строит StateGraph с иерархией CEO → SubAgent.

    Граф:
    START → ceo → [subagent → ceo]* → END
    """
    graph = StateGraph(AgentState)

    # Узлы
    graph.add_node("ceo", ceo_node)
    graph.add_node("subagent", subagent_node)

    # Рёбра
    graph.add_edge(START, "ceo")

    # CEO → conditional: или к subagent, или к END
    graph.add_conditional_edges(
        "ceo",
        _should_continue,
        {
            "subagent": "subagent",
            "ceo": "ceo",
            END: END,
        },
    )

    # SubAgent → conditional: или ещё subagent, или обратно к CEO
    graph.add_conditional_edges(
        "subagent",
        _after_subagent,
        {
            "subagent": "subagent",
            "ceo": "ceo",
        },
    )

    return graph
