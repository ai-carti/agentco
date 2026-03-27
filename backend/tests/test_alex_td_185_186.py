"""
ALEX-TD-185: orchestration/nodes.py real LLM path lacks per-call timeout
ALEX-TD-186: handlers/library.py fork_agent use_count increment is not atomic
"""
import asyncio
import inspect
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── ALEX-TD-185: asyncio.wait_for wraps litellm.acompletion in _mock_llm_call ─

class TestALEXTD185LLMCallTimeout:
    """Real LLM path in _mock_llm_call must be wrapped with asyncio.wait_for."""

    def test_mock_llm_call_source_has_wait_for_in_real_path(self):
        """_mock_llm_call source must contain asyncio.wait_for wrapping acompletion."""
        from agentco.orchestration import nodes
        src = inspect.getsource(nodes._mock_llm_call)
        assert "asyncio.wait_for" in src, (
            "ALEX-TD-185: _mock_llm_call must wrap litellm.acompletion in asyncio.wait_for "
            "to prevent indefinite blocking of the event loop."
        )

    def test_mock_llm_call_source_reads_llm_call_timeout_sec(self):
        """_mock_llm_call (or its module) must reference LLM_CALL_TIMEOUT_SEC env var."""
        # ALEX-TD-279: timeout is now cached in _LLM_CALL_TIMEOUT module-level constant,
        # which reads LLM_CALL_TIMEOUT_SEC at import time. Verify the module source
        # (not just the function) references LLM_CALL_TIMEOUT_SEC.
        import agentco.orchestration.nodes as nodes_mod
        import inspect
        module_src = inspect.getsource(nodes_mod)
        assert "LLM_CALL_TIMEOUT_SEC" in module_src, (
            "ALEX-TD-185: nodes module must use LLM_CALL_TIMEOUT_SEC env var "
            "(either in _mock_llm_call or in module-level _LLM_CALL_TIMEOUT constant)."
        )

    @pytest.mark.asyncio
    async def test_mock_llm_call_real_path_raises_on_timeout(self):
        """When LLM hangs beyond timeout, asyncio.TimeoutError must propagate."""
        # ALEX-TD-279: _USE_REAL_LLM and _LLM_CALL_TIMEOUT are now module-level cached —
        # patch via patch.object instead of monkeypatch.setenv
        async def _hanging(*args, **kwargs):
            await asyncio.sleep(10)  # simulate hung LLM

        import agentco.orchestration.nodes as nodes_mod
        with patch.object(nodes_mod, "_USE_REAL_LLM", True), \
             patch.object(nodes_mod, "_LLM_CALL_TIMEOUT", 0.05), \
             patch.object(nodes_mod, "litellm") as mock_litellm:
            mock_litellm.acompletion = _hanging
            with pytest.raises(asyncio.TimeoutError):
                await nodes_mod._mock_llm_call(
                    system="test system",
                    user="test user",
                    mock_response="unused",
                )

    @pytest.mark.asyncio
    async def test_mock_llm_call_mock_path_not_affected_by_wait_for(self):
        """Default mock path (no AGENTCO_USE_REAL_LLM) works normally regardless."""
        # ALEX-TD-279: patch via patch.object (module-level cached bool)
        import agentco.orchestration.nodes as nodes_mod
        with patch.object(nodes_mod, "_USE_REAL_LLM", False):
            content, tokens, cost = await nodes_mod._mock_llm_call(
                system="test system",
                user="test user",
                mock_response="hello world",
            )
        assert content == "hello world"
        assert tokens > 0
        assert cost >= 0.0


# ── ALEX-TD-186: fork_agent use_count atomic SQL UPDATE ──────────────────────

class TestALEXTD186AtomicUseCount:
    """fork_agent must use atomic SQL UPDATE for use_count, not ORM read-modify-write."""

    def test_fork_agent_source_uses_atomic_sql_update(self):
        """fork_agent must use session.execute(update(...).values(use_count=...)) not ORM assignment."""
        from agentco.handlers import library
        src = inspect.getsource(library)

        # Must NOT have ORM-level assignment like `lib_entry.use_count =`
        assert "lib_entry.use_count =" not in src, (
            "ALEX-TD-186: fork_agent must NOT use ORM-level assignment "
            "`lib_entry.use_count = (lib_entry.use_count or 0) + 1` — "
            "this is a non-atomic read-modify-write. Use SQL UPDATE instead."
        )

        # Must use atomic SQL UPDATE
        assert "use_count=AgentLibraryORM.use_count + 1" in src or \
               "use_count = AgentLibraryORM.use_count + 1" in src, (
            "ALEX-TD-186: fork_agent must use atomic SQL UPDATE: "
            "session.execute(update(AgentLibraryORM).where(...).values(use_count=AgentLibraryORM.use_count + 1))"
        )

    def test_fork_agent_increments_use_count(self, auth_client):
        """POST /api/companies/{id}/agents/fork → use_count in library entry incremented."""
        client, _ = auth_client

        # Register and setup
        client.post("/auth/register", json={"email": "td186_fork@example.com", "password": "pass1234"})
        resp = client.post("/auth/login", json={"email": "td186_fork@example.com", "password": "pass1234"})
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create company
        resp = client.post("/api/companies/", json={"name": "TD186 Corp"}, headers=headers)
        assert resp.status_code == 201
        company_id = resp.json()["id"]

        # Create agent
        resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": "TD186 Agent", "role": "worker"},
            headers=headers,
        )
        assert resp.status_code == 201
        agent_id = resp.json()["id"]

        # Save agent to library
        resp = client.post(
            "/api/library",
            json={"agent_id": agent_id},
            headers=headers,
        )
        assert resp.status_code == 201
        lib_id = resp.json()["id"]
        initial_use_count = resp.json().get("use_count", 0) or 0

        # Fork the library agent
        resp = client.post(
            f"/api/companies/{company_id}/agents/fork",
            json={"library_agent_id": lib_id},
            headers=headers,
        )
        assert resp.status_code == 201, f"Fork failed: {resp.text}"

        # use_count should have incremented by 1
        resp = client.get(f"/api/library/{lib_id}/portfolio", headers=headers)
        # portfolio may not expose use_count directly; check library listing instead
        resp2 = client.get("/api/library", headers=headers)
        assert resp2.status_code == 200
        entries = resp2.json()
        lib_entry = next((e for e in entries if e["id"] == lib_id), None)
        assert lib_entry is not None
        assert (lib_entry.get("use_count") or 0) == initial_use_count + 1, (
            f"ALEX-TD-186: use_count should be {initial_use_count + 1}, "
            f"got {lib_entry.get('use_count')}"
        )
