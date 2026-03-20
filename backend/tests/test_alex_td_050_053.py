"""
ALEX-TD-050: POST /api/llm/validate-key must be rate limited.
ALEX-TD-051: RunCreate.goal must have max_length=10000.
ALEX-TD-052: GET /health must return 503 when DB is down.
ALEX-TD-053: encryption._get_fernet() must cache Fernet instance.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from agentco.main import app


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="td050_user@example.com", password="pass123"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── ALEX-TD-050: validate-key is rate limited ─────────────────────────────────

def test_validate_key_requires_auth(auth_client):
    """POST /api/llm/validate-key без токена → 401."""
    client, _ = auth_client
    resp = client.post(
        "/api/llm/validate-key",
        json={"provider": "openai", "api_key": "sk-test"},
    )
    assert resp.status_code == 401


def test_validate_key_has_limiter_decorator():
    """ALEX-TD-050: validate_llm_key endpoint must have @limiter.limit applied.

    slowapi's @limiter.limit() sets __wrapped__ on the decorated function.
    We also verify the endpoint accepts a Request param (required for slowapi).
    """
    import inspect
    from agentco.handlers.credentials import validate_llm_key
    # slowapi's @limiter.limit wraps the function and sets __wrapped__
    assert hasattr(validate_llm_key, "__wrapped__"), (
        "validate_llm_key must have @limiter.limit decorator (ALEX-TD-050). "
        "Missing __wrapped__ means the decorator was not applied. "
        "Missing rate limiting = LLM cost abuse vector."
    )
    # Also verify that 'request: Request' is in the signature (required by slowapi)
    sig = inspect.signature(validate_llm_key)
    assert "request" in sig.parameters, (
        "validate_llm_key must accept 'request: Request' parameter for slowapi rate limiting."
    )


# ── ALEX-TD-051: RunCreate.goal max_length ────────────────────────────────────

def test_run_create_goal_max_length_rejected(auth_client):
    """ALEX-TD-051: RunCreate.goal > 10000 chars must be rejected with 422."""
    client, _ = auth_client
    token = _register_and_login(client, email="td051_user@example.com")

    # Create a company first
    co_resp = client.post(
        "/api/companies/", json={"name": "TD051 Co"}, headers=_auth_headers(token)
    )
    assert co_resp.status_code == 201
    company_id = co_resp.json()["id"]

    # Attempt to create a run with a goal that exceeds max_length
    huge_goal = "x" * 10001
    resp = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": huge_goal},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 422, (
        f"Goal with {len(huge_goal)} chars must be rejected (max_length=10000). Got {resp.status_code}"
    )


def test_run_create_goal_at_max_length_accepted(auth_client):
    """ALEX-TD-051: RunCreate.goal == 10000 chars must be accepted."""
    from agentco.handlers.runs import RunCreate
    # Validate at model level
    rc = RunCreate(goal="x" * 10000)
    assert len(rc.goal) == 10000


def test_run_create_goal_too_long_rejected_at_model_level():
    """ALEX-TD-051: RunCreate.goal > 10000 chars raises ValidationError at model level."""
    from pydantic import ValidationError
    from agentco.handlers.runs import RunCreate
    with pytest.raises(ValidationError):
        RunCreate(goal="x" * 10001)


# ── ALEX-TD-052: /health returns 503 when DB unreachable ─────────────────────

def test_health_returns_200_when_db_ok():
    """GET /health → 200 when DB is available (normal case)."""
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_health_returns_503_when_db_down():
    """ALEX-TD-052: GET /health → 503 when DB is unreachable."""
    from sqlalchemy.exc import OperationalError
    client = TestClient(app, raise_server_exceptions=False)

    # SessionLocal is imported inside health_check() from .db.session — patch there
    with patch("agentco.db.session.SessionLocal") as mock_session_local:
        mock_session = MagicMock()
        mock_session.execute.side_effect = OperationalError(
            "connection refused", None, None
        )
        mock_session.close = MagicMock()
        mock_session_local.return_value = mock_session

        resp = client.get("/health")
    assert resp.status_code == 503, (
        f"Expected 503 when DB down, got {resp.status_code}: {resp.text}"
    )
    data = resp.json()
    assert data["status"] == "error"


# ── ALEX-TD-053: Fernet caching ───────────────────────────────────────────────

def test_fernet_returns_same_instance_on_repeated_calls():
    """ALEX-TD-053: _get_fernet() must return the same Fernet instance when key is unchanged."""
    import importlib
    import agentco.services.encryption as enc_mod

    # Reset cache to ensure clean state
    enc_mod._fernet_cache = None

    with patch.dict("os.environ", {"ENCRYPTION_KEY": ""}, clear=False):
        # Remove ENCRYPTION_KEY to use dev fallback consistently
        import os
        old_key = os.environ.pop("ENCRYPTION_KEY", None)
        try:
            f1 = enc_mod._get_fernet()
            f2 = enc_mod._get_fernet()
        finally:
            if old_key is not None:
                os.environ["ENCRYPTION_KEY"] = old_key

    assert f1 is f2, "ALEX-TD-053: _get_fernet() must cache and return the same Fernet instance"


def test_fernet_rebuilds_on_key_change():
    """ALEX-TD-053: _get_fernet() must rebuild Fernet instance when key changes."""
    import os
    import base64
    import agentco.services.encryption as enc_mod
    from cryptography.fernet import Fernet

    key1 = Fernet.generate_key().decode()
    key2 = Fernet.generate_key().decode()

    enc_mod._fernet_cache = None

    old_key = os.environ.get("ENCRYPTION_KEY")
    try:
        os.environ["ENCRYPTION_KEY"] = key1
        f1 = enc_mod._get_fernet()

        os.environ["ENCRYPTION_KEY"] = key2
        f2 = enc_mod._get_fernet()
    finally:
        if old_key is not None:
            os.environ["ENCRYPTION_KEY"] = old_key
        elif "ENCRYPTION_KEY" in os.environ:
            del os.environ["ENCRYPTION_KEY"]

    assert f1 is not f2, "Fernet must be rebuilt when key changes"
