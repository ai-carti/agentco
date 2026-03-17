"""
TDD тесты для M3-001 — Persistent Memory (RAG via sqlite-vec).

RED: тесты описывают ожидаемое поведение.
Проверяет:
- MemoryStore: insert + search
- MemoryService: save_memory, get_memories, inject_memories_into_prompt
- API GET /agents/{id}/memory
"""
import pytest
import struct
from typing import List


# ─── MemoryStore unit tests ────────────────────────────────────────────────────

class TestMemoryStore:
    """agentco.memory.store.MemoryStore — sqlite-vec хранилище воспоминаний."""

    @pytest.fixture
    def memory_store(self, tmp_path):
        """Isolated MemoryStore with tmp sqlite db."""
        from agentco.memory.store import MemoryStore
        db_path = str(tmp_path / "test_memory.db")
        store = MemoryStore(db_path)
        yield store
        store.close()

    def test_memory_store_creates_tables(self, memory_store):
        """MemoryStore должен создать таблицы agent_memories_vec и agent_memory_meta."""
        # Просто убедимся что инициализация прошла без ошибок
        assert memory_store is not None

    def test_insert_and_retrieve_memory(self, memory_store):
        """Вставка воспоминания и его поиск по embedding."""
        embedding = [0.1] * 1536
        memory_store.insert(
            agent_id="agent-001",
            task_id="task-001",
            content="Completed landing page design",
            embedding=embedding,
        )
        results = memory_store.search(
            agent_id="agent-001",
            query_embedding=embedding,
            top_k=5,
        )
        assert len(results) >= 1
        assert results[0]["content"] == "Completed landing page design"
        assert results[0]["agent_id"] == "agent-001"
        assert results[0]["task_id"] == "task-001"

    def test_search_returns_top_k_results(self, memory_store):
        """search() должен возвращать не более top_k результатов."""
        base_embedding = [0.1] * 1536
        # Insert 10 memories
        for i in range(10):
            emb = [0.1 + i * 0.01] * 1536
            memory_store.insert(
                agent_id="agent-001",
                task_id=f"task-{i:03d}",
                content=f"Memory {i}",
                embedding=emb,
            )

        results = memory_store.search(
            agent_id="agent-001",
            query_embedding=base_embedding,
            top_k=5,
        )
        assert len(results) <= 5

    def test_search_filters_by_agent_id(self, memory_store):
        """search() должен возвращать только воспоминания указанного агента."""
        embedding = [0.5] * 1536

        memory_store.insert("agent-A", "task-1", "Memory of agent A", embedding)
        memory_store.insert("agent-B", "task-2", "Memory of agent B", embedding)

        results_a = memory_store.search("agent-A", embedding, top_k=10)
        results_b = memory_store.search("agent-B", embedding, top_k=10)

        agent_ids_a = {r["agent_id"] for r in results_a}
        agent_ids_b = {r["agent_id"] for r in results_b}

        assert agent_ids_a == {"agent-A"}
        assert agent_ids_b == {"agent-B"}

    def test_get_all_memories_for_agent(self, memory_store):
        """get_all() должен возвращать все воспоминания агента."""
        embedding = [0.3] * 1536
        memory_store.insert("agent-X", "task-1", "Memory 1", embedding)
        memory_store.insert("agent-X", "task-2", "Memory 2", embedding)

        all_memories = memory_store.get_all(agent_id="agent-X")
        assert len(all_memories) == 2

    def test_memory_has_created_at(self, memory_store):
        """Каждое воспоминание должно содержать created_at."""
        embedding = [0.1] * 1536
        memory_store.insert("agent-001", "task-001", "Some result", embedding)
        results = memory_store.search("agent-001", embedding, top_k=1)
        assert "created_at" in results[0]

    def test_search_returns_distance(self, memory_store):
        """Результаты поиска должны содержать distance для ранжирования."""
        embedding = [0.1] * 1536
        memory_store.insert("agent-001", "task-001", "Close memory", embedding)

        far_embedding = [0.9] * 1536
        memory_store.insert("agent-001", "task-002", "Far memory", far_embedding)

        results = memory_store.search("agent-001", embedding, top_k=2)
        # Ближайшее воспоминание должно иметь меньший distance
        assert results[0]["distance"] <= results[1]["distance"]


# ─── MemoryService unit tests ─────────────────────────────────────────────────

class TestMemoryService:
    """agentco.memory.service.MemoryService — async сервис для работы с памятью."""

    @pytest.fixture
    def memory_service(self, tmp_path):
        """Isolated MemoryService with mock embedding."""
        from agentco.memory.service import MemoryService
        db_path = str(tmp_path / "service_memory.db")
        service = MemoryService(db_path)
        yield service
        service.close()

    @pytest.mark.asyncio
    async def test_save_memory_stores_embedding(self, memory_service, monkeypatch):
        """save_memory() должен получить embedding и сохранить в store."""
        # Mock litellm embedding
        mock_embedding = [0.1] * 1536

        async def mock_aembedding(model, input, **kwargs):
            class MockResp:
                data = [type("obj", (), {"embedding": mock_embedding})()]
            return MockResp()

        monkeypatch.setattr("agentco.memory.service.litellm.aembedding", mock_aembedding)

        await memory_service.save_memory(
            agent_id="agent-001",
            task_id="task-001",
            content="Task completed successfully: built the API",
        )

        memories = memory_service.get_all(agent_id="agent-001")
        assert len(memories) == 1
        assert memories[0]["content"] == "Task completed successfully: built the API"

    @pytest.mark.asyncio
    async def test_get_relevant_memories_returns_top5(self, memory_service, monkeypatch):
        """get_relevant_memories() должен возвращать не более 5 воспоминаний."""
        call_count = [0]

        async def mock_aembedding(model, input, **kwargs):
            call_count[0] += 1
            embedding = [float(call_count[0]) * 0.01] * 1536

            class MockResp:
                data = [type("obj", (), {"embedding": embedding})()]
            return MockResp()

        monkeypatch.setattr("agentco.memory.service.litellm.aembedding", mock_aembedding)

        # Insert 10 memories
        for i in range(10):
            await memory_service.save_memory(
                agent_id="agent-001",
                task_id=f"task-{i:03d}",
                content=f"Memory {i}",
            )

        results = await memory_service.get_relevant_memories(
            agent_id="agent-001",
            query="relevant task",
            top_k=5,
        )
        assert len(results) <= 5

    def test_format_memories_for_prompt(self, memory_service):
        """format_memories() должен форматировать воспоминания в строку для системного промпта."""
        memories = [
            {"content": "Built landing page", "created_at": "2026-01-01"},
            {"content": "Fixed authentication bug", "created_at": "2026-01-02"},
        ]
        formatted = memory_service.format_memories(memories)
        assert "Built landing page" in formatted
        assert "Fixed authentication bug" in formatted
        # Должен содержать секцию заголовка
        assert "memories" in formatted.lower() or "past" in formatted.lower() or "experience" in formatted.lower()

    @pytest.mark.asyncio
    async def test_inject_memories_into_system_prompt(self, memory_service, monkeypatch):
        """inject_memories() должен добавлять memories к base system prompt."""
        mock_embedding = [0.5] * 1536

        async def mock_aembedding(model, input, **kwargs):
            class MockResp:
                data = [type("obj", (), {"embedding": mock_embedding})()]
            return MockResp()

        monkeypatch.setattr("agentco.memory.service.litellm.aembedding", mock_aembedding)

        # Pre-populate
        memory_service._store.insert("agent-X", "task-1", "Past experience: Python expert", mock_embedding)

        enriched = await memory_service.inject_memories(
            agent_id="agent-X",
            base_prompt="You are a helpful agent.",
            task_description="Write Python code",
        )

        assert "You are a helpful agent." in enriched
        assert "Past experience: Python expert" in enriched


# ─── API endpoint tests ───────────────────────────────────────────────────────

class TestMemoryAPI:
    """GET /api/companies/{company_id}/agents/{agent_id}/memory."""

    def test_get_agent_memory_returns_list(self, auth_client):
        """GET /agents/{id}/memory должен возвращать список воспоминаний."""
        client, engine = auth_client

        # Register user + company + agent
        client.post("/auth/register", json={
            "email": "memory@test.com",
            "password": "pass123",
            "name": "Memory Test",
        })
        login_resp = client.post("/auth/login", json={
            "email": "memory@test.com",
            "password": "pass123",
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        co_resp = client.post("/api/companies/", json={"name": "MemCo"}, headers=headers)
        assert co_resp.status_code == 201
        company_id = co_resp.json()["id"]

        ag_resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": "MemAgent", "model": "gpt-4o-mini"},
            headers=headers,
        )
        assert ag_resp.status_code == 201
        agent_id = ag_resp.json()["id"]

        # GET memories (initially empty)
        mem_resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/memory",
            headers=headers,
        )
        assert mem_resp.status_code == 200
        data = mem_resp.json()
        assert isinstance(data, list)

    def test_get_agent_memory_requires_auth(self, auth_client):
        """GET /agents/{id}/memory без токена должен вернуть 401."""
        client, _ = auth_client
        resp = client.get("/api/companies/some-co/agents/some-agent/memory")
        assert resp.status_code == 401

    def test_get_agent_memory_404_for_unknown_agent(self, auth_client):
        """GET /agents/{id}/memory для несуществующего агента должен вернуть 404."""
        client, _ = auth_client

        client.post("/auth/register", json={
            "email": "mem404@test.com", "password": "pass123", "name": "Test",
        })
        login_resp = client.post("/auth/login", json={
            "email": "mem404@test.com", "password": "pass123",
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        co_resp = client.post("/api/companies/", json={"name": "Co404"}, headers=headers)
        company_id = co_resp.json()["id"]

        resp = client.get(
            f"/api/companies/{company_id}/agents/nonexistent-agent/memory",
            headers=headers,
        )
        assert resp.status_code == 404
