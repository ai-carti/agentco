"""
orchestration/nodes.py — CEO node и SubAgent node.

АРХИТЕКТУРА (ALEX-TD-123):
  Этот файл реализует HIERARCHY ORCHESTRATION (CEO → SubAgent делегирование).
  Он НЕ является тест-заглушкой — это production-код координации агентов.

  LLM вызовы здесь нужны только для принятия решений о делегировании:
  "Как CEO должен декомпозировать задачу?" / "Как subagent должен её выполнить?"

  По умолчанию используется litellm.mock_completion — это ускоряет разработку и тесты.
  Для production с реальным LLM: установить AGENTCO_USE_REAL_LLM=true.
  При этом узлы будут использовать litellm.acompletion вместо mock_completion.

  РЕАЛЬНАЯ LLM-логика (стриминг, tool_calls, memory injection) живёт в agent_node.py.
  Если нужны streaming LLM calls в hierarchy nodes — используй agent_node вместо _mock_llm_call.

Loop detection: MAX_ITERATIONS (env MAX_AGENT_ITERATIONS, default=20)
              + MAX_COST_USD (env MAX_RUN_COST_USD, default=1.0)
              + MAX_TOKENS (env MAX_RUN_TOKENS, default=100000)

ALEX-TD-027: все три node-функции конвертированы в async def.
_mock_llm_call обёрнут через asyncio.run_in_executor — sync вызов
litellm.mock_completion не блокирует event loop при реальных async LLM-вызовах.
"""
from __future__ import annotations

import asyncio
import functools
import logging
import os
import uuid
from typing import Any

import litellm

from agentco.orchestration.state import AgentState, TaskMessage, TaskResult

# ALEX-TD-247: add module-level logger for diagnostics
logger = logging.getLogger(__name__)

# ─── Константы loop detection ─────────────────────────────────────────────────

def _get_max_iterations() -> int:
    return int(os.environ.get("MAX_AGENT_ITERATIONS", "20"))


def _get_max_cost_usd() -> float:
    return float(os.environ.get("MAX_RUN_COST_USD", "1.0"))


def _get_max_tokens() -> int:
    return int(os.environ.get("MAX_RUN_TOKENS", "100000"))


def _get_max_pending_tasks() -> int:
    """ALEX-TD-270: max allowed pending_tasks count to prevent unbounded queue growth.

    Without a limit, a buggy goal or adversarial input could cause CEO to add hundreds
    of tasks in a single iteration → memory bloat + excessive LLM calls + checkpointer
    DB growth (each large state = large msgpack blob at each checkpoint).
    Configurable via AGENT_MAX_PENDING_TASKS env var (default: 20).
    """
    return int(os.environ.get("AGENT_MAX_PENDING_TASKS", "20"))


def _get_max_depth() -> int:
    """ALEX-TD-277: configurable max hierarchy depth via MAX_AGENT_DEPTH env var.

    Subagent/hierarchical nodes use state.get("max_depth", 2) as default when
    execute_run does not populate initial_state["max_depth"]. This getter provides
    a consistent source of truth and env-configurable default.
    Configurable via MAX_AGENT_DEPTH env var (default: 2).
    """
    return int(os.environ.get("MAX_AGENT_DEPTH", "2"))


# ─── Module-level cached env vars (ALEX-TD-279, ALEX-TD-282) ─────────────────
# Read once at import time; restart process to pick up env changes.
# Avoids 60+ os.environ lookups per run in hot path.
_USE_REAL_LLM: bool = os.environ.get("AGENTCO_USE_REAL_LLM", "").lower() in ("true", "1", "yes")
_AGENTCO_ORCHESTRATION_MODEL: str = os.environ.get("AGENTCO_ORCHESTRATION_MODEL", "gpt-4o-mini")
_LLM_CALL_TIMEOUT: float = float(os.environ.get("LLM_CALL_TIMEOUT_SEC", "120"))


# ─── Mock LLM helper ──────────────────────────────────────────────────────────

def _sync_mock_llm_call(system: str, user: str, mock_response: str) -> tuple[str, int, float]:
    """Синхронный вызов mock LLM (для обёртки в run_in_executor)."""
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


async def _mock_llm_call(system: str, user: str, mock_response: str) -> tuple[str, int, float]:
    """
    Async-ready LLM вызов для hierarchy orchestration nodes.

    По умолчанию использует litellm.mock_completion (быстро, без API ключей).
    При AGENTCO_USE_REAL_LLM=true — использует litellm.acompletion с моделью gpt-4o-mini.

    ALEX-TD-123: env-flag позволяет переключать между mock и реальным LLM.
    Это не тест-заглушка — это production-код, по умолчанию оптимизированный
    для разработки/тестирования. Streaming/memory/tool_calls — в agent_node.py.
    """
    # ALEX-TD-279/282: use module-level cached values (not re-read on each call)
    if _USE_REAL_LLM:
        # Real LLM path — used in production when AGENTCO_USE_REAL_LLM=true
        # ALEX-TD-185: wrap in wait_for to prevent hung LLM call from blocking event loop.
        # agent_node.py already does this (ALEX-TD-158) — mirror that pattern here.
        _model = _AGENTCO_ORCHESTRATION_MODEL
        _timeout = _LLM_CALL_TIMEOUT
        # ALEX-TD-247: log real LLM call for diagnostics
        logger.debug("_mock_llm_call: real LLM path, model=%s", _model)
        try:
            response = await asyncio.wait_for(
                litellm.acompletion(
                    model=_model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    max_tokens=500,
                ),
                timeout=_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("_mock_llm_call: LLM timeout after %ss for model=%s", _timeout, _model)
            raise
        except Exception as e:
            logger.warning("_mock_llm_call: LLM error for model=%s: %s", _model, e, exc_info=True)
            raise
        content = response.choices[0].message.content or ""
        tokens = response.usage.total_tokens if response.usage else 50
        cost = tokens * 0.00015 / 1000  # gpt-4o-mini rate
        return content, tokens, cost
    else:
        # Default: mock_completion (dev/test mode, no API key required)
        loop = asyncio.get_running_loop()
        fn = functools.partial(_sync_mock_llm_call, system, user, mock_response)
        return await loop.run_in_executor(None, fn)


# ─── CEO Node ─────────────────────────────────────────────────────────────────

async def ceo_node(state: AgentState) -> dict:
    """
    CEO Node — точка входа иерархии (async def — ALEX-TD-027).

    Поведение:
    1. Проверяет loop detection (MAX_ITERATIONS, MAX_COST_USD) → если превышено, status=error
    2. Если уже есть results (subagent завершил работу) → синтезирует финальный ответ, status=completed
    3. Иначе → делегирует задачу одному subagent-у через pending_tasks
    """
    # ALEX-TD-247: log node entry for diagnostics
    logger.debug(
        "ceo_node: run_id=%s iteration=%d tokens=%d cost=%.4f",
        state.get("run_id"), state.get("iteration_count", 0),
        state.get("total_tokens", 0), state.get("total_cost_usd", 0.0),
    )
    max_iter = _get_max_iterations()
    max_cost = _get_max_cost_usd()

    max_tokens = _get_max_tokens()

    # ── Loop detection: лимит итераций ────────────────────────────────────────
    if state["iteration_count"] >= max_iter:
        return {
            "status": "failed",
            "error": "loop_detected",
            "error_detail": f"Max iterations ({max_iter}) exceeded at iteration {state['iteration_count']}",
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
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
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }

    if state["total_tokens"] >= max_tokens:
        return {
            "status": "failed",
            "error": "token_limit_exceeded",
            "error_detail": (
                f"Token limit {max_tokens} exceeded "
                f"(used {state['total_tokens']} tokens)"
            ),
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }

    # ── Если есть результаты от subagent-ов — финализировать ─────────────────
    if state["results"] and not state["pending_tasks"] and not state["active_tasks"]:
        results_summary = "; ".join(
            f"{tid}: {r['result']}" for tid, r in state["results"].items()
        )
        final_answer, tokens, cost = await _mock_llm_call(
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

    # ALEX-TD-270: guard against unbounded pending_tasks growth.
    # Without this check, a buggy goal or adversarial input could cause CEO to add
    # hundreds of tasks → memory bloat + excessive LLM calls + checkpointer DB growth.
    max_pending = _get_max_pending_tasks()
    if len(state["pending_tasks"]) >= max_pending:
        logger.warning(
            "ceo_node: max_pending_tasks_exceeded run_id=%s pending=%d limit=%d",
            state.get("run_id"), len(state["pending_tasks"]), max_pending,
        )
        return {
            "status": "failed",
            "error": "max_pending_tasks_exceeded",
            "error_detail": (
                f"Pending tasks limit {max_pending} exceeded "
                f"(current: {len(state['pending_tasks'])})"
            ),
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }

    # ── Делегирование задачи subagent-у ───────────────────────────────────────
    task_id = str(uuid.uuid4())
    current_level = state.get("level", 0)
    # POST-006: track depth in TaskMessage
    task: TaskMessage = {
        "task_id": task_id,
        "from_agent_id": state.get("agent_id", "ceo"),
        "to_agent_id": "subagent",
        "description": state["input"],
        "context": {"run_id": state["run_id"]},
        "depth": current_level + 1,
    }

    _, tokens, cost = await _mock_llm_call(
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

async def subagent_node(state: AgentState) -> dict:
    """
    SubAgent Node — выполняет задачи из pending_tasks (async def — ALEX-TD-027).

    POST-006: если task.depth < max_depth, subagent может делегировать дальше
    (добавляет дочерние pending_tasks). Иначе — выполняет напрямую.

    Берёт первую pending task, выполняет (mock), возвращает TaskResult.
    """
    if not state["pending_tasks"]:
        # Нет задач — ничего не делаем
        return {}

    # Берём первую задачу
    task = state["pending_tasks"][0]
    remaining_tasks = state["pending_tasks"][1:]

    task_id = task["task_id"]
    task_depth = task.get("depth", 1)
    max_depth = state.get("max_depth", 2)

    # POST-006: loop detection on deep hierarchy — check iteration AND cost limits
    # ALEX-TD-086: subagent_node previously only checked MAX_ITERATIONS (not MAX_COST_USD).
    # ALEX-TD-086 fix: also add MAX_TOKENS check — missing vs ceo_node/hierarchical_node.
    # CEO node checks all three limits. Subagent must mirror CEO to prevent token overruns
    # via subagent path (many short iterations, each token-heavy).
    max_iter = _get_max_iterations()
    max_cost = _get_max_cost_usd()
    max_tokens = _get_max_tokens()

    # ALEX-TD-275: unified order — iteration → cost → tokens (matches ceo_node)
    if state["iteration_count"] >= max_iter:
        return {
            "status": "failed",
            "error": "loop_detected",
            "error_detail": (
                f"Max iterations ({max_iter}) exceeded at depth {task_depth}, "
                f"iteration {state['iteration_count']}"
            ),
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }

    if state["total_cost_usd"] >= max_cost:
        return {
            "status": "failed",
            "error": "cost_limit_exceeded",
            "error_detail": (
                f"Cost limit ${max_cost:.4f} exceeded at subagent depth {task_depth} "
                f"(spent ${state['total_cost_usd']:.4f})"
            ),
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }

    if state["total_tokens"] >= max_tokens:
        return {
            "status": "failed",
            "error": "token_limit_exceeded",
            "error_detail": (
                f"Token limit {max_tokens} exceeded at subagent depth {task_depth} "
                f"(used {state['total_tokens']} tokens)"
            ),
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }

    # Mock выполнение через LLM
    result_text, tokens, cost = await _mock_llm_call(
        system=f"You are a subagent with ID: {task['to_agent_id']} at depth {task_depth}. Execute the assigned task.",
        user=f"Task: {task['description']}",
        mock_response=f"Completed task at depth {task_depth}: {task['description'][:50]}",
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
        "iteration_count": state["iteration_count"] + 1,
    }


# ─── Deep Hierarchy Node (POST-006) ──────────────────────────────────────────

async def hierarchical_node(state: AgentState) -> dict:
    """
    POST-006: Hierarchical node для агентов промежуточного уровня (async def — ALEX-TD-027).

    Агент получает задачу, при необходимости делегирует подчинённым (если depth < max_depth),
    либо выполняет напрямую. Поддерживает произвольную глубину N уровней.
    """
    if not state["pending_tasks"]:
        return {}

    task = state["pending_tasks"][0]
    remaining_tasks = state["pending_tasks"][1:]
    task_id = task["task_id"]
    task_depth = task.get("depth", 1)
    max_depth = state.get("max_depth", 2)

    max_iter = _get_max_iterations()
    max_cost = _get_max_cost_usd()
    max_tokens = _get_max_tokens()

    # Loop detection
    if state["iteration_count"] >= max_iter:
        return {
            "status": "failed",
            "error": "loop_detected",
            "error_detail": (
                f"Max iterations ({max_iter}) exceeded at depth {task_depth}"
            ),
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }
    if state["total_cost_usd"] >= max_cost:
        return {
            "status": "failed",
            "error": "cost_limit_exceeded",
            "error_detail": f"Cost limit ${max_cost:.4f} exceeded at depth {task_depth}",
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }
    if state["total_tokens"] >= max_tokens:
        return {
            "status": "failed",
            "error": "token_limit_exceeded",
            "error_detail": f"Token limit {max_tokens} exceeded at depth {task_depth}",
            # ALEX-TD-145: clear pending_tasks to avoid stale state in checkpointer
            "pending_tasks": [],
        }

    agent_id = task["to_agent_id"]

    if task_depth < max_depth:
        # Делегируем дочернему агенту (глубже)
        child_task_id = str(uuid.uuid4())
        child_task: TaskMessage = {
            "task_id": child_task_id,
            "from_agent_id": agent_id,
            "to_agent_id": f"sub-{agent_id}",
            "description": task["description"],
            "context": task.get("context", {}),
            "depth": task_depth + 1,
        }
        _, tokens, cost = await _mock_llm_call(
            system=f"You are agent {agent_id} at depth {task_depth}. Delegate to subordinate.",
            user=f"Delegate: {task['description']}",
            mock_response=f"Delegating from depth {task_depth} to {task_depth + 1}",
        )

        # Оригинальная задача считается delegated
        task_result: TaskResult = {
            "task_id": task_id,
            "agent_id": agent_id,
            "status": "delegated",
            "result": f"Delegated to sub-{agent_id} at depth {task_depth + 1}",
            "delegated_tasks": [child_task],
            "tokens_used": tokens,
            "cost_usd": cost,
        }

        new_active = {k: v for k, v in state["active_tasks"].items() if k != task_id}
        new_active[child_task_id] = child_task

        return {
            "pending_tasks": remaining_tasks + [child_task],
            "active_tasks": new_active,
            "results": {task_id: task_result},
            "total_tokens": state["total_tokens"] + tokens,
            "total_cost_usd": state["total_cost_usd"] + cost,
            "iteration_count": state["iteration_count"] + 1,
        }
    else:
        # Максимальная глубина — выполняем напрямую
        result_text, tokens, cost = await _mock_llm_call(
            system=f"You are agent {agent_id} at depth {task_depth} (leaf). Execute directly.",
            user=f"Task: {task['description']}",
            mock_response=f"Leaf execution at depth {task_depth}: {task['description'][:50]}",
        )
        task_result = {
            "task_id": task_id,
            "agent_id": agent_id,
            "status": "done",
            "result": result_text,
            "delegated_tasks": [],
            "tokens_used": tokens,
            "cost_usd": cost,
        }
        new_active = {k: v for k, v in state["active_tasks"].items() if k != task_id}
        return {
            "pending_tasks": remaining_tasks,
            "active_tasks": new_active,
            "results": {task_id: task_result},
            "total_tokens": state["total_tokens"] + tokens,
            "total_cost_usd": state["total_cost_usd"] + cost,
            "iteration_count": state["iteration_count"] + 1,
        }
