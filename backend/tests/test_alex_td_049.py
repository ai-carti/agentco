"""
ALEX-TD-049: ApiV1AliasMiddleware doesn't update path_params after rewriting scope["path"].

The middleware mutates scope["path"] and "raw_path" but doesn't reset scope["path_params"].
If stale path_params exist in scope (e.g., from a wrapping ASGI layer or middleware chain),
the route handler could receive wrong parameter values.

The fix: after rewriting path, reset scope["path_params"] = {} so the router
re-derives them from the new path during match.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from agentco.main import app, ApiV1AliasMiddleware


# ── Unit test: middleware must reset path_params after rewrite ────────────────

@pytest.mark.asyncio
async def test_middleware_resets_path_params_on_v1_rewrite():
    """
    ALEX-TD-049 core: when scope has stale path_params and path is /api/v1/...,
    middleware must clear path_params so router re-derives them from the new path.

    RED before fix: middleware leaves stale path_params intact.
    GREEN after fix: middleware resets path_params = {} after rewrite.
    """
    captured_scope = {}

    async def mock_app(scope, receive, send):
        # Capture scope as seen by the inner app after middleware processing
        captured_scope.update(scope)

    middleware = ApiV1AliasMiddleware(mock_app)

    # Simulate scope with STALE path_params (pre-populated by an outer layer)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/companies/abc123",
        "raw_path": b"/api/v1/companies/abc123",
        "query_string": b"",
        "headers": [],
        "path_params": {"company_id": "STALE_WRONG_VALUE"},  # stale — must be cleared
        "app": MagicMock(),
    }

    receive = AsyncMock()
    send = AsyncMock()

    await middleware(scope, receive, send)

    # After middleware rewrites path to /api/companies/abc123,
    # path_params must be reset to {} so the router can re-populate correctly.
    assert captured_scope.get("path") == "/api/companies/abc123", (
        f"Expected path rewrite, got: {captured_scope.get('path')}"
    )
    assert captured_scope.get("path_params") == {}, (
        f"path_params must be reset to {{}} after rewrite, "
        f"got: {captured_scope.get('path_params')}. "
        f"Stale path_params can cause route handler to receive wrong param values."
    )


# ── Integration tests: path_params work correctly via /api/v1/ prefix ────────

def _register_and_login(client, email="td049_user@example.com", password="pass123"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_v1_get_company_by_id_path_params(auth_client):
    """GET /api/v1/companies/{company_id} → 200 with correct data."""
    client, _ = auth_client
    token = _register_and_login(client)

    co_resp = client.post(
        "/api/v1/companies/",
        json={"name": "TD049 Test Company"},
        headers=_auth_headers(token),
    )
    assert co_resp.status_code == 201
    company_id = co_resp.json()["id"]

    resp = client.get(f"/api/v1/companies/{company_id}", headers=_auth_headers(token))
    assert resp.status_code == 200, f"GET /api/v1/companies/{{id}} failed: {resp.text}"
    data = resp.json()
    assert data["id"] == company_id
    assert data["name"] == "TD049 Test Company"


def test_v1_put_company_by_id_path_params(auth_client):
    """PUT /api/v1/companies/{company_id} → 200 (path_params must work)."""
    client, _ = auth_client
    token = _register_and_login(client, email="td049_put@example.com")

    co_resp = client.post(
        "/api/v1/companies/", json={"name": "TD049 Original"}, headers=_auth_headers(token)
    )
    assert co_resp.status_code == 201
    company_id = co_resp.json()["id"]

    resp = client.put(
        f"/api/v1/companies/{company_id}",
        json={"name": "TD049 Updated"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200, f"PUT via /api/v1/ failed: {resp.status_code} {resp.text}"
    assert resp.json()["name"] == "TD049 Updated"


def test_v1_delete_company_by_id_path_params(auth_client):
    """DELETE /api/v1/companies/{company_id} → 204 (path_params must work)."""
    client, _ = auth_client
    token = _register_and_login(client, email="td049_del@example.com")

    co_resp = client.post(
        "/api/v1/companies/", json={"name": "TD049 To Delete"}, headers=_auth_headers(token)
    )
    assert co_resp.status_code == 201
    company_id = co_resp.json()["id"]

    resp = client.delete(f"/api/v1/companies/{company_id}", headers=_auth_headers(token))
    assert resp.status_code == 204, f"DELETE via /api/v1/ failed: {resp.status_code} {resp.text}"


def test_v1_agents_nested_path_params(auth_client):
    """GET /api/v1/companies/{company_id}/agents → 200 (nested path_params must work)."""
    client, _ = auth_client
    token = _register_and_login(client, email="td049_agents@example.com")

    co_resp = client.post(
        "/api/v1/companies/", json={"name": "TD049 Agents Co"}, headers=_auth_headers(token)
    )
    assert co_resp.status_code == 201
    company_id = co_resp.json()["id"]

    resp = client.get(f"/api/v1/companies/{company_id}/agents", headers=_auth_headers(token))
    assert resp.status_code == 200, f"GET nested agents failed: {resp.status_code} {resp.text}"
    assert isinstance(resp.json(), list)
