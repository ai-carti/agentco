"""
ALEX-TD-168: GET /api/llm/providers and GET /api/llm/providers/available missing rate limiting.
ALEX-TD-169: LoginRequest.email missing max_length constraint.
"""
import pytest


def _register_and_login(client, email="td168@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── ALEX-TD-168: rate limits on /api/llm/providers endpoints ──────────────────

def test_list_llm_providers_has_rate_limit_in_schema(auth_client):
    """ALEX-TD-168: GET /api/llm/providers must be decorated with @limiter.limit.

    slowapi's @limiter.limit() wraps the function with functools.wraps,
    setting __wrapped__ attribute on the decorated function.
    An undecorated endpoint will NOT have __wrapped__.
    """
    from agentco.handlers.credentials import list_llm_providers
    assert hasattr(list_llm_providers, "__wrapped__"), (
        "list_llm_providers must be decorated with @limiter.limit to prevent DB hammering. "
        "slowapi sets __wrapped__ on decorated functions."
    )


def test_list_available_providers_has_rate_limit_in_schema(auth_client):
    """ALEX-TD-168: GET /api/llm/providers/available must be decorated with @limiter.limit."""
    from agentco.handlers.credentials import list_available_providers
    assert hasattr(list_available_providers, "__wrapped__"), (
        "list_available_providers must be decorated with @limiter.limit. "
        "slowapi sets __wrapped__ on decorated functions."
    )


def test_list_llm_providers_returns_200(auth_client):
    """ALEX-TD-168: GET /api/llm/providers must still work after adding rate limit."""
    client, _ = auth_client
    token = _register_and_login(client, "td168a@example.com")
    resp = client.get("/api/llm/providers", headers=_auth(token))
    assert resp.status_code == 200


def test_list_available_providers_returns_200(auth_client):
    """ALEX-TD-168: GET /api/llm/providers/available must still work after adding rate limit."""
    client, _ = auth_client
    token = _register_and_login(client, "td168b@example.com")
    resp = client.get("/api/llm/providers/available", headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert "all_models" in data


def test_list_llm_providers_requires_auth(auth_client):
    """ALEX-TD-168: GET /api/llm/providers still requires authentication."""
    client, _ = auth_client
    resp = client.get("/api/llm/providers")
    assert resp.status_code == 401


def test_list_available_providers_requires_auth(auth_client):
    """ALEX-TD-168: GET /api/llm/providers/available still requires authentication."""
    client, _ = auth_client
    resp = client.get("/api/llm/providers/available")
    assert resp.status_code == 401


# ── ALEX-TD-169: LoginRequest.email max_length ────────────────────────────────

def test_login_email_max_length_in_schema():
    """ALEX-TD-169: LoginRequest.email must have max_length=254 constraint."""
    from agentco.handlers.auth import LoginRequest
    schema = LoginRequest.model_json_schema()
    email_field = schema.get("properties", {}).get("email", {})
    assert "maxLength" in email_field, (
        f"LoginRequest.email must have max_length constraint (like RegisterRequest). "
        f"Schema: {email_field}"
    )
    assert email_field["maxLength"] <= 254, (
        f"LoginRequest.email maxLength must be <= 254 (RFC 5321 limit), "
        f"got {email_field['maxLength']}"
    )


def test_login_with_oversized_email_returns_422(auth_client):
    """ALEX-TD-169: POST /auth/login with email longer than 254 chars must return 422."""
    client, _ = auth_client
    long_local = "a" * 250
    long_email = f"{long_local}@example.com"  # 262 chars total
    resp = client.post(
        "/auth/login",
        json={"email": long_email, "password": "password123"},
    )
    assert resp.status_code == 422, (
        f"Expected 422 for login email len {len(long_email)}, got {resp.status_code}. "
        "LoginRequest.email must have max_length guard (mirrors RegisterRequest)."
    )


def test_login_with_normal_email_still_works(auth_client):
    """ALEX-TD-169: Adding max_length to LoginRequest.email must not break normal login."""
    client, _ = auth_client
    email = "td169normal@example.com"
    client.post("/auth/register", json={"email": email, "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": email, "password": "pass1234"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
