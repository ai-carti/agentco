"""
TDD тесты для:
- ALEX-TD-077: MemoryService принимает VectorStore-совместимый объект
- ALEX-TD-078: MemoryStore = SqliteVecStore (aliased, no dead code)
- ALEX-TD-079: company_id в log-строках run_retry / run_dead_letter
"""
from __future__ import annotations

import logging
import os
from unittest.mock import MagicMock, AsyncMock, patch

import pytest


# ─── ALEX-TD-077: MemoryService accepts VectorStore abstraction ───────────────

class TestALEXTD077MemoryServiceAcceptsAbstraction:
    """MemoryService должен принимать VectorStore-совместимый объект."""

    def test_memory_service_accepts_vector_store_instance(self, tmp_path):
        """MemoryService можно создать с SqliteVecStore напрямую (инъекция зависимости)."""
        from agentco.memory.vector_store import SqliteVecStore
        from agentco.memory.service import MemoryService

        store = SqliteVecStore(db_path=str(tmp_path / "test.db"))
        # Должна принимать VectorStore-совместимый объект — без исключений
        svc = MemoryService(store)
        assert svc._store is store
        store.close()

    def test_memory_service_accepts_pg_vector_store_mock(self):
        """MemoryService принимает любой VectorStore-совместимый объект (мок)."""
        from agentco.memory.vector_store import VectorStore
        from agentco.memory.service import MemoryService

        mock_store = MagicMock(spec=VectorStore)
        svc = MemoryService(mock_store)
        assert svc._store is mock_store

    def test_memory_service_backward_compat_with_db_path(self, tmp_path):
        """MemoryService(db_path_str) по-прежнему работает для обратной совместимости."""
        from agentco.memory.service import MemoryService

        db_path = str(tmp_path / "compat.db")
        svc = MemoryService(db_path)
        assert svc._store is not None
        svc.close()

    def test_memory_service_store_is_not_concrete_memory_store(self, tmp_path):
        """MemoryService не должен жёстко создавать MemoryStore — использует VectorStore."""
        from agentco.memory.vector_store import VectorStore
        from agentco.memory.service import MemoryService

        # Подаём VectorStore-совместимый объект
        mock_store = MagicMock(spec=VectorStore)
        svc = MemoryService(mock_store)
        # _store должен быть тем, что передали
        assert svc._store is mock_store

    @pytest.mark.asyncio
    async def test_memory_service_delegates_to_injected_store(self, monkeypatch):
        """save_memory() и get_relevant_memories() должны вызываться на injected store."""
        from agentco.memory.vector_store import VectorStore
        from agentco.memory.service import MemoryService

        mock_store = MagicMock(spec=VectorStore)
        mock_store.insert.return_value = "mem-001"
        mock_store.search.return_value = [
            {"id": "mem-001", "content": "test", "agent_id": "a1", "task_id": None,
             "created_at": "2026-01-01", "distance": 0.1}
        ]

        async def mock_aembedding(model, input, **kwargs):
            class MockResp:
                data = [type("obj", (), {"embedding": [0.1] * 1536})()]
            return MockResp()

        monkeypatch.setattr("agentco.memory.service.litellm.aembedding", mock_aembedding)

        svc = MemoryService(mock_store)
        await svc.save_memory("agent-1", "task-1", "some content")

        mock_store.insert.assert_called_once()
        call_args = mock_store.insert.call_args
        assert call_args[0][0] == "agent-1"
        assert call_args[0][1] == "task-1"
        assert call_args[0][2] == "some content"


# ─── ALEX-TD-078: MemoryStore = SqliteVecStore (aliased) ─────────────────────

class TestALEXTD078MemoryStoreAliased:
    """MemoryStore в store.py должен быть алиасом SqliteVecStore."""

    def test_memory_store_is_sqlite_vec_store(self):
        """MemoryStore должен быть SqliteVecStore (или его алиасом)."""
        from agentco.memory.store import MemoryStore
        from agentco.memory.vector_store import SqliteVecStore

        assert MemoryStore is SqliteVecStore

    def test_memory_store_importable_from_store_module(self):
        """from agentco.memory.store import MemoryStore — должен работать."""
        from agentco.memory.store import MemoryStore
        assert MemoryStore is not None

    def test_memory_store_importable_from_package(self):
        """from agentco.memory import MemoryStore — должен работать."""
        from agentco.memory import MemoryStore
        assert MemoryStore is not None

    def test_memory_store_has_insert_and_search(self, tmp_path):
        """MemoryStore (после алиасинга) поддерживает insert/search/get_all/close."""
        from agentco.memory.store import MemoryStore

        store = MemoryStore(db_path=str(tmp_path / "alias.db"))
        embedding = [0.1] * 1536
        mem_id = store.insert("agent-1", None, "aliased store test", embedding)
        assert mem_id is not None

        results = store.search("agent-1", embedding, top_k=5)
        assert len(results) >= 1
        assert results[0]["content"] == "aliased store test"

        all_mems = store.get_all("agent-1")
        assert len(all_mems) == 1

        store.close()

    def test_store_py_has_no_duplicate_class_definition(self):
        """store.py не должен содержать отдельный класс MemoryStore (только алиас)."""
        import inspect
        from agentco.memory import store as store_module

        # MemoryStore в store.py должен быть идентичен SqliteVecStore — не отдельным классом
        from agentco.memory.vector_store import SqliteVecStore
        assert store_module.MemoryStore is SqliteVecStore


# ─── ALEX-TD-079: company_id в log-строках retry ─────────────────────────────

class TestALEXTD079CompanyIdInRetryLogs:
    """_execute_agent должен логировать company_id в run_retry и run_dead_letter."""

    @pytest.mark.asyncio
    async def test_run_retry_log_contains_company_id(self, caplog):
        """run_retry log warning должен содержать company_id."""
        import agentco.services.run as run_module
        from agentco.services.run import RunService

        mock_session = MagicMock()
        svc = RunService(mock_session)

        call_count = [0]

        async def mock_execute_run(run_id, session_factory=None):
            call_count[0] += 1
            raise RuntimeError("transient error")

        with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
             patch.dict(os.environ, {"RUN_MAX_RETRIES": "2", "RUN_RETRY_BASE_DELAY": "0.001"}), \
             caplog.at_level(logging.WARNING, logger="agentco.services.run"):
            with pytest.raises(RuntimeError):
                await svc._execute_agent(
                    run_id="run-abc",
                    task_id="task-xyz",
                    agent_id="agent-001",
                    company_id="company-999",
                    session_factory=lambda: mock_session,
                )

        # Должна быть хотя бы одна строка с run_retry и company_id
        retry_records = [r for r in caplog.records if "run_retry" in r.message]
        assert len(retry_records) >= 1, "Ожидалась хотя бы одна run_retry строка"
        assert "company-999" in retry_records[0].message, (
            f"company_id отсутствует в run_retry логе: {retry_records[0].message!r}"
        )

    @pytest.mark.asyncio
    async def test_run_dead_letter_log_contains_company_id(self, caplog):
        """run_dead_letter log error должен содержать company_id."""
        import agentco.services.run as run_module
        from agentco.services.run import RunService

        mock_session = MagicMock()
        svc = RunService(mock_session)

        async def mock_execute_run(run_id, session_factory=None):
            raise RuntimeError("persistent error")

        with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
             patch.dict(os.environ, {"RUN_MAX_RETRIES": "1", "RUN_RETRY_BASE_DELAY": "0.001"}), \
             caplog.at_level(logging.ERROR, logger="agentco.services.run"):
            with pytest.raises(RuntimeError):
                await svc._execute_agent(
                    run_id="run-xyz",
                    task_id="task-abc",
                    agent_id="agent-002",
                    company_id="company-777",
                    session_factory=lambda: mock_session,
                )

        dead_letter_records = [r for r in caplog.records if "run_dead_letter" in r.message]
        assert len(dead_letter_records) >= 1, "Ожидалась хотя бы одна run_dead_letter строка"
        assert "company-777" in dead_letter_records[0].message, (
            f"company_id отсутствует в run_dead_letter логе: {dead_letter_records[0].message!r}"
        )

    @pytest.mark.asyncio
    async def test_no_retry_on_permanent_errors(self):
        """Постоянные ошибки (cost_limit_exceeded) не повторяются."""
        from agentco.services.run import RunService

        mock_session = MagicMock()
        svc = RunService(mock_session)

        class PermanentError(Exception):
            error_code = "cost_limit_exceeded"

        call_count = [0]

        async def mock_execute_run(run_id, session_factory=None):
            call_count[0] += 1
            raise PermanentError("no money")

        with patch.object(svc, "execute_run", side_effect=mock_execute_run), \
             patch.dict(os.environ, {"RUN_MAX_RETRIES": "3"}):
            with pytest.raises(PermanentError):
                await svc._execute_agent(
                    run_id="run-perm",
                    task_id="task-perm",
                    agent_id="agent-003",
                    company_id="company-perm",
                    session_factory=lambda: mock_session,
                )

        # Должен вызваться только 1 раз (без retry)
        assert call_count[0] == 1
