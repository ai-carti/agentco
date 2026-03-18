"""
POST-002: Gemini provider + key validation API — TDD.

Tests for:
  - GET /api/llm/providers includes gemini models
  - POST /api/llm/validate-key validates provider keys

Run: .venv/bin/python -m pytest tests/test_llm_providers.py -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="llm_user@example.com", password="pass123"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="Test Corp"):
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_credential(client, token, company_id, provider="gemini", api_key="gemini-test-key"):
    return client.post(
        f"/api/companies/{company_id}/credentials",
        json={"provider": provider, "api_key": api_key},
        headers=_auth_headers(token),
    )


# ── GET /api/llm/providers — Gemini models ────────────────────────────────────

def test_llm_providers_includes_gemini_models(auth_client):
    """GET /api/llm/providers/available → response contains gemini models."""
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.get("/api/llm/providers/available", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    # Must include Gemini models
    all_text = str(data)
    assert "gemini-1.5-pro" in all_text or "gemini" in all_text


def test_llm_providers_all_providers_structure(auth_client):
    """GET /api/llm/providers returns list with provider entries including gemini."""
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.get("/api/llm/providers", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    # data should be either:
    # - a list of provider strings like ["openai", "gemini"]
    # - OR a list of model strings like ["gpt-4o", "gemini-1.5-pro", ...]
    # OR a structured object with providers key
    assert isinstance(data, (list, dict))


def test_llm_providers_returns_gemini_provider_when_credential_saved(auth_client):
    """When gemini credential is saved → providers list includes gemini."""
    client, _ = auth_client
    token = _register_and_login(client, email="gemini_test@example.com")
    company_id = _create_company(client, token, "Gemini Corp")
    _create_credential(client, token, company_id, provider="gemini", api_key="AIzaTest")

    resp = client.get("/api/llm/providers", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert "gemini" in data


def test_llm_providers_available_models_includes_gemini(auth_client):
    """GET /api/llm/providers/available → includes gemini-1.5-pro and gemini-1.5-flash."""
    client, _ = auth_client
    token = _register_and_login(client, email="avail_models@example.com")

    resp = client.get("/api/llm/providers/available", headers=_auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    # Should contain Gemini models in some form
    all_text = str(data)
    assert "gemini-1.5-pro" in all_text
    assert "gemini-1.5-flash" in all_text


# ── POST /api/llm/validate-key ────────────────────────────────────────────────

def test_validate_key_requires_jwt(auth_client):
    """POST /api/llm/validate-key без токена → 401."""
    client, _ = auth_client
    resp = client.post(
        "/api/llm/validate-key",
        json={"provider": "openai", "api_key": "sk-test"},
    )
    assert resp.status_code == 401


def test_validate_key_returns_200_with_valid_structure(auth_client):
    """POST /api/llm/validate-key → 200 с {valid: bool}."""
    client, _ = auth_client
    token = _register_and_login(client)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "ok"

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        resp = client.post(
            "/api/llm/validate-key",
            json={"provider": "openai", "api_key": "sk-valid-key"},
            headers=_auth_headers(token),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "valid" in data
    assert isinstance(data["valid"], bool)


def test_validate_key_returns_valid_true_on_success(auth_client):
    """POST /api/llm/validate-key с валидным ключом → {valid: true}."""
    client, _ = auth_client
    token = _register_and_login(client)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Hello!"

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        resp = client.post(
            "/api/llm/validate-key",
            json={"provider": "openai", "api_key": "sk-valid-key-123"},
            headers=_auth_headers(token),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert "error" not in data or data.get("error") is None


def test_validate_key_returns_valid_false_on_auth_error(auth_client):
    """POST /api/llm/validate-key с невалидным ключом → {valid: false, error: ...}."""
    client, _ = auth_client
    token = _register_and_login(client)

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = Exception("AuthenticationError: Invalid API key")
        resp = client.post(
            "/api/llm/validate-key",
            json={"provider": "openai", "api_key": "sk-invalid"},
            headers=_auth_headers(token),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert "error" in data
    assert data["error"]  # non-empty error message


def test_validate_key_gemini_provider(auth_client):
    """POST /api/llm/validate-key для gemini → валидируется корректно."""
    client, _ = auth_client
    token = _register_and_login(client)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "ok"

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        resp = client.post(
            "/api/llm/validate-key",
            json={"provider": "gemini", "api_key": "AIza-gemini-key"},
            headers=_auth_headers(token),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "valid" in data


def test_validate_key_anthropic_provider(auth_client):
    """POST /api/llm/validate-key для anthropic провайдера."""
    client, _ = auth_client
    token = _register_and_login(client)

    with patch("agentco.llm.client.litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = Exception("Invalid API key")
        resp = client.post(
            "/api/llm/validate-key",
            json={"provider": "anthropic", "api_key": "bad-key"},
            headers=_auth_headers(token),
        )

    assert resp.status_code == 200
    assert resp.json()["valid"] is False


def test_validate_key_unknown_provider_returns_false(auth_client):
    """POST /api/llm/validate-key с неизвестным провайдером → {valid: false}."""
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.post(
        "/api/llm/validate-key",
        json={"provider": "unknown-provider-xyz", "api_key": "some-key"},
        headers=_auth_headers(token),
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
