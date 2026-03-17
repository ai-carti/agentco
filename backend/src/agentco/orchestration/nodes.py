"""
orchestration/nodes.py — CEO node и SubAgent node.

Mock LLM через litellm.mock_completion — реальный LLM не вызывается в этом тикете.
Loop detection: MAX_ITERATIONS (env MAX_AGENT_ITERATIONS, default=20)
              + MAX_COST_USD (env MAX_RUN_COST_USD, default=1.0)
              + MAX_TOKENS (env MAX_RUN_TOKENS, default=100000)
"""
from __future__ import annotations

import os
import uuid
from typing import Any

import litellm

from agentco.orchestration.state import AgentState, TaskMessage, TaskResult

# ─── Константы loop detection ─────────────────────────────────────────────────

def _get_max_iterations() -> int:
    return int(os.environ.get("MAX_AGENT_ITERATIONS", "20"))


def _get_max_cost_usd() -> float:
    return float(os.environ.get("MAX_RUN_COST_USD", "1.0"))


def _get_max_tokens() -> int:
    return int(os.environ.get("MAX_RUN_TOKENS", "100000"))


# ─── Mock LLM helper ──────────────────────────────────────────────────────────

def _mock_llm_call(system: str, user: str, mock_response: str) -> tuple[str, int, float]:
    """Вызвать mock LLM, вернуть (response_text, tokens_used, cost_usd)."""
    response = litellm.mock_completion(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        mock_response=mock_response,
    )
    tokens = response.usage.total_tokens if response.usage else 30
    # mock cost: $0.01 per 1K tokens
    cost = tokens * 0.00001
    return response.choices[0].message.content, tokens, cost


# ─── CEO Node ─────────────────────────────────────────────────────────────────

def ceo_node(state: AgentState) -> dict:
    """
    CEO Node — точка входа иерархии.

    Поведение:
    1. Проверяет loop detection (MAX_ITERATIONS, MAX_COST_USD) → если превышено, status=error
    2. Если уже есть results (subagent завершил работу) → синтезирует финальный ответ, status=completed
    3. Иначе → делегирует задачу одному subagent-у через pending_tasks
    """
    max_iter = _get_max_iterations()
    max_cost = _get_max_cost_usd()

    max_tokens = _get_max_tokens()

    # ── Loop detection: лимит итераций ────────────────────────────────────────
    if state["iteration_count"] >= max_iter:
        return {
            "status": "failed",
            "error": "loop_detected",
            "error_detail": f"Max iterations ({max_iter}) exceeded at iteration {state['iteration_count']}",
        }

    # ── Loop detection: лимит стоимости (USD или токены) ──────────────────────
    if state["total_cost_usd"] >= max_cost:
        return {
            "status": "failed",
            "error": "cost_limit_exceeded",
            "error_detail": (
                f"Cost limit ${max_cost:.4f} exceeded "
                f"(spent ${state['total_cost_usd']:.4f})"
            ),
        }

    if state["total_tokens"] >= max_tokens:
        return {
            "status": "failed",
            "error": "cost_limit_exceeded",
            "error_detail": (
                f"Token limit {max_tokens} exceeded "
                f"(used {state['total_tokens']} tokens)"
            ),
        }

    # ── Если есть результаты от subagent-ов — финализировать ─────────────────
    if state["results"] and not state["pending_tasks"] and not state["active_tasks"]:
        results_summary = "; ".join(
            f"{tid}: {r['result']}" for tid, r in state["results"].items()
        )
        final_answer, tokens, cost = _mock_llm_call(
            system="You are a CEO. Synthesize the results from your team.",
            user=f"Task: {state['input']}\nTeam results: {results_summary}",
            mock_response=f"Final result: {results_summary}",
        )
        return {
            "iteration_count": state["iteration_count"] + 1,
            "total_tokens": state["total_tokens"] + tokens,
            "total_cost_usd": state["total_cost_usd"] + cost,
            "final_result": final_answer,
            "status": "completed",
        }

    # ── Делегирование задачи subagent-у ───────────────────────────────────────
    task_id = str(uuid.uuid4())
    task: TaskMessage = {
        "task_id": task_id,
        "from_agent_id": "ceo",
        "to_agent_id": "subagent",
        "description": state["input"],
        "context": {"run_id": state["run_id"]},
    }

    _, tokens, cost = _mock_llm_call(
        system="You are a CEO. Delegate tasks to your team.",
        user=f"Delegate this task: {state['input']}",
        mock_response=f"Delegating to subagent: task_id={task_id}",
    )

    return {
        "iteration_count": state["iteration_count"] + 1,
        "total_tokens": state["total_tokens"] + tokens,
        "total_cost_usd": state["total_cost_usd"] + cost,
        "pending_tasks": state["pending_tasks"] + [task],
        "active_tasks": {**state["active_tasks"], task_id: task},
    }


# ─── SubAgent Node ────────────────────────────────────────────────────────────

def subagent_node(state: AgentState) -> dict:
    """
    SubAgent Node — выполняет задачи из pending_tasks.

    Берёт первую pending task, выполняет (mock), возвращает TaskResult.
    """
    if not state["pending_tasks"]:
        # Нет задач — ничего не делаем
        return {}

    # Берём первую задачу
    task = state["pending_tasks"][0]
    remaining_tasks = state["pending_tasks"][1:]

    task_id = task["task_id"]

    # Mock выполнение через LLM
    result_text, tokens, cost = _mock_llm_call(
        system=f"You are a subagent with ID: {task['to_agent_id']}. Execute the assigned task.",
        user=f"Task: {task['description']}",
        mock_response=f"Completed task: {task['description'][:50]}",
    )

    task_result: TaskResult = {
        "task_id": task_id,
        "agent_id": task["to_agent_id"],
        "status": "done",
        "result": result_text,
        "delegated_tasks": [],
        "tokens_used": tokens,
        "cost_usd": cost,
    }

    # Убираем задачу из active_tasks
    new_active = {k: v for k, v in state["active_tasks"].items() if k != task_id}

    return {
        "pending_tasks": remaining_tasks,
        "active_tasks": new_active,
        "results": {task_id: task_result},
        "total_tokens": state["total_tokens"] + tokens,
        "total_cost_usd": state["total_cost_usd"] + cost,
    }
