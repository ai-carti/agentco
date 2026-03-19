"""
ALEX-TD-039: hierarchical_node при превышении token limit должен возвращать
"token_limit_exceeded", не "cost_limit_exceeded".

TDD: test написан до фикса (red), затем фикс применён (green).
"""
import pytest

from agentco.orchestration.state import TaskMessage


def _make_hierarchical_state(total_tokens: int = 0, total_cost_usd: float = 0.0):
    """Helper: создаёт AgentState с одной pending task для hierarchical_node."""
    task: TaskMessage = {
        "task_id": "task-td039",
        "from_agent_id": "ceo",
        "to_agent_id": "manager",
        "description": "Do something",
        "context": {},
        "depth": 1,
    }
    return {
        "run_id": "run-td039",
        "company_id": "co-001",
        "input": "Do something",
        "messages": [],
        "pending_tasks": [task],
        "active_tasks": {"task-td039": task},
        "results": {},
        "iteration_count": 0,
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost_usd,
        "status": "running",
        "error": None,
        "final_result": None,
        "max_depth": 3,
        "level": 0,
    }


class TestHierarchicalNodeTokenLimit:
    """ALEX-TD-039: error code при превышении token limit в hierarchical_node."""

    @pytest.mark.asyncio
    async def test_token_limit_returns_token_limit_exceeded_not_cost(self, monkeypatch):
        """hierarchical_node при token limit должен вернуть error='token_limit_exceeded'."""
        monkeypatch.setenv("MAX_RUN_TOKENS", "500")
        monkeypatch.setenv("MAX_RUN_COST_USD", "999.0")
        from agentco.orchestration.nodes import hierarchical_node

        state = _make_hierarchical_state(total_tokens=600)  # > 500
        result = await hierarchical_node(state)

        assert result.get("status") == "failed", f"Expected 'failed', got {result.get('status')}"
        assert result.get("error") == "token_limit_exceeded", (
            f"ALEX-TD-039: Expected 'token_limit_exceeded', got '{result.get('error')}'. "
            "hierarchical_node должен возвращать 'token_limit_exceeded' при превышении токенов."
        )

    @pytest.mark.asyncio
    async def test_cost_limit_still_returns_cost_limit_exceeded(self, monkeypatch):
        """Cost limit в hierarchical_node должен по-прежнему возвращать 'cost_limit_exceeded'."""
        monkeypatch.setenv("MAX_RUN_COST_USD", "1.0")
        monkeypatch.setenv("MAX_RUN_TOKENS", "999999")
        from agentco.orchestration.nodes import hierarchical_node

        state = _make_hierarchical_state(total_cost_usd=2.0)  # > 1.0
        result = await hierarchical_node(state)

        assert result.get("status") == "failed"
        assert result.get("error") == "cost_limit_exceeded"

    @pytest.mark.asyncio
    async def test_token_limit_equal_to_max_triggers_failed(self, monkeypatch):
        """total_tokens == max_tokens должен триггерить failed (граница)."""
        monkeypatch.setenv("MAX_RUN_TOKENS", "1000")
        monkeypatch.setenv("MAX_RUN_COST_USD", "999.0")
        from agentco.orchestration.nodes import hierarchical_node

        state = _make_hierarchical_state(total_tokens=1000)  # == limit
        result = await hierarchical_node(state)

        assert result.get("status") == "failed"
        assert result.get("error") == "token_limit_exceeded"

    @pytest.mark.asyncio
    async def test_error_code_consistency_ceo_vs_hierarchical(self, monkeypatch):
        """ceo_node и hierarchical_node должны возвращать одинаковый error code при token limit."""
        monkeypatch.setenv("MAX_RUN_TOKENS", "100")
        monkeypatch.setenv("MAX_RUN_COST_USD", "999.0")
        from agentco.orchestration.nodes import ceo_node, hierarchical_node
        from agentco.orchestration.state import AgentState

        ceo_state: AgentState = {
            "run_id": "run-ceo",
            "company_id": "co-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 200,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        hier_state = _make_hierarchical_state(total_tokens=200)

        ceo_result = await ceo_node(ceo_state)
        hier_result = await hierarchical_node(hier_state)

        assert ceo_result.get("error") == "token_limit_exceeded"
        assert hier_result.get("error") == "token_limit_exceeded", (
            f"Error code mismatch: ceo_node='{ceo_result.get('error')}', "
            f"hierarchical_node='{hier_result.get('error')}'. Should both be 'token_limit_exceeded'."
        )
