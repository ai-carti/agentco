"""
Tests for BUG-041 and BUG-042.

BUG-041: ApiV1AliasMiddleware — double v1 prefix `/api/v1/v1/X` not handled.
BUG-042: Deprecation header missing on old `/api/...` paths with 200 response.

Run: uv run pytest tests/test_bug_041_042.py -v
"""
import pytest
from fastapi.testclient import TestClient
from agentco.main import app


def _register_and_login(client, email="buguser@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ══════════════════════════════════════════════════════════════════════════════
# BUG-041: double v1 prefix
# ══════════════════════════════════════════════════════════════════════════════

def test_double_v1_prefix(auth_client):
    """GET /api/v1/v1/health should not 404 — return 400 (bad request)."""
    client, _ = auth_client
    resp = client.get("/api/v1/v1/health")
    # Acceptable: 400 (bad request for malformed path) or redirect to canonical path.
    # Should NOT be 404 — that's the broken behavior.
    assert resp.status_code != 404, (
        f"Double v1 prefix /api/v1/v1/health returned 404 — BUG-041 not fixed"
    )
    assert resp.status_code in (400, 200, 301, 302, 307, 308), (
        f"Expected 400 or redirect, got {resp.status_code}"
    )


def test_double_v1_prefix_companies(auth_client):
    """GET /api/v1/v1/companies/ — should not silently 404."""
    client, _ = auth_client
    token = _register_and_login(client, "bug041_co@example.com")
    resp = client.get("/api/v1/v1/companies/", headers=_auth(token))
    # Must not 404 silently
    assert resp.status_code != 404, (
        f"Double v1 prefix silently 404'd — BUG-041 not fixed"
    )
    # Either 400 bad request or proper handling
    assert resp.status_code in (400, 200, 401, 301, 302, 307, 308)


# ══════════════════════════════════════════════════════════════════════════════
# BUG-042: Deprecation header on backward-compat 200 responses
# ══════════════════════════════════════════════════════════════════════════════

def test_old_api_200_has_deprecation_header(auth_client):
    """GET /api/companies/ (200 backward compat) must include Deprecation header."""
    client, _ = auth_client
    token = _register_and_login(client, "bug042_depr@example.com")
    resp = client.get(
        "/api/companies/",
        headers=_auth(token),
        follow_redirects=True,
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert "deprecation" in resp.headers, (
        "Response to old /api/companies/ is missing 'Deprecation' header — BUG-042 not fixed"
    )
    depr_value = resp.headers["deprecation"].lower()
    assert depr_value == "true" or depr_value.startswith("date="), (
        f"Deprecation header has unexpected value: {resp.headers['deprecation']}"
    )


def test_old_api_health_200_has_deprecation_header(auth_client):
    """GET /api/health (200 compat) should also include Deprecation header."""
    client, _ = auth_client
    resp = client.get("/api/health", follow_redirects=True)
    assert resp.status_code == 200
    assert "deprecation" in resp.headers, (
        "Response to old /api/health is missing 'Deprecation' header — BUG-042 not fixed"
    )


def test_v1_api_no_deprecation_header(auth_client):
    """GET /api/v1/health should NOT have Deprecation header — it's canonical."""
    client, _ = auth_client
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert "deprecation" not in resp.headers, (
        "Canonical /api/v1/ path should not carry Deprecation header"
    )
