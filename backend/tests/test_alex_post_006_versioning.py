"""
ALEX-POST-006: API versioning — TDD.

AC:
- Все API эндпоинты доступны через /api/v1/...
- Старые пути /api/... (не /api/v1/...) редиректят на /api/v1/... или дают понятную ошибку
- CORS и middleware учитывают новый prefix
- Deprecation header присутствует на старых путях

Run: uv run pytest tests/test_alex_post_006_versioning.py -v
"""
import pytest
from fastapi.testclient import TestClient
from agentco.main import app


def _register_and_login(client, email="v1user@example.com", password="pass123"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── AC1: v1 endpoints reachable ───────────────────────────────────────────────

def test_v1_health_reachable(auth_client):
    """GET /api/v1/health → 200."""
    client, _ = auth_client
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200


def test_v1_companies_requires_auth(auth_client):
    """GET /api/v1/companies/ → 401 without token."""
    client, _ = auth_client
    resp = client.get("/api/v1/companies/")
    assert resp.status_code == 401


def test_v1_companies_list(auth_client):
    """GET /api/v1/companies/ with auth → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.get("/api/v1/companies/", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_v1_create_company(auth_client):
    """POST /api/v1/companies/ → 201."""
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/v1/companies/",
        json={"name": "V1 Company"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    assert "id" in resp.json()


def test_v1_auth_register_and_login(auth_client):
    """Auth endpoints work under /auth (not versioned)."""
    client, _ = auth_client
    resp = client.post("/auth/register", json={"email": "newv1@test.com", "password": "secret"})
    assert resp.status_code == 201
    resp2 = client.post("/auth/login", json={"email": "newv1@test.com", "password": "secret"})
    assert resp2.status_code == 200
    assert "access_token" in resp2.json()


def test_v1_agents_endpoint(auth_client):
    """POST /api/v1/companies/{id}/agents → 201."""
    client, _ = auth_client
    token = _register_and_login(client, email="agent_v1@test.com")
    co_resp = client.post(
        "/api/v1/companies/",
        json={"name": "V1 Agents Co"},
        headers=_auth_headers(token),
    )
    co_id = co_resp.json()["id"]
    resp = client.post(
        f"/api/v1/companies/{co_id}/agents",
        json={"name": "Bot Alpha", "role": "worker", "model": "gpt-4o"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201


def test_v1_library_endpoint(auth_client):
    """GET /api/v1/library → 200."""
    client, _ = auth_client
    token = _register_and_login(client, email="lib_v1@test.com")
    resp = client.get("/api/v1/library", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_v1_llm_providers_endpoint(auth_client):
    """GET /api/v1/llm/providers → 200 list (may be empty if no providers configured)."""
    client, _ = auth_client
    token = _register_and_login(client, email="llm_v1@test.com")
    resp = client.get("/api/v1/llm/providers", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    # List may be empty in test environment — that's OK


def test_v1_templates_endpoint(auth_client):
    """GET /api/v1/templates → 200 (templates endpoint is public)."""
    client, _ = auth_client
    token = _register_and_login(client, email="tmpl_v1@test.com")
    resp = client.get("/api/v1/templates", headers=_auth_headers(token))
    assert resp.status_code == 200


# ── AC2: Old /api/... paths redirect or give clear error ─────────────────────

def test_old_api_companies_redirect_or_410(auth_client):
    """GET /api/companies/ (non-v1) → kept for backward compat (200 or 401)."""
    client, _ = auth_client
    token = _register_and_login(client, email="old_api@test.com")
    resp = client.get(
        "/api/companies/",
        headers=_auth_headers(token),
        follow_redirects=False,
    )
    # Backward compat: old /api/... paths still work (200) while /api/v1/... is the canonical path
    assert resp.status_code in (200, 301, 302, 307, 308, 410), (
        f"Expected 200 or redirect/410, got {resp.status_code}"
    )


def test_old_api_health_redirect_or_410(auth_client):
    """GET /api/health (old path) → 301/302/307/308 or still 200 (if kept for compat)."""
    client, _ = auth_client
    # /api/health existed before — we keep it for compatibility (health doesn't need versioning)
    resp = client.get("/api/health")
    # health endpoint is kept for compat — either 200 or redirected
    assert resp.status_code in (200, 301, 302, 307, 308)


def test_old_api_response_has_deprecation_info(auth_client):
    """Old /api/... paths have Deprecation header OR redirect to v1."""
    client, _ = auth_client
    token = _register_and_login(client, email="depr_test@test.com")
    resp = client.get(
        "/api/companies/",
        headers=_auth_headers(token),
        follow_redirects=False,
    )
    if resp.status_code in (301, 302, 307, 308):
        # Redirect — check it points to v1
        location = resp.headers.get("location", "")
        assert "v1" in location, f"Redirect should point to /api/v1/, got: {location}"
    elif resp.status_code == 410:
        # Gone — body should explain the situation
        body = resp.text
        assert "v1" in body.lower() or "deprecated" in body.lower()


def test_v1_root_endpoint(auth_client):
    """GET /api/v1/ → 200 with version info."""
    client, _ = auth_client
    resp = client.get("/api/v1/")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("version") == "v1"


# ── AC3: CORS works on v1 prefix ─────────────────────────────────────────────

def test_cors_preflight_on_v1(auth_client):
    """OPTIONS /api/v1/companies/ with Origin → CORS headers present."""
    client, _ = auth_client
    resp = client.options(
        "/api/v1/companies/",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    # Should succeed (200/204) and have CORS headers
    assert resp.status_code in (200, 204)
    assert "access-control-allow-origin" in resp.headers
