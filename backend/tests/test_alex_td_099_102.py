"""
Regression tests for ALEX-TD-099..102 — Backend Audit 2026-03-22.

ALEX-TD-099 (major): RunService.stop() — _terminal set missing "error" status.
    A run with status="error" can be re-stopped, overwriting the final status to "stopped".
    Fix: add "error" to _terminal set in stop().

ALEX-TD-100 (minor): MemoryService._get_embedding — no timeout on LiteLLM call.
    Fix: add timeout=30.0 to litellm.aembedding() call.

ALEX-TD-101 (minor): handlers/memory.py — creates new MemoryService per GET request.
    Each request opens a new sqlite3 connection + loads sqlite_vec extension.
    Fix: documented per-request pattern — verify close() is always called (try/finally).

ALEX-TD-102 (minor): handlers/agents.py:get_agents_tree — no rate limiting.
    Fix: add @limiter.limit decorator.
"""
import asyncio
import inspect
from unittest.mock import MagicMock, AsyncMock, patch

import pytest


# ── ALEX-TD-099: stop() — "error" must be in _terminal set ──────────────────

def test_stop_does_not_overwrite_error_status():
    """
    ALEX-TD-099: RunService.stop() must treat "error" as a terminal state.

    A run that failed with status="error" should NOT be overwritten to "stopped".
    _terminal must include "error".
    """
    from agentco.services.run import RunService
    from agentco.models.run import Run
    from datetime import datetime

    # Build a mock ORM object with real string attributes for _to_domain
    mock_run_orm = MagicMock()
    mock_run_orm.company_id = "co-1"
    mock_run_orm.status = "error"
    mock_run_orm.id = "run-1"
    mock_run_orm.goal = None
    mock_run_orm.task_id = None
    mock_run_orm.agent_id = None
    mock_run_orm.total_cost_usd = 0.0
    mock_run_orm.total_tokens = 0
    mock_run_orm.started_at = None
    mock_run_orm.completed_at = None
    mock_run_orm.created_at = None
    mock_run_orm.result = None
    mock_run_orm.error = "some_error"

    mock_session = MagicMock()
    mock_session.get.return_value = mock_run_orm

    # Mock company repo (skip ownership check — pass owner_id=None)
    service = RunService(mock_session)

    # stop() without owner_id skips company ownership check
    result = service.stop(company_id="co-1", run_id="run-1", owner_id=None)

    # Status must NOT be changed to "stopped"
    assert mock_run_orm.status == "error", (
        "ALEX-TD-099: stop() must NOT overwrite status='error' — "
        "'error' is a terminal state and must be in _terminal set. "
        f"Got status={mock_run_orm.status!r} after stop()"
    )
    # flush/commit should NOT be called for terminal runs
    mock_session.flush.assert_not_called()
    mock_session.commit.assert_not_called()


def test_terminal_set_includes_error():
    """
    ALEX-TD-099: Verify _terminal set in stop() source code includes "error".

    We inspect the source of RunService.stop to check the _terminal literal.
    """
    import inspect
    from agentco.services.run import RunService

    src = inspect.getsource(RunService.stop)
    assert '"error"' in src or "'error'" in src, (
        "ALEX-TD-099: _terminal set in RunService.stop() must include 'error'. "
        "A run with status='error' should be treated as terminal — stop() should return it as-is."
    )


def test_stop_with_completed_status_unchanged():
    """
    Regression: stop() still leaves completed/failed/stopped/done/error runs unchanged.
    """
    from agentco.services.run import RunService

    for terminal_status in ("completed", "failed", "stopped", "done", "error"):
        mock_run_orm = MagicMock()
        mock_run_orm.company_id = "co-1"
        mock_run_orm.status = terminal_status
        mock_run_orm.id = "run-1"
        mock_run_orm.goal = None
        mock_run_orm.task_id = None
        mock_run_orm.agent_id = None
        mock_run_orm.total_cost_usd = 0.0
        mock_run_orm.total_tokens = 0
        mock_run_orm.started_at = None
        mock_run_orm.completed_at = None
        mock_run_orm.created_at = None
        mock_run_orm.result = None
        mock_run_orm.error = None

        mock_session = MagicMock()
        mock_session.get.return_value = mock_run_orm

        service = RunService(mock_session)
        service.stop(company_id="co-1", run_id="run-1", owner_id=None)

        assert mock_run_orm.status == terminal_status, (
            f"ALEX-TD-099: stop() must not modify terminal status={terminal_status!r}"
        )


# ── ALEX-TD-100: _get_embedding — timeout must be set ─────────────────────────

def test_get_embedding_has_timeout():
    """
    ALEX-TD-100: MemoryService._get_embedding must pass a timeout to litellm.aembedding().

    Without a timeout, a hanging LLM API call will block indefinitely.
    """
    import inspect
    from agentco.memory.service import MemoryService

    src = inspect.getsource(MemoryService._get_embedding)
    assert "timeout" in src, (
        "ALEX-TD-100: MemoryService._get_embedding() must pass 'timeout=' to litellm.aembedding(). "
        "Without a timeout, a hanging embedding call blocks indefinitely → zombie background tasks."
    )


# ── ALEX-TD-101: handlers/memory.py — try/finally closes MemoryService ────────

def test_memory_handler_always_closes_service():
    """
    ALEX-TD-101: handlers/memory.py prevents connection leaks.

    ALEX-TD-298: architecture changed from per-request MemoryService (with try/finally close)
    to a module-level singleton that persists across requests. The connection is NOT closed
    per-request — it's a single long-lived connection protected by threading.Lock.

    Instead of try/finally per-request, connection safety is ensured by:
    - _reset_memory_store() in lifespan shutdown (called by tests and graceful shutdown)
    - SqliteVecStore._lock (threading.Lock) guards concurrent access
    - No per-request close needed because no per-request connection is opened

    This test verifies the new pattern: singleton factory is used, not per-request close.
    """
    import inspect
    import agentco.handlers.memory as mem_module

    src = inspect.getsource(mem_module.get_agent_memory)
    # ALEX-TD-298: new pattern — uses singleton factory, not per-request creation+close
    assert "_get_memory_store" in src, (
        "ALEX-TD-298: get_agent_memory must use _get_memory_store() singleton factory "
        "instead of creating a new MemoryService per request."
    )
    # Verify module exports _reset_memory_store for test isolation and graceful shutdown
    assert hasattr(mem_module, "_reset_memory_store"), (
        "ALEX-TD-298: handlers/memory.py must export _reset_memory_store() "
        "for test isolation and graceful shutdown."
    )


# ── ALEX-TD-102: get_agents_tree — rate limiting ─────────────────────────────

def test_agents_tree_has_rate_limit():
    """
    ALEX-TD-102: GET /agents/tree endpoint must have @limiter.limit decorator.

    This prevents DoS via expensive recursive tree building for large agent hierarchies.
    """
    import inspect
    import agentco.handlers.agents as agents_module

    src = inspect.getsource(agents_module.get_agents_tree)
    # Rate limiter is applied as decorator — check for limiter.limit in source
    # OR check the module source around get_agents_tree definition
    full_src = inspect.getsource(agents_module)
    # Find get_agents_tree and check the lines before it for @limiter.limit
    lines = full_src.split("\n")
    tree_line = None
    for i, line in enumerate(lines):
        if "def get_agents_tree" in line:
            tree_line = i
            break

    assert tree_line is not None, "get_agents_tree function not found"

    # Check 5 lines before the def for @limiter.limit
    context_lines = lines[max(0, tree_line - 5): tree_line]
    has_rate_limit = any("@limiter.limit" in line for line in context_lines)

    assert has_rate_limit, (
        "ALEX-TD-102: get_agents_tree must have @limiter.limit decorator. "
        "Without rate limiting, the recursive tree build can be abused for DoS. "
        f"Context before def: {context_lines}"
    )



# ── ALEX-TD-104: execute_run error branch — DB failure swallows run.failed ───

def test_execute_run_error_branch_db_update_is_isolated():
    """
    ALEX-TD-104: В error branch execute_run, если update_session.get() бросает
    OperationalError (disk full, DB недоступна), эта ошибка НЕ должна propagate наружу.
    Критический инвариант: run.failed event ДОЛЖЕН быть опубликован даже если DB упала.

    До фикса: update_session.get() raises → OperationalError propagates из inner try
              → пропускает 'if run_orm is None' и 'await bus.publish()' строки
              → run.failed НЕ публикуется, фронт не получает уведомление.
    После фикса: добавить 'run_orm = None' ДО inner try → при DB failure
              run_orm остаётся None → publish выполняется.
    """
    import inspect
    from agentco.services.run import RunService

    source = inspect.getsource(RunService.execute_run)

    error_branch_start = source.find("except Exception as exc:")
    assert error_branch_start != -1, "Should have 'except Exception as exc:' block"
    error_branch = source[error_branch_start:]

    # Найдём позицию inner try (DB update)
    inner_try_pos = error_branch.find("try:")
    assert inner_try_pos != -1, "error branch must have inner try block for DB update"

    # run_orm = None должна быть ДО inner try в error branch
    run_orm_none_pos = error_branch.find("run_orm = None")

    has_pre_init = (run_orm_none_pos != -1 and run_orm_none_pos < inner_try_pos)

    # Альтернативный фикс: inner try имеет except clause (поглощает DB ошибку)
    inner_try_slice = error_branch[inner_try_pos:inner_try_pos + 300]
    has_inner_except = "except" in inner_try_slice and "finally" in inner_try_slice
    inner_except_pos = error_branch.find("except", inner_try_pos)
    inner_finally_pos = error_branch.find("finally:", inner_try_pos)
    has_inner_except_before_finally = (
        inner_except_pos != -1 and inner_finally_pos != -1
        and inner_except_pos < inner_finally_pos
    )

    assert has_pre_init or has_inner_except_before_finally, (
        "ALEX-TD-104: execute_run error branch has unbound run_orm risk. "
        "When update_session.get() raises OperationalError: "
        "(1) run_orm stays unbound, (2) OperationalError propagates past 'if run_orm is None', "
        "(3) run.failed event is NEVER published — frontend stuck in 'running' state. "
        "Fix: add 'run_orm = None' before 'try: run_orm = update_session.get(...)' "
        "in the error branch of execute_run()."
    )

