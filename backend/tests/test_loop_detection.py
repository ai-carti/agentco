"""
TDD тесты для M2-007 — Loop Detection + Cost Limits.

RED: тесты описывают ожидаемое поведение.
Проверяет:
- iteration_count >= limit → status="failed", error="loop_detected"
- total_tokens >= limit → status="failed", error="cost_limit_exceeded"
- Лимиты конфигурируемы через env vars
- RunEvent записывается при срабатывании guard (через сервисный слой)

ALEX-TD-027: node-функции конвертированы в async — все прямые вызовы
ceo_node/subagent_node помечены @pytest.mark.asyncio и используют await.
"""
import os
import pytest


class TestLoopDetectionErrorCodes:
    """M2-007: status='failed', error code = 'loop_detected' / 'cost_limit_exceeded'."""

    @pytest.mark.asyncio
    async def test_iteration_limit_sets_status_failed(self, monkeypatch):
        """При превышении MAX_AGENT_ITERATIONS статус должен быть 'failed' (не 'error')."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "5")
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 5,  # == limit
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = await ceo_node(state)
        assert result.get("status") == "failed", f"Expected 'failed', got {result.get('status')}"
        assert result.get("error") == "loop_detected"

    @pytest.mark.asyncio
    async def test_iteration_limit_error_message_contains_limit(self, monkeypatch):
        """error payload должен содержать info об итерационном лимите."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "3")
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        state: AgentState = {
            "run_id": "run-001",
            "company_id": "co-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 3,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = await ceo_node(state)
        assert result.get("error") == "loop_detected"
        # error_detail должен содержать пояснение
        assert result.get("error_detail") is not None
        assert "3" in result.get("error_detail", "")

    @pytest.mark.asyncio
    async def test_cost_limit_sets_status_failed(self, monkeypatch):
        """При превышении MAX_RUN_COST_USD статус должен быть 'failed'."""
        monkeypatch.setenv("MAX_RUN_COST_USD", "0.5")
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        state: AgentState = {
            "run_id": "run-002",
            "company_id": "company-001",
            "input": "Expensive task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 100000,
            "total_cost_usd": 0.5,  # == limit
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = await ceo_node(state)
        assert result.get("status") == "failed", f"Expected 'failed', got {result.get('status')}"
        assert result.get("error") == "cost_limit_exceeded"

    @pytest.mark.asyncio
    async def test_cost_limit_error_detail_contains_amounts(self, monkeypatch):
        """error_detail должен содержать лимит и фактические затраты."""
        monkeypatch.setenv("MAX_RUN_COST_USD", "1.0")
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        state: AgentState = {
            "run_id": "run-002",
            "company_id": "co-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 1.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = await ceo_node(state)
        assert result.get("error") == "cost_limit_exceeded"
        detail = result.get("error_detail", "")
        assert "1.0" in detail

    @pytest.mark.asyncio
    async def test_token_limit_alternative(self, monkeypatch):
        """MAX_RUN_TOKENS env var также должен работать как лимит токенов."""
        monkeypatch.setenv("MAX_RUN_TOKENS", "1000")
        monkeypatch.setenv("MAX_RUN_COST_USD", "999.0")  # не должно срабатывать
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        state: AgentState = {
            "run_id": "run-003",
            "company_id": "co-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 1000,  # == limit
            "total_cost_usd": 0.01,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = await ceo_node(state)
        assert result.get("status") == "failed"
        assert result.get("error") == "cost_limit_exceeded"


class TestLoopDetectionFullGraph:
    """M2-007: граф завершается с status='failed' при срабатывании guard."""

    @pytest.mark.asyncio
    async def test_graph_stops_with_failed_on_iteration_limit(self, monkeypatch):
        """Полный граф: MAX_ITERATIONS=1 → итерация срабатывает, status='failed'.

        ALEX-TD-027 fix: node-функции async → используем ainvoke() вместо invoke().
        """
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "1")
        # reload nodes to pick up monkeypatch
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)
        from agentco.orchestration.graph import build_orchestration_graph
        from agentco.orchestration.state import AgentState
        import agentco.orchestration.graph as graph_mod
        importlib.reload(graph_mod)

        graph = graph_mod.build_orchestration_graph()
        compiled = graph.compile()

        initial_state: AgentState = {
            "run_id": "run-loop-test",
            "company_id": "company-001",
            "input": "Infinite task",
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

        final_state = await compiled.ainvoke(initial_state)
        assert final_state["status"] == "failed", f"Expected 'failed', got {final_state['status']}"
        assert final_state["error"] == "loop_detected"

    @pytest.mark.asyncio
    async def test_graph_stops_with_failed_on_cost_limit(self, monkeypatch):
        """Полный граф: начальный cost уже превышен → status='failed', error='cost_limit_exceeded'.

        ALEX-TD-027 fix: node-функции async → используем ainvoke() вместо invoke().
        """
        monkeypatch.setenv("MAX_RUN_COST_USD", "0.0001")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)
        import agentco.orchestration.graph as graph_mod
        importlib.reload(graph_mod)

        graph = graph_mod.build_orchestration_graph()
        compiled = graph.compile()

        from agentco.orchestration.state import AgentState
        initial_state: AgentState = {
            "run_id": "run-cost-test",
            "company_id": "company-001",
            "input": "Expensive task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.001,  # уже превышен лимит 0.0001
            "status": "running",
            "error": None,
            "final_result": None,
        }

        final_state = await compiled.ainvoke(initial_state)
        assert final_state["status"] == "failed"
        assert final_state["error"] == "cost_limit_exceeded"


class TestLoopDetectionConfigurability:
    """M2-007: лимиты конфигурируемы через env vars."""

    def test_default_max_iterations_is_20(self):
        """По умолчанию MAX_AGENT_ITERATIONS должен быть 20 (per AC: N=20)."""
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        # Remove env var to test default
        env_backup = os.environ.pop("MAX_AGENT_ITERATIONS", None)
        try:
            importlib.reload(nodes_mod)
            assert nodes_mod._get_max_iterations() == 20
        finally:
            if env_backup is not None:
                os.environ["MAX_AGENT_ITERATIONS"] = env_backup

    def test_custom_max_iterations_via_env(self, monkeypatch):
        """MAX_AGENT_ITERATIONS env var должен переопределять дефолт."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "42")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)
        assert nodes_mod._get_max_iterations() == 42

    def test_custom_max_cost_via_env(self, monkeypatch):
        """MAX_RUN_COST_USD env var должен переопределять дефолт."""
        monkeypatch.setenv("MAX_RUN_COST_USD", "2.5")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)
        assert nodes_mod._get_max_cost_usd() == 2.5

    def test_custom_max_tokens_via_env(self, monkeypatch):
        """MAX_RUN_TOKENS env var должен переопределять дефолт."""
        monkeypatch.setenv("MAX_RUN_TOKENS", "50000")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)
        assert nodes_mod._get_max_tokens() == 50000
