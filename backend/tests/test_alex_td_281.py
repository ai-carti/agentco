"""
Tests for ALEX-TD-281: _execute_agent — raise last_exc where last_exc can be None.

When _MAX_RETRIES == 0 the retry loop never executes and last_exc stays None.
`raise None` raises TypeError which masks the real problem.

Fix: initialise last_exc = RuntimeError("no retries attempted") so that when
the loop does not run at all (e.g. _MAX_RETRIES=0 after removing the ALEX-TD-048
clamp-to-1 guard), a clear RuntimeError is raised instead of TypeError.
"""
from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_service_with_mock_execute_run(execute_run_side_effect):
    """
    Build a minimal RunService instance where execute_run is replaced by a mock
    that applies *execute_run_side_effect*.
    """
    from agentco.services.run import RunService

    svc = RunService.__new__(RunService)
    svc._session = MagicMock()
    svc._repo = MagicMock()
    svc._task_repo = MagicMock()
    svc._company_repo = MagicMock()

    mock_execute = AsyncMock(side_effect=execute_run_side_effect)
    svc.execute_run = mock_execute
    return svc


# ---------------------------------------------------------------------------
# RED test — verifies that when _MAX_RETRIES=0 is effectively honoured
# (i.e. the loop body never runs) the code raises RuntimeError("no retries
# attempted") rather than TypeError from `raise None`.
#
# With the ORIGINAL code (last_exc: Exception | None = None + ALEX-TD-048
# guard that clamps 0 → 1) the loop runs ONCE, execute_run raises ValueError,
# and _execute_agent re-raises ValueError.  The test asserts RuntimeError →
# it FAILS (red).
#
# After the fix (remove ALEX-TD-048 clamp + init last_exc = RuntimeError(...))
# the loop genuinely does not run, `raise last_exc` → RuntimeError("no
# retries attempted") → test PASSES (green).
# ---------------------------------------------------------------------------

class TestLastExcNoneGuard:

    @pytest.mark.asyncio
    async def test_zero_retries_raises_runtime_error_not_type_error(self):
        """
        ALEX-TD-281 (red): RUN_MAX_RETRIES=0 + execute_run raises.

        Expected: RuntimeError("no retries attempted")
        Before fix: ValueError propagated (ALEX-TD-048 guard clamps 0→1, runs once)
        After fix:  RuntimeError("no retries attempted") raised (loop skipped)
        """
        svc = _make_service_with_mock_execute_run(ValueError("downstream failure"))

        with patch.dict(os.environ, {"RUN_MAX_RETRIES": "0"}):
            with pytest.raises(RuntimeError, match="no retries attempted"):
                await svc._execute_agent(
                    run_id="run-td-281",
                    task_id="task-1",
                    agent_id="agent-1",
                    company_id="co-1",
                    session_factory=MagicMock(),
                )

    @pytest.mark.asyncio
    async def test_zero_retries_does_not_raise_type_error(self):
        """
        ALEX-TD-281: raise None must never produce TypeError.

        Regardless of clamp behaviour, raise last_exc must not propagate as
        TypeError (which means last_exc was None).
        """
        svc = _make_service_with_mock_execute_run(ValueError("downstream failure"))

        with patch.dict(os.environ, {"RUN_MAX_RETRIES": "0"}):
            try:
                await svc._execute_agent(
                    run_id="run-td-281b",
                    task_id="task-1",
                    agent_id="agent-1",
                    company_id="co-1",
                    session_factory=MagicMock(),
                )
            except TypeError as exc:
                pytest.fail(
                    f"raise last_exc where last_exc=None produced TypeError: {exc}"
                )
            except Exception:
                pass  # any other exception is acceptable

    @pytest.mark.asyncio
    async def test_positive_retries_still_reraise_original_exception(self):
        """
        ALEX-TD-281 (regression): with _MAX_RETRIES=1 the original exception
        must still be re-raised (not swallowed by the new initialisation).
        """
        original_exc = ValueError("real error")
        svc = _make_service_with_mock_execute_run(original_exc)

        with patch.dict(os.environ, {"RUN_MAX_RETRIES": "1", "RUN_RETRY_BASE_DELAY": "0"}):
            with pytest.raises(ValueError, match="real error"):
                await svc._execute_agent(
                    run_id="run-td-281c",
                    task_id="task-1",
                    agent_id="agent-1",
                    company_id="co-1",
                    session_factory=MagicMock(),
                )

    @pytest.mark.asyncio
    async def test_execute_run_success_returns_result(self):
        """
        ALEX-TD-281 (regression): successful execution returns result string.
        """
        svc = _make_service_with_mock_execute_run(None)
        svc.execute_run = AsyncMock(return_value="done")

        with patch.dict(os.environ, {"RUN_MAX_RETRIES": "1", "RUN_RETRY_BASE_DELAY": "0"}):
            result = await svc._execute_agent(
                run_id="run-td-281d",
                task_id="task-1",
                agent_id="agent-1",
                company_id="co-1",
                session_factory=MagicMock(),
            )

        assert result == "done"
