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

from agentco.orchestration.nodes import ceo_node, subagent_node, hierarchical_node
from agentco.orchestration.state import AgentState


# ─── Router (conditional edge) ────────────────────────────────────────────────

def _should_continue(state: AgentState) -> str:
    """
    Conditional edge после CEO node.

    Возможные переходы:
    - "subagent" — есть pending задачи → отправить к subagent
    - "__end__" — статус не "running" (error/completed/failed/done) → завершить

    ALEX-TD-133 fix: добавлен "done" в terminal set.
    execute_run сохраняет run.status="done" для успешных ранов — без этого
    граф входил в бесконечный цикл при status="done".
    """
    status = state.get("status", "running")

    if status in ("error", "completed", "failed", "done"):
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
    - "__end__" — статус не "running" (error/completed/failed/done) → завершить

    ALEX-TD-133 fix: добавлен "done" в terminal set (см. _should_continue).
    """
    status = state.get("status", "running")
    if status in ("error", "completed", "failed", "done"):
        return END

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

    # SubAgent → conditional: или ещё subagent, или обратно к CEO, или END
    graph.add_conditional_edges(
        "subagent",
        _after_subagent,
        {
            "subagent": "subagent",
            "ceo": "ceo",
            END: END,
        },
    )

    return graph


def compile(checkpointer=None):
    """
    Собрать и скомпилировать граф.

    Удобная функция для импорта: `from agentco.orchestration.graph import compile`.

    Args:
        checkpointer: опциональный LangGraph checkpointer (SqliteSaver / AsyncSqliteSaver)

    Returns:
        Compiled LangGraph graph ready for invoke/ainvoke.
    """
    graph = build_orchestration_graph()
    if checkpointer is not None:
        return graph.compile(checkpointer=checkpointer)
    return graph.compile()


# ─── POST-006: Hierarchical Graph (N levels) ──────────────────────────────────

def _should_continue_hierarchical(state: AgentState) -> str:
    """
    Conditional edge после CEO node в иерархическом графе.
    ALEX-TD-133 fix: добавлен "done" в terminal set.
    """
    status = state.get("status", "running")
    if status in ("error", "completed", "failed", "done"):
        return END
    if state.get("pending_tasks"):
        return "hierarchical"
    return "ceo"


def _after_hierarchical(state: AgentState) -> str:
    """
    Conditional edge после hierarchical node.
    ALEX-TD-133 fix: добавлен "done" в terminal set.
    """
    status = state.get("status", "running")
    if status in ("error", "completed", "failed", "done"):
        return END
    if state.get("pending_tasks"):
        return "hierarchical"
    return "ceo"


def build_hierarchical_graph(max_depth: int = 3) -> StateGraph:
    """
    POST-006: Строит StateGraph с поддержкой произвольной глубины иерархии.

    Граф поддерживает N уровней делегирования через единый hierarchical_node.
    Глубина контролируется через state["max_depth"] и task["depth"].

    Args:
        max_depth: максимальная глубина делегирования (default=3: CEO→L1→L2→leaf)

    Граф:
    START → ceo → [hierarchical → ceo]* → END
    """
    graph = StateGraph(AgentState)

    graph.add_node("ceo", ceo_node)
    graph.add_node("hierarchical", hierarchical_node)

    graph.add_edge(START, "ceo")

    graph.add_conditional_edges(
        "ceo",
        _should_continue_hierarchical,
        {
            "hierarchical": "hierarchical",
            "ceo": "ceo",
            END: END,
        },
    )

    graph.add_conditional_edges(
        "hierarchical",
        _after_hierarchical,
        {
            "hierarchical": "hierarchical",
            "ceo": "ceo",
            END: END,
        },
    )

    return graph


def compile_hierarchical(max_depth: int = 3, checkpointer=None):
    """
    Собрать и скомпилировать иерархический граф с поддержкой N уровней.

    Args:
        max_depth: максимальная глубина иерархии
        checkpointer: опциональный LangGraph checkpointer

    Returns:
        Compiled hierarchical graph.
    """
    graph = build_hierarchical_graph(max_depth=max_depth)
    if checkpointer is not None:
        return graph.compile(checkpointer=checkpointer)
    return graph.compile()
