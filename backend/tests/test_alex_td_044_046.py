"""
TDD тесты для:
- ALEX-TD-044: пагинация GET /memory (limit/offset)
- ALEX-TD-046: order_by в BaseRepository.list()
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest


# ─── ALEX-TD-046: BaseRepository.list() order_by ─────────────────────────────

class TestALEXTD046BaseRepositoryOrderBy:
    """ALEX-TD-046: BaseRepository.list() должен поддерживать order_by."""

    def test_run_repository_list_by_task_ordered_by_started_at_desc(self, auth_client):
        """list_by_task() возвращает раны в порядке started_at DESC."""
        from agentco.orm.run import RunORM
        from agentco.repositories.run import RunRepository
        from sqlalchemy.orm import sessionmaker

        client, engine = auth_client
        # Нужен company_id и task_id — создаём через API
        from tests.test_runs import _register_and_login, _create_company
        token = _register_and_login(client, email="td046a@example.com")
        company_id = _create_company(client, token, name="TD046 Corp A")

        agent_resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": "td046-agent", "model": "gpt-4o-mini"},
            headers={"Authorization": f"Bearer {token}"},
        )
        agent_id = agent_resp.json()["id"]

        task_resp = client.post(
            f"/api/companies/{company_id}/agents/{agent_id}/tasks",
            json={"title": "TD046 Task"},
            headers={"Authorization": f"Bearer {token}"},
        )
        task_id = task_resp.json()["id"]

        # Вставляем 3 рана с разными started_at
        Session = sessionmaker(bind=engine)
        timestamps = [
            datetime(2026, 1, 1, 10, 0, 0),
            datetime(2026, 1, 1, 12, 0, 0),
            datetime(2026, 1, 1, 8, 0, 0),
        ]
        with Session() as db:
            for ts in timestamps:
                db.add(RunORM(
                    id=str(uuid.uuid4()),
                    company_id=company_id,
                    task_id=task_id,
                    agent_id=agent_id,
                    status="completed",
                    started_at=ts,
                ))
            db.commit()

        # RunRepository.list_by_task должен вернуть в порядке DESC по started_at
        with Session() as db:
            repo = RunRepository(db)
            runs = repo.list_by_task(task_id=task_id, limit=10, offset=0)

        assert len(runs) == 3
        # Проверяем порядок: [12:00, 10:00, 08:00]
        assert runs[0].started_at >= runs[1].started_at >= runs[2].started_at, (
            f"Expected DESC order by started_at, got: {[r.started_at for r in runs]}"
        )

    def test_base_repository_list_accepts_order_by_param(self):
        """BaseRepository.list() должен принимать order_by параметр."""
        import inspect
        from agentco.repositories.base import BaseRepository
        sig = inspect.signature(BaseRepository.list)
        params = list(sig.parameters.keys())
        assert "order_by" in params, (
            f"BaseRepository.list() does not accept order_by param. Got: {params}"
        )


# ─── ALEX-TD-044: GET /memory пагинация ──────────────────────────────────────

class TestALEXTD044MemoryPagination:
    """ALEX-TD-044: GET /memory должен поддерживать limit/offset."""

    def _setup_user_company_agent(self, client, email):
        """Вспомогательный метод — создать юзера, компанию, агента."""
        client.post("/auth/register", json={
            "email": email,
            "password": "pass123",
            "name": "TD044 Test",
        })
        login_resp = client.post("/auth/login", json={
            "email": email,
            "password": "pass123",
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        co_resp = client.post("/api/companies/", json={"name": "TD044 Corp"}, headers=headers)
        company_id = co_resp.json()["id"]

        ag_resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": "td044-agent", "model": "gpt-4o-mini"},
            headers=headers,
        )
        agent_id = ag_resp.json()["id"]
        return token, headers, company_id, agent_id

    def test_get_agent_memory_accepts_limit_offset(self, auth_client):
        """GET /memory?limit=10&offset=0 должен вернуть 200."""
        client, _ = auth_client
        token, headers, company_id, agent_id = self._setup_user_company_agent(
            client, "td044a@example.com"
        )

        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/memory?limit=10&offset=0",
            headers=headers,
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_agent_memory_limit_filters_results(self, auth_client, tmp_path):
        """GET /memory?limit=1 должен возвращать не более 1 воспоминания."""
        import os
        from agentco.memory.store import MemoryStore

        client, _ = auth_client
        token, headers, company_id, agent_id = self._setup_user_company_agent(
            client, "td044b@example.com"
        )

        # Вставляем 3 воспоминания напрямую в MemoryStore
        db_path = os.environ.get("AGENTCO_MEMORY_DB", "./agentco_memory.db")
        store = MemoryStore(db_path)
        try:
            embedding = [0.1] * 1536
            for i in range(3):
                store.insert(agent_id, f"task-{i}", f"Memory {i}", embedding)
        finally:
            store.close()

        resp = client.get(
            f"/api/companies/{company_id}/agents/{agent_id}/memory?limit=1&offset=0",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) <= 1, (
            f"Expected at most 1 result with limit=1, got {len(data)}. "
            "GET /memory endpoint does not support pagination."
        )

    def test_memory_store_get_all_accepts_limit_offset(self):
        """MemoryStore.get_all() должен принимать limit и offset параметры."""
        import inspect
        from agentco.memory.store import MemoryStore
        sig = inspect.signature(MemoryStore.get_all)
        params = list(sig.parameters.keys())
        assert "limit" in params, f"MemoryStore.get_all() missing limit param. Got: {params}"
        assert "offset" in params, f"MemoryStore.get_all() missing offset param. Got: {params}"

    def test_memory_store_get_all_paginates(self, tmp_path):
        """MemoryStore.get_all(limit=1, offset=0) должен вернуть только 1 запись."""
        from agentco.memory.store import MemoryStore
        db_path = str(tmp_path / "td044.db")
        store = MemoryStore(db_path)
        try:
            embedding = [0.2] * 1536
            for i in range(5):
                store.insert("agent-td044", f"task-{i}", f"Memory {i}", embedding)

            results = store.get_all(agent_id="agent-td044", limit=2, offset=0)
            assert len(results) == 2, f"Expected 2 with limit=2, got {len(results)}"

            results_offset = store.get_all(agent_id="agent-td044", limit=2, offset=2)
            assert len(results_offset) == 2, f"Expected 2 with offset=2, got {len(results_offset)}"

            # Не должны пересекаться
            ids_page1 = {r["id"] for r in results}
            ids_page2 = {r["id"] for r in results_offset}
            assert ids_page1.isdisjoint(ids_page2), "Pages overlap — offset not working"
        finally:
            store.close()
