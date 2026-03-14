"""
M1-002: Companies CRUD — TDD.

Tests are written first (red), then code makes them green.

Run: uv run pytest tests/test_companies.py -v
"""
import pytest


# ── Helper ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="user@example.com", password="pass123"):
    """Register user and return Bearer token."""
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── AC: POST /companies — создать компанию ────────────────────────────────────

def test_create_company_requires_jwt(auth_client):
    """POST /companies без токена → 401."""
    client, _ = auth_client
    resp = client.post("/api/companies/", json={"name": "Test Co"})
    assert resp.status_code == 401


def test_create_company_returns_201(auth_client):
    """POST /companies с JWT → 201."""
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/companies/",
        json={"name": "Test Co"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201


def test_create_company_returns_id_and_name(auth_client):
    """POST /companies → {"id": "...", "name": "..."}."""
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/companies/",
        json={"name": "Acme Corp"},
        headers=_auth_headers(token),
    )
    data = resp.json()
    assert "id" in data
    assert data["name"] == "Acme Corp"
    assert len(data["id"]) > 0


# ── AC: GET /companies — список ───────────────────────────────────────────────

def test_list_companies_requires_jwt(auth_client):
    """GET /companies без токена → 401."""
    client, _ = auth_client
    resp = client.get("/api/companies/")
    assert resp.status_code == 401


def test_list_companies_returns_200(auth_client):
    """GET /companies с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.get("/api/companies/", headers=_auth_headers(token))
    assert resp.status_code == 200


def test_list_companies_returns_own_companies(auth_client):
    """GET /companies → возвращает только свои компании."""
    client, _ = auth_client
    token = _register_and_login(client)
    client.post("/api/companies/", json={"name": "My Corp"}, headers=_auth_headers(token))

    # Другой юзер создаёт свою компанию
    token2 = _register_and_login(client, email="other@example.com")
    client.post("/api/companies/", json={"name": "Other Corp"}, headers=_auth_headers(token2))

    resp = client.get("/api/companies/", headers=_auth_headers(token))
    companies = resp.json()
    names = [c["name"] for c in companies]
    assert "My Corp" in names
    assert "Other Corp" not in names


# ── AC: GET /companies/{id} ───────────────────────────────────────────────────

def test_get_company_requires_jwt(auth_client):
    """GET /companies/{id} без токена → 401."""
    client, _ = auth_client
    resp = client.get("/api/companies/some-id")
    assert resp.status_code == 401


def test_get_company_returns_200(auth_client):
    """GET /companies/{id} с JWT → 200."""
    client, _ = auth_client
    token = _register_and_login(client)
    create_resp = client.post(
        "/api/companies/",
        json={"name": "Test"},
        headers=_auth_headers(token),
    )
    company_id = create_resp.json()["id"]
    resp = client.get(f"/api/companies/{company_id}", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["id"] == company_id


def test_get_company_returns_404_for_unknown_id(auth_client):
    """GET /companies/unknown-id → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.get("/api/companies/nonexistent-id", headers=_auth_headers(token))
    assert resp.status_code == 404


# ── AC: PUT /companies/{id} — обновить name ───────────────────────────────────

def test_update_company_requires_jwt(auth_client):
    """PUT /companies/{id} без токена → 401."""
    client, _ = auth_client
    resp = client.put("/api/companies/some-id", json={"name": "New Name"})
    assert resp.status_code == 401


def test_update_company_returns_200(auth_client):
    """PUT /companies/{id} с JWT → 200 с обновлённым name."""
    client, _ = auth_client
    token = _register_and_login(client)
    create_resp = client.post(
        "/api/companies/",
        json={"name": "Old Name"},
        headers=_auth_headers(token),
    )
    company_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/companies/{company_id}",
        json={"name": "New Name"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["id"] == company_id


def test_update_company_404_for_unknown_id(auth_client):
    """PUT /companies/unknown-id → 404."""
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.put(
        "/api/companies/nonexistent",
        json={"name": "X"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


# ── AC: DELETE /companies/{id} ────────────────────────────────────────────────

def test_delete_company_requires_jwt(auth_client):
    """DELETE /companies/{id} без токена → 401."""
    client, _ = auth_client
    resp = client.delete("/api/companies/some-id")
    assert resp.status_code == 401


def test_delete_company_returns_204(auth_client):
    """DELETE /companies/{id} с JWT → 204."""
    client, _ = auth_client
    token = _register_and_login(client)
    create_resp = client.post(
        "/api/companies/",
        json={"name": "To Delete"},
        headers=_auth_headers(token),
    )
    company_id = create_resp.json()["id"]

    resp = client.delete(f"/api/companies/{company_id}", headers=_auth_headers(token))
    assert resp.status_code == 204


def test_delete_company_actually_deletes(auth_client):
    """После DELETE компания не находится."""
    client, _ = auth_client
    token = _register_and_login(client)
    create_resp = client.post(
        "/api/companies/",
        json={"name": "To Delete"},
        headers=_auth_headers(token),
    )
    company_id = create_resp.json()["id"]
    client.delete(f"/api/companies/{company_id}", headers=_auth_headers(token))

    resp = client.get(f"/api/companies/{company_id}", headers=_auth_headers(token))
    assert resp.status_code == 404


# ── BUG-004: Ownership checks ─────────────────────────────────────────────────

def test_get_company_cross_user_returns_404(auth_client):
    """GET /companies/{id} чужой компании → 404 (не 200)."""
    client, _ = auth_client
    # Alice создаёт компанию
    token_alice = _register_and_login(client, email="alice@example.com")
    create_resp = client.post(
        "/api/companies/",
        json={"name": "Alice Corp"},
        headers=_auth_headers(token_alice),
    )
    company_id = create_resp.json()["id"]

    # Bob пробует получить компанию Alice
    token_bob = _register_and_login(client, email="bob@example.com")
    resp = client.get(f"/api/companies/{company_id}", headers=_auth_headers(token_bob))
    assert resp.status_code == 404


def test_update_company_cross_user_returns_404(auth_client):
    """PUT /companies/{id} чужой компании → 404 (не 200)."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice2@example.com")
    create_resp = client.post(
        "/api/companies/",
        json={"name": "Alice Corp"},
        headers=_auth_headers(token_alice),
    )
    company_id = create_resp.json()["id"]

    token_bob = _register_and_login(client, email="bob2@example.com")
    resp = client.put(
        f"/api/companies/{company_id}",
        json={"name": "Hacked Name"},
        headers=_auth_headers(token_bob),
    )
    assert resp.status_code == 404


def test_delete_company_cross_user_returns_404(auth_client):
    """DELETE /companies/{id} чужой компании → 404 (не 204)."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice3@example.com")
    create_resp = client.post(
        "/api/companies/",
        json={"name": "Alice Corp"},
        headers=_auth_headers(token_alice),
    )
    company_id = create_resp.json()["id"]

    token_bob = _register_and_login(client, email="bob3@example.com")
    resp = client.delete(f"/api/companies/{company_id}", headers=_auth_headers(token_bob))
    assert resp.status_code == 404

    # Alice's company still exists
    resp_check = client.get(f"/api/companies/{company_id}", headers=_auth_headers(token_alice))
    assert resp_check.status_code == 200
