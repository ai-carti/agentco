"""
ALEX-TD-275: Regression test — loop detection guard order consistency.

Before: subagent_node checked guards in order: cost → tokens → iterations.
        hierarchical_node already had correct order: iterations → cost → tokens.
        ceo_node had correct order: iterations → cost → tokens.

Fix: unified all node functions to: iterations → cost → tokens (matching ceo_node).

This test verifies that when BOTH iteration AND cost limits are exceeded simultaneously,
all three node functions return `loop_detected` (iteration check fires first, not
`cost_limit_exceeded`). This confirms the correct guard order is maintained.
"""
import asyncio
import pytest
from agentco.orchestration.nodes import ceo_node, subagent_node, hierarchical_node
from agentco.orchestration.state import AgentState, TaskMessage


def _make_state(**overrides) -> AgentState:
    """Create a minimal AgentState for testing."""
    base: AgentState = {
        "run_id": "test-run",
        "company_id": "test-co",
        "input": "Test task",
        "agent_id": "ceo",
        "level": 0,
        "max_depth": 2,
        "messages": [],
        "pending_tasks": [],
        "active_tasks": {},
        "results": {},
        "iteration_count": 0,
        "total_tokens": 0,
        "total_cost_usd": 0.0,
        "status": "running",
        "error": None,
        "final_result": None,
    }
    base.update(overrides)  # type: ignore[typeddict-item]
    return base


def _make_pending_task() -> TaskMessage:
    """Create a minimal TaskMessage so subagent/hierarchical nodes have a task to process."""
    return {
        "task_id": "task-1",
        "from_agent_id": "ceo",
        "to_agent_id": "subagent",
        "description": "Do something",
        "context": {},
        "depth": 1,
    }


@pytest.mark.asyncio
class TestLoopGuardOrder:
    """ALEX-TD-275: guard order must be iteration → cost → tokens in all nodes."""

    async def test_ceo_node_iteration_beats_cost_when_both_exceeded(self, monkeypatch):
        """ceo_node: iteration limit fires before cost limit when both exceeded."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "5")
        monkeypatch.setenv("MAX_RUN_COST_USD", "0.0")   # already exceeded
        monkeypatch.setenv("MAX_RUN_TOKENS", "100000")

        state = _make_state(
            iteration_count=5,   # >= MAX_AGENT_ITERATIONS (5)
            total_cost_usd=1.0,  # >= MAX_RUN_COST_USD (0.0)
        )
        result = await ceo_node(state)
        assert result["error"] == "loop_detected", (
            f"Expected loop_detected but got {result['error']!r} — "
            "iteration guard must fire before cost guard in ceo_node"
        )

    async def test_subagent_node_iteration_beats_cost_when_both_exceeded(self, monkeypatch):
        """subagent_node: iteration limit fires before cost limit when both exceeded.

        ALEX-TD-275: before the fix, cost guard fired first → error='cost_limit_exceeded'
        instead of 'loop_detected'. After fix, order is iteration → cost → tokens.
        """
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "5")
        monkeypatch.setenv("MAX_RUN_COST_USD", "0.0")   # already exceeded
        monkeypatch.setenv("MAX_RUN_TOKENS", "100000")

        task = _make_pending_task()
        state = _make_state(
            iteration_count=5,   # >= MAX_AGENT_ITERATIONS (5)
            total_cost_usd=1.0,  # >= MAX_RUN_COST_USD (0.0)
            pending_tasks=[task],
        )
        result = await subagent_node(state)
        assert result["error"] == "loop_detected", (
            f"Expected loop_detected but got {result['error']!r} — "
            "iteration guard must fire before cost guard in subagent_node (ALEX-TD-275)"
        )

    async def test_hierarchical_node_iteration_beats_cost_when_both_exceeded(self, monkeypatch):
        """hierarchical_node: iteration limit fires before cost limit when both exceeded."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "5")
        monkeypatch.setenv("MAX_RUN_COST_USD", "0.0")   # already exceeded
        monkeypatch.setenv("MAX_RUN_TOKENS", "100000")

        task = _make_pending_task()
        state = _make_state(
            iteration_count=5,   # >= MAX_AGENT_ITERATIONS (5)
            total_cost_usd=1.0,  # >= MAX_RUN_COST_USD (0.0)
            pending_tasks=[task],
        )
        result = await hierarchical_node(state)
        assert result["error"] == "loop_detected", (
            f"Expected loop_detected but got {result['error']!r} — "
            "iteration guard must fire before cost guard in hierarchical_node (ALEX-TD-275)"
        )

    async def test_all_nodes_iteration_beats_tokens_when_both_exceeded(self, monkeypatch):
        """iteration guard fires before token guard in all 3 nodes."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "5")
        monkeypatch.setenv("MAX_RUN_COST_USD", "999.0")  # NOT exceeded
        monkeypatch.setenv("MAX_RUN_TOKENS", "0")         # exceeded

        task = _make_pending_task()

        # ceo_node
        ceo_state = _make_state(iteration_count=5, total_tokens=100)
        result = await ceo_node(ceo_state)
        assert result["error"] == "loop_detected", f"ceo_node: {result['error']}"

        # subagent_node
        sub_state = _make_state(iteration_count=5, total_tokens=100, pending_tasks=[task])
        result = await subagent_node(sub_state)
        assert result["error"] == "loop_detected", f"subagent_node: {result['error']}"

        # hierarchical_node
        hier_state = _make_state(iteration_count=5, total_tokens=100, pending_tasks=[task])
        result = await hierarchical_node(hier_state)
        assert result["error"] == "loop_detected", f"hierarchical_node: {result['error']}"

    async def test_cost_beats_tokens_when_only_cost_and_tokens_exceeded(self, monkeypatch):
        """cost guard fires before token guard when both exceeded but iteration is OK."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "100")  # NOT exceeded
        monkeypatch.setenv("MAX_RUN_COST_USD", "0.0")      # exceeded
        monkeypatch.setenv("MAX_RUN_TOKENS", "0")           # exceeded

        task = _make_pending_task()

        sub_state = _make_state(iteration_count=0, total_cost_usd=1.0, total_tokens=100, pending_tasks=[task])
        result = await subagent_node(sub_state)
        assert result["error"] == "cost_limit_exceeded", (
            f"Expected cost_limit_exceeded but got {result['error']!r} — "
            "cost guard must fire before token guard when iteration is OK"
        )

        hier_state = _make_state(iteration_count=0, total_cost_usd=1.0, total_tokens=100, pending_tasks=[task])
        result = await hierarchical_node(hier_state)
        assert result["error"] == "cost_limit_exceeded", (
            f"Expected cost_limit_exceeded but got {result['error']!r} — "
            "cost guard must fire before token guard in hierarchical_node"
        )
