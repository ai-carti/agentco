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
    ALEX-TD-101: handlers/memory.py must always call memory_service.close() via try/finally.

    This ensures sqlite connections are not leaked even if get_all() raises.
    """
    import inspect
    import agentco.handlers.memory as mem_module

    src = inspect.getsource(mem_module.get_agent_memory)
    assert "try:" in src and "finally:" in src, (
        "ALEX-TD-101: get_agent_memory must use try/finally to ensure MemoryService.close() "
        "is always called — prevents sqlite connection leaks."
    )
    assert "memory_service.close()" in src, (
        "ALEX-TD-101: get_agent_memory must explicitly call memory_service.close() in finally block."
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
