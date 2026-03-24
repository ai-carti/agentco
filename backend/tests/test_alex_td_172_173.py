"""
ALEX-TD-172: handlers/library.py — LibrarySaveRequest.agent_id and
             ForkRequest.library_agent_id lack max_length constraint.
ALEX-TD-173: tests/test_auth.py — no test for oversized password at Field level
             (regression coverage for ALEX-TD-170 fix).

TDD: tests written first (red), then fix (green).
"""
import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="td172@example.com", password="password123"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


# ── ALEX-TD-172: max_length on agent_id / library_agent_id ───────────────────

def test_save_to_library_with_10kb_agent_id_returns_422(auth_client):
    """POST /api/library with 10KB agent_id must return 422 (not 404 after DB lookup).

    ALEX-TD-172: LibrarySaveRequest.agent_id is plain str without max_length.
    A 10KB agent_id is sent to DB as-is in session.get(AgentORM, body.agent_id) —
    no input validation boundary. Fix: Field(max_length=36) or Field(max_length=100).
    """
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.post(
        "/api/library",
        json={"agent_id": "A" * 10_000},
        headers={"Authorization": f"Bearer {token}"},
    )
    # Should be rejected at field validation (422), not reach DB lookup (404)
    assert resp.status_code == 422, (
        f"Expected 422 for 10KB agent_id, got {resp.status_code}: {resp.json()}"
    )


def test_fork_with_10kb_library_agent_id_returns_422(auth_client):
    """POST /api/companies/{id}/agents/fork with 10KB library_agent_id → 422.

    ALEX-TD-172: ForkRequest.library_agent_id is plain str without max_length.
    """
    client, _ = auth_client
    token = _register_and_login(client, email="td172b@example.com")

    # Create a company first
    company_resp = client.post(
        "/api/companies/",
        json={"name": "TestCo172"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert company_resp.status_code == 201
    company_id = company_resp.json()["id"]

    resp = client.post(
        f"/api/companies/{company_id}/agents/fork",
        json={"library_agent_id": "A" * 10_000},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for 10KB library_agent_id, got {resp.status_code}: {resp.json()}"
    )


# ── ALEX-TD-173: regression test for ALEX-TD-170 at Field level ──────────────

def test_register_password_exactly_128_chars_rejected_at_field_level(auth_client):
    """Verify max_length=128 on RegisterRequest.password is enforced at Field level.

    ALEX-TD-173: This is a regression guard. Before ALEX-TD-170 fix, Pydantic
    allocated the full string before validator ran. After fix, Field(max_length=128)
    catches 129+ char passwords at field validation.

    This test explicitly verifies the 128/129 boundary is enforced.
    """
    client, _ = auth_client

    # 129 chars: should fail max_length=128
    resp_over = client.post(
        "/auth/register",
        json={"email": "td173a@example.com", "password": "X" * 129},
    )
    assert resp_over.status_code == 422, (
        f"Expected 422 for 129-char password, got {resp_over.status_code}"
    )
    # Error message should reference the field max_length, not the custom validator
    errors = resp_over.json().get("detail", [])
    assert any(
        "password" in str(e).lower() for e in errors
    ), f"Expected password error in 422 detail, got: {errors}"


def test_register_password_field_constraint_visible_in_schema(auth_client):
    """RegisterRequest.password max_length=128 must appear in OpenAPI schema.

    ALEX-TD-170/173: Field(max_length=128) makes the constraint visible in OpenAPI
    docs and client SDK generators. Without Field(max_length=...), only the validator
    enforces the limit, which is invisible to schema consumers.
    """
    client, _ = auth_client
    resp = client.get("/openapi.json")
    assert resp.status_code == 200

    schema = resp.json()
    # Locate RegisterRequest schema
    components = schema.get("components", {}).get("schemas", {})
    register_schema = components.get("RegisterRequest", {})
    password_props = register_schema.get("properties", {}).get("password", {})

    assert password_props.get("maxLength") == 128, (
        f"Expected RegisterRequest.password maxLength=128 in OpenAPI schema, "
        f"got: {password_props}"
    )
