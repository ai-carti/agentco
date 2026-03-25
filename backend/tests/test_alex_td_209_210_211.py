"""
Tests for ALEX-TD-209, ALEX-TD-210, ALEX-TD-211.

ALEX-TD-209: execute_run final-status update overwrites "stopped" status (race condition)
ALEX-TD-210: _estimate_cost / agent_node crash with model=None
ALEX-TD-211: create_with_goal allows empty goal string bypassing validation
"""
from __future__ import annotations

import asyncio
import pytest
from unittest.mock import MagicMock, patch, AsyncMock


# ─── ALEX-TD-211: create_with_goal empty goal validation ─────────────────────

def _make_run_service():
    """Create a RunService with all DB dependencies mocked."""
    from agentco.services.run import RunService
    from agentco.repositories.base import NotFoundError

    session = MagicMock()
    service = RunService(session)

    # Mock company repo: company exists and user owns it
    company = MagicMock()
    company.owner_id = "user-1"
    service._company_repo = MagicMock()
    service._company_repo.get.return_value = company

    return service


def test_create_with_goal_rejects_empty_string():
    """ALEX-TD-211: empty goal (bare empty string) should raise ValueError."""
    service = _make_run_service()
    with pytest.raises(ValueError, match="goal must not be empty"):
        service.create_with_goal(
            company_id="company-1",
            goal="",
            owner_id="user-1",
        )


def test_create_with_goal_rejects_whitespace_only():
    """ALEX-TD-211: whitespace-only goal should raise ValueError after strip."""
    service = _make_run_service()
    with pytest.raises(ValueError, match="goal must not be empty"):
        service.create_with_goal(
            company_id="company-1",
            goal="   \t\n  ",
            owner_id="user-1",
        )


def test_create_with_goal_accepts_valid_goal():
    """ALEX-TD-211: valid goal should not raise; run created and returned."""
    service = _make_run_service()

    # Mock repo.add to return a fake run
    fake_run = MagicMock()
    fake_run.id = "run-id-1"
    service._repo = MagicMock()
    service._repo.add.return_value = fake_run

    # No running event loop → bg task skipped (sync test context)
    result = service.create_with_goal(
        company_id="company-1",
        goal="Build a new product",
        owner_id="user-1",
    )
    assert result is fake_run


# ─── ALEX-TD-210: _estimate_cost / agent_node model=None safety ──────────────

def test_estimate_cost_with_none_model_does_not_crash():
    """ALEX-TD-210: _estimate_cost should handle model=None gracefully."""
    from agentco.orchestration.agent_node import _estimate_cost

    # Should NOT raise AttributeError when model is None
    cost = _estimate_cost(None, 100)  # type: ignore[arg-type]
    # Should fall back to "default" rate
    assert cost > 0


def test_estimate_cost_with_empty_string_model():
    """ALEX-TD-210: _estimate_cost should handle model="" gracefully."""
    from agentco.orchestration.agent_node import _estimate_cost

    cost = _estimate_cost("", 100)
    assert cost > 0  # falls back to default


@pytest.mark.asyncio
async def test_agent_node_publish_chunk_model_none_does_not_crash():
    """ALEX-TD-210: _publish_chunk should not crash when state has model=None."""
    from agentco.orchestration.agent_node import _publish_chunk
    from agentco.core.event_bus import EventBus

    # Patch EventBus to avoid actual publishing
    mock_bus = MagicMock()
    mock_bus.publish = AsyncMock()

    state = {
        "company_id": "company-1",
        "run_id": "run-1",
        "agent_id": "ceo",
        "model": None,  # explicitly None — this is the bug trigger
    }

    with patch.object(EventBus, "get", return_value=mock_bus):
        # Should not raise AttributeError: 'NoneType' has no attribute 'startswith'
        await _publish_chunk(state, "hello")

    mock_bus.publish.assert_called_once()


# ─── ALEX-TD-209: execute_run final update must not overwrite "stopped" status ─

@pytest.mark.asyncio
async def test_execute_run_does_not_overwrite_stopped_status():
    """
    ALEX-TD-209: when a run is already 'stopped' in DB (via stop() called concurrently),
    the final status update in execute_run should NOT overwrite it with 'done'/'completed'.
    """
    from agentco.services.run import RunService
    from agentco.core.event_bus import EventBus
    from agentco.orchestration.state import AgentState

    session = MagicMock()
    service = RunService(session)

    # The run ORM object that simulates status changed to "stopped" mid-flight
    run_orm_init = MagicMock()
    run_orm_init.company_id = "company-1"
    run_orm_init.task_id = None
    run_orm_init.goal = "Test goal"
    run_orm_init.status = "pending"

    # For the final update session, run has status="stopped" (stop() was called)
    run_orm_final = MagicMock()
    run_orm_final.status = "stopped"  # already stopped!

    init_session = MagicMock()
    init_session.get.return_value = run_orm_init

    final_session = MagicMock()
    final_session.get.return_value = run_orm_final

    call_count = [0]

    def session_factory():
        call_count[0] += 1
        if call_count[0] == 1:
            return init_session
        return final_session

    # Mock compile_graph and checkpointer
    final_graph_state: AgentState = {
        "run_id": "run-1",
        "company_id": "company-1",
        "input": "Test goal",
        "messages": [],
        "pending_tasks": [],
        "active_tasks": {},
        "results": {},
        "iteration_count": 1,
        "total_tokens": 100,
        "total_cost_usd": 0.01,
        "status": "done",
        "error": None,
        "final_result": "Done!",
        "agent_id": "ceo",
        "level": 0,
    }

    mock_compiled = MagicMock()
    mock_compiled.ainvoke = AsyncMock(return_value=final_graph_state)

    mock_checkpointer = AsyncMock()
    mock_checkpointer.__aenter__ = AsyncMock(return_value=MagicMock())
    mock_checkpointer.__aexit__ = AsyncMock(return_value=False)

    mock_bus = MagicMock()
    mock_bus.publish = AsyncMock()

    mock_memory_service = MagicMock()
    mock_memory_service.close = MagicMock()

    with (
        patch("agentco.services.run.compile_graph", return_value=mock_compiled),
        patch("agentco.services.run.create_checkpointer", return_value=mock_checkpointer),
        patch("agentco.services.run.MemoryService", return_value=mock_memory_service),
        patch.object(EventBus, "get", return_value=mock_bus),
    ):
        await service.execute_run("run-1", session_factory=session_factory)

    # CRITICAL: the final update must NOT have set status to "done" on a stopped run
    # run_orm_final.status should remain "stopped"
    # Check that we never assigned a non-terminal status over "stopped"
    status_assignments = [
        call for call in final_session.mock_calls
        if "status" in str(call) and "done" in str(call)
    ]
    # The status "done" should NOT have been written to a run that was already "stopped"
    assert run_orm_final.status == "stopped", (
        f"execute_run overwrote 'stopped' status with '{run_orm_final.status}' — race condition bug!"
    )
