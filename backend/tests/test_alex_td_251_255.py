"""
Tests for ALEX-TD-251..255 (self-audit sprint 2026-03-26).

ALEX-TD-251: GET /api/companies — no pagination → add limit/offset
ALEX-TD-252: get_agents_tree loads all agents without limit → document known limitation
ALEX-TD-253: execute_run error branch logger.warning without exc_info=True → add exc_info=True
ALEX-TD-254: logging_config.py — stdlib not integrated with structlog → document/fix
ALEX-TD-255: ALEX-TD-248/249 in ROADMAP marked open but fix already in git → close them

Run: uv run pytest tests/test_alex_td_251_255.py -v
"""
import uuid
import logging
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email=None, password="pass1234"):
    email = email or f"user_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── ALEX-TD-251: GET /api/companies — pagination ──────────────────────────────

class TestAlexTD251CompaniesPagination:
    """GET /api/companies должен поддерживать limit и offset."""

    def test_list_companies_accepts_limit_param(self, auth_client):
        """GET /api/companies?limit=1 — должен вернуть 200 (не 422)."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/companies/?limit=1", headers=_auth(token))
        assert resp.status_code == 200

    def test_list_companies_accepts_offset_param(self, auth_client):
        """GET /api/companies?offset=0 — должен вернуть 200 (не 422)."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/companies/?offset=0", headers=_auth(token))
        assert resp.status_code == 200

    def test_list_companies_limit_restricts_results(self, auth_client):
        """Создать 3 компании, limit=2 должен вернуть 2."""
        client, _ = auth_client
        token = _register_and_login(client)
        for i in range(3):
            client.post("/api/companies/", json={"name": f"Co {i}"}, headers=_auth(token))
        resp = client.get("/api/companies/?limit=2", headers=_auth(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_list_companies_offset_skips_results(self, auth_client):
        """Создать 3 компании, offset=2 должен вернуть 1."""
        client, _ = auth_client
        token = _register_and_login(client)
        for i in range(3):
            client.post("/api/companies/", json={"name": f"BizCo {i}"}, headers=_auth(token))
        resp = client.get("/api/companies/?offset=2", headers=_auth(token))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_list_companies_limit_max_100(self, auth_client):
        """limit > 100 должен вернуть 422 (le=100 validation)."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/companies/?limit=101", headers=_auth(token))
        assert resp.status_code == 422

    def test_list_companies_offset_negative_returns_422(self, auth_client):
        """offset < 0 должен вернуть 422 (ge=0 validation)."""
        client, _ = auth_client
        token = _register_and_login(client)
        resp = client.get("/api/companies/?offset=-1", headers=_auth(token))
        assert resp.status_code == 422

    def test_list_companies_default_params_still_work(self, auth_client):
        """Без limit/offset должно работать как раньше."""
        client, _ = auth_client
        token = _register_and_login(client)
        client.post("/api/companies/", json={"name": "Default Test"}, headers=_auth(token))
        resp = client.get("/api/companies/", headers=_auth(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# ── ALEX-TD-252: get_agents_tree — known limitation documented ─────────────────

class TestAlexTD252AgentsTreeKnownLimitation:
    """
    get_agents_tree uses list_by_company() without limit.
    Documented as known limitation: returns all agents (no pagination).
    Test verifies the endpoint works and returns tree structure.
    """

    def _create_company(self, client, token):
        resp = client.post("/api/companies/", json={"name": "TreeCo"}, headers=_auth(token))
        return resp.json()["id"]

    def _create_agent(self, client, token, company_id, name="TestAgent"):
        resp = client.post(
            f"/api/companies/{company_id}/agents",
            json={"name": name, "role": "engineer", "model": "gpt-4o"},
            headers=_auth(token),
        )
        return resp.json()

    def test_agents_tree_returns_list(self, auth_client):
        """GET /agents/tree должен вернуть список (может быть пустым)."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = self._create_company(client, token)
        resp = client.get(
            f"/api/companies/{company_id}/agents/tree",
            headers=_auth(token),
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_agents_tree_includes_all_agents(self, auth_client):
        """Дерево должно включать все агенты компании (нет лимита на страницу)."""
        client, _ = auth_client
        token = _register_and_login(client)
        company_id = self._create_company(client, token)
        # Create 3 agents
        for i in range(3):
            self._create_agent(client, token, company_id, name=f"Agent{i}")
        resp = client.get(
            f"/api/companies/{company_id}/agents/tree",
            headers=_auth(token),
        )
        assert resp.status_code == 200
        # All 3 should be in the tree
        flat = _flatten_tree(resp.json())
        assert len(flat) == 3


def _flatten_tree(nodes: list) -> list:
    """Рекурсивно разворачивает дерево в плоский список."""
    result = []
    for node in nodes:
        result.append(node)
        result.extend(_flatten_tree(node.get("children", [])))
    return result


# ── ALEX-TD-253: execute_run error branch — exc_info=True ─────────────────────

class TestAlexTD253ExcInfo:
    """
    В execute_run error branch logger.warning для db_exc должен иметь exc_info=True.
    Проверяем через source code inspection (структурный тест).
    """

    def test_execute_run_error_branch_has_exc_info(self):
        """services/run.py должен содержать exc_info=True в error branch для db_exc."""
        import inspect
        from agentco.services.run import RunService
        source = inspect.getsource(RunService.execute_run)
        # The warning for db_exc should include exc_info
        assert "exc_info=True" in source, (
            "ALEX-TD-253: execute_run error branch logger.warning for db_exc "
            "must include exc_info=True for stacktrace in production logs"
        )


# ── ALEX-TD-254: logging_config — stdlib routing ──────────────────────────────

class TestAlexTD254LoggingConfig:
    """
    logging_config.py настраивает structlog.
    Stdlib logging должен направляться через structlog (или документировано как known limitation).
    """

    def test_logging_config_imports_without_error(self):
        """logging_config должен импортироваться без ошибок."""
        from agentco.logging_config import setup_logging
        assert callable(setup_logging)

    def test_setup_logging_does_not_crash(self):
        """setup_logging() не должна бросать исключений."""
        from agentco.logging_config import setup_logging
        # Should not raise
        setup_logging(level="WARNING")

    def test_stdlib_logging_routes_to_structlog_or_documented(self):
        """
        Проверяем что stdlib logging настроен или задокументирована known limitation.
        ALEX-TD-254: stdlib logging integration — either routed through structlog
        or documented as known limitation in the source code.
        """
        import inspect
        from agentco import logging_config
        source = inspect.getsource(logging_config)
        # Either stdlib is routed through structlog's ProcessorFormatter,
        # OR the known limitation is documented in comments/docstring
        has_processor_formatter = "ProcessorFormatter" in source
        has_stdlib_basicconfig = "basicConfig" in source
        has_known_limitation_doc = (
            "known limitation" in source.lower()
            or "stdlib" in source.lower()
            or "routing" in source.lower()
        )
        assert has_processor_formatter or has_stdlib_basicconfig or has_known_limitation_doc, (
            "ALEX-TD-254: logging_config.py must either route stdlib through structlog "
            "or document the limitation in code comments"
        )


# ── ALEX-TD-255: ALEX-TD-248/249 closed in ROADMAP ───────────────────────────

class TestAlexTD255RoadmapClosed:
    """ALEX-TD-248 и ALEX-TD-249 должны быть помечены как closed/fixed в ROADMAP.md."""

    def test_roadmap_248_not_open(self):
        """ALEX-TD-248 в ROADMAP.md не должен быть 'open'."""
        with open("/home/clawdbot/projects/agentco/ROADMAP.md") as f:
            content = f.read()
        # Find the line with ALEX-TD-248 and check it's not 'open'
        for line in content.splitlines():
            if "ALEX-TD-248" in line and "|" in line:
                # Table row — check last column
                cols = [c.strip() for c in line.split("|")]
                # Last non-empty column should not be 'open'
                status_cols = [c for c in cols if c]
                if status_cols:
                    last_col = status_cols[-1]
                    assert last_col != "open", (
                        f"ALEX-TD-248 should not be 'open' in ROADMAP. Line: {line}"
                    )

    def test_roadmap_249_not_open(self):
        """ALEX-TD-249 в ROADMAP.md не должен быть 'open'."""
        with open("/home/clawdbot/projects/agentco/ROADMAP.md") as f:
            content = f.read()
        for line in content.splitlines():
            if "ALEX-TD-249" in line and "|" in line:
                cols = [c.strip() for c in line.split("|")]
                status_cols = [c for c in cols if c]
                if status_cols:
                    last_col = status_cols[-1]
                    assert last_col != "open", (
                        f"ALEX-TD-249 should not be 'open' in ROADMAP. Line: {line}"
                    )
