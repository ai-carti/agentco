"""
M1-005: LLM Credentials (зашифрованные ключи) — TDD.

Tests are written first (red), then code makes them green.

Run: uv run pytest tests/test_credentials.py -v
"""
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="user@example.com", password="pass123"):
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


def _create_credential(client, token, company_id, provider="openai", api_key="sk-test-key"):
    return client.post(
        f"/api/companies/{company_id}/credentials",
        json={"provider": provider, "api_key": api_key},
        headers=_auth_headers(token),
    )


# ── AC: POST /companies/{company_id}/credentials ──────────────────────────────

def test_create_credential_requires_jwt(auth_client):
    """POST без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.post(
        f"/api/companies/{company_id}/credentials",
        json={"provider": "openai", "api_key": "sk-test"},
    )
    assert resp.status_code == 401


def test_create_credential_returns_201(auth_client):
    """POST с JWT → 201."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = _create_credential(client, token, company_id)
    assert resp.status_code == 201


def test_create_credential_response_schema(auth_client):
    """POST → 201, ответ содержит id, provider, created_at (без api_key)."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = _create_credential(client, token, company_id, provider="anthropic")
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["provider"] == "anthropic"
    assert "created_at" in data
    # API ключ не должен быть в ответе
    assert "api_key" not in data


def test_create_credential_key_not_in_response(auth_client):
    """api_key никогда не возвращается в ответе."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = _create_credential(client, token, company_id, api_key="super-secret-key-123")
    assert resp.status_code == 201
    assert "super-secret-key-123" not in resp.text
    assert "api_key" not in resp.json()


def test_create_credential_ownership_check(auth_client):
    """POST в чужую компанию → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_cred@example.com")
    token_bob = _register_and_login(client, email="bob_cred@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")

    resp = _create_credential(client, token_bob, company_id)
    assert resp.status_code == 404


# ── AC: GET /companies/{company_id}/credentials ───────────────────────────────

def test_list_credentials_requires_jwt(auth_client):
    """GET без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(f"/api/companies/{company_id}/credentials")
    assert resp.status_code == 401


def test_list_credentials_returns_200(auth_client):
    """GET с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    resp = client.get(
        f"/api/companies/{company_id}/credentials",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_credentials_no_api_keys(auth_client):
    """GET → список без api_key в элементах."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    _create_credential(client, token, company_id, provider="openai", api_key="my-secret")
    _create_credential(client, token, company_id, provider="anthropic", api_key="another-secret")

    resp = client.get(
        f"/api/companies/{company_id}/credentials",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    creds = resp.json()
    assert len(creds) == 2
    for cred in creds:
        assert "api_key" not in cred
        assert "id" in cred
        assert "provider" in cred
        assert "created_at" in cred
    # Убедимся что секретные ключи не попали в ответ
    assert "my-secret" not in resp.text
    assert "another-secret" not in resp.text


def test_list_credentials_ownership_check(auth_client):
    """GET чужих credentials → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_lc@example.com")
    token_bob = _register_and_login(client, email="bob_lc@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")

    resp = client.get(
        f"/api/companies/{company_id}/credentials",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: DELETE /companies/{company_id}/credentials/{id} ──────────────────────

def test_delete_credential_requires_jwt(auth_client):
    """DELETE без токена → 401."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    cred_id = _create_credential(client, token, company_id).json()["id"]

    resp = client.delete(f"/api/companies/{company_id}/credentials/{cred_id}")
    assert resp.status_code == 401


def test_delete_credential_returns_204(auth_client):
    """DELETE с JWT → 204."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    cred_id = _create_credential(client, token, company_id).json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/credentials/{cred_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 204


def test_delete_credential_actually_deletes(auth_client):
    """После DELETE credential пропадает из списка."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    cred_id = _create_credential(client, token, company_id, provider="openai").json()["id"]

    client.delete(
        f"/api/companies/{company_id}/credentials/{cred_id}",
        headers=_auth_headers(token),
    )
    creds = client.get(
        f"/api/companies/{company_id}/credentials",
        headers=_auth_headers(token),
    ).json()
    ids = [c["id"] for c in creds]
    assert cred_id not in ids


def test_delete_credential_ownership_check(auth_client):
    """DELETE чужого credential → 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_dc@example.com")
    token_bob = _register_and_login(client, email="bob_dc@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    cred_id = _create_credential(client, token_alice, company_id).json()["id"]

    resp = client.delete(
        f"/api/companies/{company_id}/credentials/{cred_id}",
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


# ── AC: GET /llm/providers ────────────────────────────────────────────────────

def test_llm_providers_requires_jwt(auth_client):
    """GET /llm/providers без токена → 401."""
    client, _ = auth_client
    resp = client.get("/api/llm/providers")
    assert resp.status_code == 401


def test_llm_providers_returns_200(auth_client):
    """GET /llm/providers с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)

    resp = client.get("/api/llm/providers", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_llm_providers_lists_saved_providers(auth_client):
    """GET /llm/providers → список провайдеров с сохранёнными ключами."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)

    _create_credential(client, token, company_id, provider="openai")
    _create_credential(client, token, company_id, provider="anthropic")

    resp = client.get("/api/llm/providers", headers=_auth_headers(token))
    assert resp.status_code == 200
    providers = resp.json()
    assert "openai" in providers
    assert "anthropic" in providers


def test_llm_providers_no_keys_empty(auth_client):
    """GET /llm/providers без сохранённых ключей → пустой список."""
    client, _ = auth_client
    token = _register_and_login(client, email="new_user_lp@example.com")

    resp = client.get("/api/llm/providers", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json() == []
