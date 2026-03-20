"""
POST-006: Hierarchical agents (>2 levels) — TDD tests.

AC:
1. Агенты могут иметь parent_agent_id на любую глубину (schema + hierarchy_level)
2. Оркестратор рекурсивно создаёт subgraph для агентов-родителей
3. Агент любого уровня может создавать подзадачи для подчинённых
4. Loop detection работает при глубокой иерархии
5. GET /api/companies/{id}/agents/tree возвращает дерево
6. Минимум 5 тестов: глубина >2, дерево, loop detection
7. Все существующие тесты зелёные
"""
import pytest


# ── Тест 1: Agent ORM поддерживает parent_agent_id и hierarchy_level ─────────

class TestAgentHierarchySchema:
    """AC1: schema поддерживает parent_agent_id и hierarchy_level."""

    def test_agent_orm_has_parent_agent_id(self):
        """AgentORM должна иметь поле parent_agent_id."""
        from agentco.orm.agent import AgentORM
        assert hasattr(AgentORM, "parent_agent_id")

    def test_agent_orm_has_hierarchy_level(self):
        """AgentORM должна иметь поле hierarchy_level."""
        from agentco.orm.agent import AgentORM
        assert hasattr(AgentORM, "hierarchy_level")

    def test_agent_model_has_parent_agent_id(self):
        """Pydantic Agent model должна иметь parent_agent_id."""
        from agentco.models.agent import Agent
        import inspect
        fields = Agent.model_fields
        assert "parent_agent_id" in fields

    def test_agent_model_has_hierarchy_level(self):
        """Pydantic Agent model должна иметь hierarchy_level."""
        from agentco.models.agent import Agent
        fields = Agent.model_fields
        assert "hierarchy_level" in fields

    def test_agent_hierarchy_level_default_is_zero(self):
        """По умолчанию hierarchy_level = 0."""
        from agentco.models.agent import Agent
        agent = Agent(company_id="co-1", name="CEO")
        assert agent.hierarchy_level == 0
        assert agent.parent_agent_id is None


# ── Тест 2: Создание дерева агентов (CEO → CTO → SWE) ────────────────────────

class TestAgentHierarchyAPI:
    """AC1+AC5: создание иерархических агентов и получение дерева."""

    def _register_and_login(self, client, email="h@test.com"):
        client.post("/auth/register", json={"email": email, "password": "secret"})
        r = client.post("/auth/login", json={"email": email, "password": "secret"})
        return r.json()["access_token"]

    def test_create_child_agent_with_parent(self, auth_client):
        """Создать агента с parent_agent_id — hierarchy_level должен быть 1."""
        client, _ = auth_client
        token = self._register_and_login(client)
        h = {"Authorization": f"Bearer {token}"}

        # Создать компанию
        co = client.post("/api/companies/", json={"name": "HierCo"}, headers=h)
        assert co.status_code == 201
        company_id = co.json()["id"]

        # Создать CEO (level 0)
        ceo_r = client.post(f"/api/companies/{company_id}/agents",
                            json={"name": "CEO", "role": "ceo"}, headers=h)
        assert ceo_r.status_code == 201
        ceo_id = ceo_r.json()["id"]
        assert ceo_r.json()["hierarchy_level"] == 0

        # Создать CTO (level 1, parent = CEO)
        cto_r = client.post(f"/api/companies/{company_id}/agents",
                            json={"name": "CTO", "role": "cto", "parent_agent_id": ceo_id},
                            headers=h)
        assert cto_r.status_code == 201
        cto_data = cto_r.json()
        assert cto_data["hierarchy_level"] == 1
        assert cto_data["parent_agent_id"] == ceo_id

    def test_create_deep_hierarchy_3_levels(self, auth_client):
        """CEO(0) → CTO(1) → SWE(2): 3 уровня иерархии."""
        client, _ = auth_client
        token = self._register_and_login(client, email="deep@test.com")
        h = {"Authorization": f"Bearer {token}"}

        co = client.post("/api/companies/", json={"name": "DeepCo"}, headers=h)
        company_id = co.json()["id"]

        # Уровень 0
        ceo = client.post(f"/api/companies/{company_id}/agents",
                          json={"name": "CEO"}, headers=h)
        ceo_id = ceo.json()["id"]

        # Уровень 1
        cto = client.post(f"/api/companies/{company_id}/agents",
                          json={"name": "CTO", "parent_agent_id": ceo_id}, headers=h)
        assert cto.json()["hierarchy_level"] == 1
        cto_id = cto.json()["id"]

        # Уровень 2
        swe = client.post(f"/api/companies/{company_id}/agents",
                          json={"name": "SWE", "parent_agent_id": cto_id}, headers=h)
        assert swe.json()["hierarchy_level"] == 2

        # Уровень 3 (произвольная глубина)
        qa = client.post(f"/api/companies/{company_id}/agents",
                         json={"name": "QA", "parent_agent_id": swe.json()["id"]}, headers=h)
        assert qa.json()["hierarchy_level"] == 3

    def test_get_agents_tree_returns_nested_structure(self, auth_client):
        """AC5: GET /agents/tree возвращает дерево, не плоский список."""
        client, _ = auth_client
        token = self._register_and_login(client, email="tree@test.com")
        h = {"Authorization": f"Bearer {token}"}

        co = client.post("/api/companies/", json={"name": "TreeCo"}, headers=h)
        company_id = co.json()["id"]

        # CEO → CTO → SWE
        ceo = client.post(f"/api/companies/{company_id}/agents",
                          json={"name": "CEO"}, headers=h)
        ceo_id = ceo.json()["id"]

        cto = client.post(f"/api/companies/{company_id}/agents",
                          json={"name": "CTO", "parent_agent_id": ceo_id}, headers=h)
        cto_id = cto.json()["id"]

        client.post(f"/api/companies/{company_id}/agents",
                    json={"name": "SWE", "parent_agent_id": cto_id}, headers=h)

        # Get tree
        tree_r = client.get(f"/api/companies/{company_id}/agents/tree", headers=h)
        assert tree_r.status_code == 200
        tree = tree_r.json()

        # Root должен быть один (CEO)
        assert len(tree) == 1
        root = tree[0]
        assert root["name"] == "CEO"
        assert len(root["children"]) == 1

        # CTO под CEO
        cto_node = root["children"][0]
        assert cto_node["name"] == "CTO"
        assert len(cto_node["children"]) == 1

        # SWE под CTO
        swe_node = cto_node["children"][0]
        assert swe_node["name"] == "SWE"
        assert swe_node["children"] == []

    def test_tree_flat_agents_returns_single_level(self, auth_client):
        """Агенты без parent_agent_id — все в корне дерева."""
        client, _ = auth_client
        token = self._register_and_login(client, email="flat@test.com")
        h = {"Authorization": f"Bearer {token}"}

        co = client.post("/api/companies/", json={"name": "FlatCo"}, headers=h)
        company_id = co.json()["id"]

        for name in ["A", "B", "C"]:
            client.post(f"/api/companies/{company_id}/agents",
                        json={"name": name}, headers=h)

        tree_r = client.get(f"/api/companies/{company_id}/agents/tree", headers=h)
        assert tree_r.status_code == 200
        tree = tree_r.json()
        assert len(tree) == 3
        for node in tree:
            assert node["children"] == []


# ── Тест 3: Loop detection при глубокой иерархии ─────────────────────────────

class TestLoopDetectionDeepHierarchy:
    """AC4: loop detection работает корректно при глубокой иерархии."""

    @pytest.mark.asyncio
    async def test_hierarchical_node_respects_iteration_limit(self, monkeypatch):
        """hierarchical_node должен вернуть status='failed' при превышении итераций."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "3")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)

        from agentco.orchestration.nodes import hierarchical_node
        from agentco.orchestration.state import AgentState, TaskMessage

        task: TaskMessage = {
            "task_id": "task-deep-001",
            "from_agent_id": "cto",
            "to_agent_id": "swe",
            "description": "Write deep code",
            "context": {},
            "depth": 2,
        }
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "co-001",
            "input": "Deep task",
            "messages": [],
            "pending_tasks": [task],
            "active_tasks": {"task-deep-001": task},
            "results": {},
            "iteration_count": 3,  # == limit
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
        }
        result = await hierarchical_node(state)
        assert result.get("status") == "failed"
        assert result.get("error") == "loop_detected"

    @pytest.mark.asyncio
    async def test_hierarchical_graph_stops_on_cost_limit(self, monkeypatch):
        """Иерархический граф с cost limit — должен завершиться как 'failed'."""
        monkeypatch.setenv("MAX_RUN_COST_USD", "0.0001")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)
        import agentco.orchestration.graph as graph_mod
        importlib.reload(graph_mod)

        from agentco.orchestration.state import AgentState

        graph = graph_mod.build_hierarchical_graph(max_depth=3)
        compiled = graph.compile()

        initial_state: AgentState = {
            "run_id": "run-cost-deep",
            "company_id": "co-001",
            "input": "Very expensive deep task",
            "messages": [],
            "pending_tasks": [],
            "active_tasks": {},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.5,  # уже выше лимита 0.0001
            "status": "running",
            "error": None,
            "final_result": None,
        }

        final_state = await compiled.ainvoke(initial_state)
        assert final_state["status"] == "failed"
        assert final_state["error"] == "cost_limit_exceeded"


# ── Тест 4: Рекурсивный граф — полный прогон >2 уровней ──────────────────────

class TestHierarchicalGraphExecution:
    """AC2+AC3: оркестратор рекурсивно создаёт subgraph, агент делегирует подчинённым."""

    def test_hierarchical_graph_compiles(self):
        """build_hierarchical_graph должен компилироваться без ошибок."""
        from agentco.orchestration.graph import build_hierarchical_graph
        graph = build_hierarchical_graph(max_depth=3)
        compiled = graph.compile()
        assert compiled is not None

    def test_compile_hierarchical_function_exists(self):
        """graph модуль экспортирует compile_hierarchical()."""
        import agentco.orchestration.graph as g
        assert hasattr(g, "compile_hierarchical")
        assert hasattr(g, "build_hierarchical_graph")

    @pytest.mark.asyncio
    async def test_hierarchical_graph_runs_3_levels(self):
        """Граф с max_depth=3 должен завершиться без зависания."""
        from agentco.orchestration.graph import build_hierarchical_graph
        from agentco.orchestration.state import AgentState

        graph = build_hierarchical_graph(max_depth=3)
        compiled = graph.compile()

        initial_state: AgentState = {
            "run_id": "run-deep-test",
            "company_id": "co-001",
            "input": "Build a full product at 3 levels",
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
            "max_depth": 3,
        }

        final_state = await compiled.ainvoke(initial_state)
        # Должен завершиться (completed или failed из-за loop guard, не зависнуть)
        assert final_state["status"] in ("completed", "failed")
        assert final_state["iteration_count"] > 0

    @pytest.mark.asyncio
    async def test_hierarchical_node_delegates_at_intermediate_depth(self, monkeypatch):
        """hierarchical_node при depth < max_depth должен создавать дочернюю задачу (delegated)."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "50")
        monkeypatch.setenv("MAX_RUN_COST_USD", "10.0")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)

        from agentco.orchestration.nodes import hierarchical_node
        from agentco.orchestration.state import AgentState, TaskMessage

        task: TaskMessage = {
            "task_id": "task-mid-001",
            "from_agent_id": "ceo",
            "to_agent_id": "cto",
            "description": "Design architecture",
            "context": {},
            "depth": 1,  # уровень 1, max_depth=3 → должен делегировать
        }
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "co-001",
            "input": "Deep task",
            "messages": [],
            "pending_tasks": [task],
            "active_tasks": {"task-mid-001": task},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
            "max_depth": 3,
        }
        result = await hierarchical_node(state)
        # Должен создать дочернюю задачу
        assert len(result.get("pending_tasks", [])) > 0
        # Оригинальная задача — delegated
        results = result.get("results", {})
        assert "task-mid-001" in results
        assert results["task-mid-001"]["status"] == "delegated"

    @pytest.mark.asyncio
    async def test_hierarchical_node_executes_at_max_depth(self, monkeypatch):
        """hierarchical_node при depth == max_depth должен выполнить напрямую (done)."""
        monkeypatch.setenv("MAX_AGENT_ITERATIONS", "50")
        monkeypatch.setenv("MAX_RUN_COST_USD", "10.0")
        import importlib
        import agentco.orchestration.nodes as nodes_mod
        importlib.reload(nodes_mod)

        from agentco.orchestration.nodes import hierarchical_node
        from agentco.orchestration.state import AgentState, TaskMessage

        task: TaskMessage = {
            "task_id": "task-leaf-001",
            "from_agent_id": "cto",
            "to_agent_id": "swe",
            "description": "Write unit tests",
            "context": {},
            "depth": 3,  # == max_depth → leaf execution
        }
        state: AgentState = {
            "run_id": "run-001",
            "company_id": "co-001",
            "input": "Deep task",
            "messages": [],
            "pending_tasks": [task],
            "active_tasks": {"task-leaf-001": task},
            "results": {},
            "iteration_count": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "status": "running",
            "error": None,
            "final_result": None,
            "max_depth": 3,
        }
        result = await hierarchical_node(state)
        # Leaf — нет дочерних задач, результат done
        assert result.get("pending_tasks") == []
        results = result.get("results", {})
        assert "task-leaf-001" in results
        assert results["task-leaf-001"]["status"] == "done"
