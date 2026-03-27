"""
Tests for ALEX-TD-277: max_depth configurable via MAX_AGENT_DEPTH env var.

Verifies:
1. _get_max_depth() reads MAX_AGENT_DEPTH env var (default=2)
2. initial_state in execute_run includes "max_depth" key
3. env var value propagates into graph state
"""
from __future__ import annotations

import importlib
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─── Tests for _get_max_depth() ───────────────────────────────────────────────

class TestGetMaxDepth:
    def test_default_is_2(self):
        """_get_max_depth() returns 2 when MAX_AGENT_DEPTH not set."""
        env = {k: v for k, v in os.environ.items() if k != "MAX_AGENT_DEPTH"}
        with patch.dict(os.environ, env, clear=True):
            from agentco.orchestration import nodes
            importlib.reload(nodes)
            assert nodes._get_max_depth() == 2

    def test_env_var_applies(self):
        """_get_max_depth() returns value from MAX_AGENT_DEPTH env var."""
        with patch.dict(os.environ, {"MAX_AGENT_DEPTH": "5"}):
            from agentco.orchestration import nodes
            importlib.reload(nodes)
            assert nodes._get_max_depth() == 5

    def test_env_var_1(self):
        """_get_max_depth() accepts MAX_AGENT_DEPTH=1."""
        with patch.dict(os.environ, {"MAX_AGENT_DEPTH": "1"}):
            from agentco.orchestration import nodes
            importlib.reload(nodes)
            assert nodes._get_max_depth() == 1

    def test_env_var_10(self):
        """_get_max_depth() accepts MAX_AGENT_DEPTH=10."""
        with patch.dict(os.environ, {"MAX_AGENT_DEPTH": "10"}):
            from agentco.orchestration import nodes
            importlib.reload(nodes)
            assert nodes._get_max_depth() == 10


# ─── Test that initial_state includes max_depth ───────────────────────────────

class TestInitialStateMaxDepth:
    """execute_run must include 'max_depth' in initial_state."""

    def test_initial_state_has_max_depth_key(self):
        """execute_run initial_state includes 'max_depth' from _get_max_depth()."""
        captured_states = []

        async def fake_ainvoke(state, config=None):
            captured_states.append(dict(state))
            return {
                "final_result": "done",
                "status": "completed",
                "total_tokens": 0,
                "total_cost_usd": 0.0,
                "error": None,
            }

        fake_compiled = MagicMock()
        fake_compiled.ainvoke = fake_ainvoke

        fake_checkpointer = AsyncMock()
        fake_checkpointer.__aenter__ = AsyncMock(return_value=fake_checkpointer)
        fake_checkpointer.__aexit__ = AsyncMock(return_value=False)

        from agentco.services.run import RunService
        from agentco.orchestration.state import AgentState

        session = MagicMock()
        run_orm = MagicMock()
        run_orm.company_id = "company-1"
        run_orm.task_id = None
        run_orm.goal = "test goal"
        run_orm.status = "pending"
        run_orm.total_tokens = 0
        run_orm.total_cost_usd = 0.0
        session.get.return_value = run_orm

        memory_service = MagicMock()
        memory_service.close = MagicMock()

        with patch.dict(os.environ, {"MAX_AGENT_DEPTH": "4"}), \
             patch("agentco.services.run.compile_graph", return_value=fake_compiled), \
             patch("agentco.services.run.create_checkpointer", return_value=fake_checkpointer), \
             patch("agentco.services.run.MemoryService", return_value=memory_service), \
             patch("agentco.core.event_bus.EventBus.get") as mock_bus_get:

            mock_bus = AsyncMock()
            mock_bus.publish = AsyncMock()
            mock_bus_get.return_value = mock_bus

            svc = RunService(session)

            asyncio.run(svc.execute_run("run-1", session_factory=None))

        assert len(captured_states) == 1
        state = captured_states[0]
        assert "max_depth" in state, "initial_state must include 'max_depth' key"
        assert state["max_depth"] == 4, f"Expected max_depth=4 from env, got {state['max_depth']}"

    def test_initial_state_max_depth_default(self):
        """execute_run initial_state has max_depth=2 when MAX_AGENT_DEPTH not set."""
        captured_states = []

        async def fake_ainvoke(state, config=None):
            captured_states.append(dict(state))
            return {
                "final_result": "done",
                "status": "completed",
                "total_tokens": 0,
                "total_cost_usd": 0.0,
                "error": None,
            }

        fake_compiled = MagicMock()
        fake_compiled.ainvoke = fake_ainvoke

        fake_checkpointer = AsyncMock()
        fake_checkpointer.__aenter__ = AsyncMock(return_value=fake_checkpointer)
        fake_checkpointer.__aexit__ = AsyncMock(return_value=False)

        from agentco.services.run import RunService

        session = MagicMock()
        run_orm = MagicMock()
        run_orm.company_id = "company-1"
        run_orm.task_id = None
        run_orm.goal = "test goal"
        run_orm.status = "pending"
        run_orm.total_tokens = 0
        run_orm.total_cost_usd = 0.0
        session.get.return_value = run_orm

        memory_service = MagicMock()
        memory_service.close = MagicMock()

        env = {k: v for k, v in os.environ.items() if k != "MAX_AGENT_DEPTH"}

        with patch.dict(os.environ, env, clear=True), \
             patch("agentco.services.run.compile_graph", return_value=fake_compiled), \
             patch("agentco.services.run.create_checkpointer", return_value=fake_checkpointer), \
             patch("agentco.services.run.MemoryService", return_value=memory_service), \
             patch("agentco.core.event_bus.EventBus.get") as mock_bus_get:

            mock_bus = AsyncMock()
            mock_bus.publish = AsyncMock()
            mock_bus_get.return_value = mock_bus

            svc = RunService(session)

            asyncio.run(svc.execute_run("run-1", session_factory=None))

        assert len(captured_states) == 1
        state = captured_states[0]
        assert "max_depth" in state, "initial_state must include 'max_depth' key"
        assert state["max_depth"] == 2, f"Expected default max_depth=2, got {state['max_depth']}"
