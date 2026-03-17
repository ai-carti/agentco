"""
TDD тесты для M2-002 — LangGraph иерархический граф CEO → subagents.

Порядок: сначала тест (red), потом реализация (green).
"""
import asyncio
import os
import pytest
import pytest_asyncio
from typing import Any


# ─── state.py ────────────────────────────────────────────────────────────────

class TestAgentState:
    """state.py — AgentState TypedDict."""

    def test_agent_state_has_all_required_fields(self):
        """AgentState должен содержать все поля из ADR."""
        from agentco.orchestration.state import AgentState, TaskMessage, TaskResult

        # Проверяем что можно создать валидный state
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "Build a landing page",
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
        assert state["run_id"] == "run-001"
        assert state["status"] == "running"
        assert state["iteration_count"] == 0

    def test_task_message_structure(self):
        """TaskMessage должен содержать task_id, from/to_agent_id, description, context."""
        from agentco.orchestration.state import TaskMessage

        msg: TaskMessage = {
            "task_id": "task-001",
            "from_agent_id": "ceo",
            "to_agent_id": "dev",
            "description": "Write tests",
            "context": {"company": "AgentCo"},
        }
        assert msg["task_id"] == "task-001"
        assert msg["to_agent_id"] == "dev"

    def test_task_result_structure(self):
        """TaskResult должен содержать task_id, agent_id, status, result, delegated_tasks, tokens_used, cost_usd."""
        from agentco.orchestration.state import TaskResult

        result: TaskResult = {
            "task_id": "task-001",
            "agent_id": "dev",
            "status": "done",
            "result": "Tests written",
            "delegated_tasks": [],
            "tokens_used": 100,
            "cost_usd": 0.001,
        }
        assert result["status"] == "done"
        assert result["cost_usd"] == 0.001


# ─── graph.py ────────────────────────────────────────────────────────────────

class TestGraphCompile:
    """graph.py — StateGraph должен компилироваться без ошибок."""

    def test_graph_compiles_without_error(self):
        """graph.compile() должен завершаться без исключений."""
        from agentco.orchestration.graph import build_orchestration_graph

        graph = build_orchestration_graph()
        compiled = graph.compile()
        assert compiled is not None

    def test_graph_compile_with_checkpointer(self, tmp_path):
        """graph.compile(checkpointer=...) должен работать."""
        import sqlite3
        from langgraph.checkpoint.sqlite import SqliteSaver
        from agentco.orchestration.graph import build_orchestration_graph

        db_path = str(tmp_path / "test_checkpoint.db")
        conn = sqlite3.connect(db_path, check_same_thread=False)
        checkpointer = SqliteSaver(conn)
        graph = build_orchestration_graph()
        compiled = graph.compile(checkpointer=checkpointer)
        assert compiled is not None
        conn.close()


# ─── nodes.py ─────────────────────────────────────────────────────────────────

class TestAgentNodes:
    """nodes.py — CEO node и subagent node с mock LLM."""

    def test_ceo_node_returns_state_dict(self):
        """CEO node должен возвращать dict с обновлёнными полями state."""
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        initial_state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "Build a landing page",
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
        result = ceo_node(initial_state)
        assert isinstance(result, dict)

    def test_ceo_node_increments_iteration_count(self):
        """CEO node должен инкрементировать iteration_count."""
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
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = ceo_node(state)
        assert result.get("iteration_count") == 1

    def test_subagent_node_returns_task_result(self):
        """SubAgent node должен возвращать TaskResult в results."""
        from agentco.orchestration.nodes import subagent_node
        from agentco.orchestration.state import AgentState, TaskMessage

        task: TaskMessage = {
            "task_id": "task-001",
            "from_agent_id": "ceo",
            "to_agent_id": "dev",
            "description": "Write code",
            "context": {},
        }
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [task],
            "active_tasks": {"task-001": task},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = subagent_node(state)
        assert isinstance(result, dict)
        # results должен содержать результат задачи
        results = result.get("results", {})
        assert len(results) > 0

    def test_ceo_node_delegates_tasks_to_pending(self):
        """CEO node должен добавлять задачи в pending_tasks при наличии подчинённых."""
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "Build a product",
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
        result = ceo_node(state)
        # CEO должен либо делегировать задачи либо завершить
        # в любом случае iteration_count инкрементируется
        assert "iteration_count" in result


# ─── loop detection ───────────────────────────────────────────────────────────

class TestLoopDetection:
    """Loop detection: MAX_ITERATIONS + MAX_COST_USD."""

    def test_exceeding_max_iterations_sets_status_failed(self):
        """При iteration_count >= MAX_ITERATIONS статус должен стать 'failed' (M2-007)."""
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        # Устанавливаем iteration_count равным MAX_ITERATIONS
        max_iter = int(os.environ.get("MAX_AGENT_ITERATIONS", "20"))
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": max_iter,  # уже на лимите
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = ceo_node(state)
        assert result.get("status") == "failed", f"Expected 'failed', got {result.get('status')}"
        assert result.get("error") == "loop_detected"

    def test_exceeding_max_cost_sets_status_failed(self):
        """При total_cost_usd >= MAX_RUN_COST_USD статус должен стать 'failed' (M2-007)."""
        from agentco.orchestration.nodes import ceo_node
        from agentco.orchestration.state import AgentState

        max_cost = float(os.environ.get("MAX_RUN_COST_USD", "1.0"))
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "Task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": max_cost,  # уже на лимите
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = ceo_node(state)
        assert result.get("status") == "failed", f"Expected 'failed', got {result.get('status')}"
        assert result.get("error") == "cost_limit_exceeded"

    def test_loop_detection_via_full_graph_run(self, tmp_path):
        """Граф должен остановиться с status='failed' при превышении MAX_ITERATIONS (M2-007)."""
        import os
        os.environ["MAX_AGENT_ITERATIONS"] = "1"  # лимит 1: CEO делегирует (iter=1), затем → failed

        try:
            from agentco.orchestration.graph import build_orchestration_graph
            from agentco.orchestration.state import AgentState

            graph = build_orchestration_graph()
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

            final_state = compiled.invoke(initial_state)
            assert final_state["status"] == "failed", f"Expected 'failed', got {final_state['status']}"
            assert final_state["error"] == "loop_detected"
        finally:
            # restore
            del os.environ["MAX_AGENT_ITERATIONS"]


# ─── full flow test ───────────────────────────────────────────────────────────

class TestGraphExecution:
    """Полный прогон графа с mock LLM."""

    def test_graph_runs_ceo_delegates_to_subagent_gets_result(self, tmp_path):
        """CEO получает задачу, делегирует subagent-у, получает результат."""
        from agentco.orchestration.graph import build_orchestration_graph
        from agentco.orchestration.state import AgentState

        graph = build_orchestration_graph()
        compiled = graph.compile()

        initial_state: AgentState = {
            "run_id": "run-flow-test",
            "company_id": "company-001",
            "input": "Create a simple website",
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

        final_state = compiled.invoke(initial_state)
        # Граф должен завершиться (не зависнуть)
        assert final_state["status"] in ("completed", "error")
        # iteration_count должен быть > 0
        assert final_state["iteration_count"] > 0


# ─── checkpointing ────────────────────────────────────────────────────────────

class TestCheckpointing:
    """Checkpointing: граф возобновляется с checkpoint."""

    def test_graph_can_resume_from_checkpoint(self, tmp_path):
        """Граф должен сохранить checkpoint и позволить возобновление."""
        import sqlite3
        from langgraph.checkpoint.sqlite import SqliteSaver
        from agentco.orchestration.graph import build_orchestration_graph
        from agentco.orchestration.state import AgentState

        db_path = str(tmp_path / "checkpoint.db")
        conn = sqlite3.connect(db_path, check_same_thread=False)
        checkpointer = SqliteSaver(conn)

        graph = build_orchestration_graph()
        compiled = graph.compile(checkpointer=checkpointer)

        run_id = "run-checkpoint-test"
        config = {"configurable": {"thread_id": run_id}}

        initial_state: AgentState = {
            "run_id": run_id,
            "company_id": "company-001",
            "input": "Build something",
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

        # Первый запуск
        final_state = compiled.invoke(initial_state, config=config)
        assert final_state is not None

        # Получить сохранённый state через get_state
        saved_state = compiled.get_state(config)
        assert saved_state is not None
        assert saved_state.values["run_id"] == run_id

        conn.close()

    @pytest.mark.asyncio
    async def test_async_checkpointer_works(self, tmp_path):
        """AsyncSqliteSaver должен корректно сохранять checkpoint."""
        from agentco.orchestration.checkpointer import create_checkpointer
        from agentco.orchestration.graph import build_orchestration_graph
        from agentco.orchestration.state import AgentState

        db_path = str(tmp_path / "async_checkpoint.db")

        async with create_checkpointer(db_path) as checkpointer:
            graph = build_orchestration_graph()
            compiled = graph.compile(checkpointer=checkpointer)

            run_id = "run-async-test"
            config = {"configurable": {"thread_id": run_id}}

            initial_state: AgentState = {
                "run_id": run_id,
                "company_id": "company-001",
                "input": "Async task",
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

            final_state = await compiled.ainvoke(initial_state, config=config)
            assert final_state is not None
            assert final_state["run_id"] == run_id

            # Проверка что state сохранён
            saved = await compiled.aget_state(config)
            assert saved.values["run_id"] == run_id


# ─── checkpointer.py ─────────────────────────────────────────────────────────

class TestCheckpointerModule:
    """checkpointer.py — AsyncSqliteSaver factory."""

    @pytest.mark.asyncio
    async def test_create_checkpointer_returns_async_saver(self, tmp_path):
        """create_checkpointer должен возвращать AsyncSqliteSaver через async context manager."""
        from agentco.orchestration.checkpointer import create_checkpointer
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        db_path = str(tmp_path / "test.db")
        async with create_checkpointer(db_path) as cp:
            assert isinstance(cp, AsyncSqliteSaver)


# ─── M2-002 missing AC tests ──────────────────────────────────────────────────

class TestAgentStateM2002:
    """AgentState должен содержать level, agent_id из AC M2-002."""

    def test_agent_state_has_level_field(self):
        """AgentState должен иметь поле level."""
        from agentco.orchestration.state import AgentState
        import typing
        hints = typing.get_type_hints(AgentState)
        assert "level" in hints, f"level not in AgentState fields: {list(hints.keys())}"

    def test_agent_state_has_agent_id_field(self):
        """AgentState должен иметь поле agent_id."""
        from agentco.orchestration.state import AgentState
        import typing
        hints = typing.get_type_hints(AgentState)
        assert "agent_id" in hints, f"agent_id not in AgentState fields: {list(hints.keys())}"

    def test_agent_state_with_level_and_agent_id(self):
        """Можно создать AgentState с level и agent_id."""
        from agentco.orchestration.state import AgentState
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "company-001",
            "input": "task",
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
            "level": 0,
            "agent_id": "ceo",
        }
        assert state["level"] == 0
        assert state["agent_id"] == "ceo"


class TestGraphCompileFunction:
    """graph.py должен экспортировать compile() функцию."""

    def test_graph_module_exports_compile_function(self):
        """graph модуль должен иметь compile() функцию."""
        import agentco.orchestration.graph as g
        assert hasattr(g, "compile"), "graph module should export compile() function"

    def test_graph_compile_function_returns_compiled_graph(self):
        """compile() должна возвращать скомпилированный граф."""
        from agentco.orchestration.graph import compile
        result = compile()
        assert result is not None
