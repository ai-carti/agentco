"""
M3-002: Agent Library + Portfolio — TDD.

Tests written BEFORE implementation (red → green).

ACs:
1. POST /api/library — сохранить агента в библиотеку (company_id=NULL)
2. GET /api/library — список агентов в библиотеке
3. GET /api/library/{id}/portfolio — агрегированная история задач агента и его форков
4. POST /api/companies/{id}/agents/fork — форкнуть агента из библиотеки в компанию

Run: uv run pytest tests/test_library.py -v
"""
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email="lib_user@example.com", password="pass123"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name="Library Corp"):
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Library Agent"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "system_prompt": "You are helpful", "model": "gpt-4o-mini"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _add_to_library(client, token, agent_id):
    return client.post(
        "/api/library",
        json={"agent_id": agent_id},
        headers=_auth_headers(token),
    )


# ── AC1: POST /api/library ────────────────────────────────────────────────────

def test_post_library_requires_jwt(auth_client):
    """POST /api/library без токена → 401."""
    client, _ = auth_client
    resp = client.post("/api/library", json={"agent_id": "some-id"})
    assert resp.status_code == 401


def test_post_library_saves_agent(auth_client):
    """POST /api/library → 201, возвращает запись библиотеки."""
    client, _ = auth_client
    token = _register_and_login(client)
    company_id = _create_company(client, token)
    agent_id = _create_agent(client, token, company_id)

    resp = _add_to_library(client, token, agent_id)
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["name"] == "Library Agent"
    assert data["role"] == "worker"
    assert data["model"] == "gpt-4o-mini"
    assert data.get("use_count", 0) == 0


def test_post_library_agent_not_found(auth_client):
    """POST /api/library с несуществующим agent_id → 404."""
    client, _ = auth_client
    token = _register_and_login(client, email="lib_404@example.com")

    resp = _add_to_library(client, token, "nonexistent-agent-id")
    assert resp.status_code == 404


def test_post_library_ownership_check(auth_client):
    """POST /api/library с чужим агентом → 403 или 404."""
    client, _ = auth_client
    token_alice = _register_and_login(client, email="alice_lib@example.com")
    token_bob = _register_and_login(client, email="bob_lib@example.com")

    company_id = _create_company(client, token_alice, "Alice Corp")
    agent_id = _create_agent(client, token_alice, company_id, "Alice Agent")

    # Bob пытается добавить агента Alice в библиотеку
    resp = _add_to_library(client, token_bob, agent_id)
    assert resp.status_code in (403, 404)


# ── AC2: GET /api/library ──────────────────────────────────────────────────────

def test_get_library_requires_jwt(auth_client):
    """GET /api/library без токена → 401."""
    client, _ = auth_client
    resp = client.get("/api/library")
    assert resp.status_code == 401


def test_get_library_returns_list(auth_client):
    """GET /api/library → 200, список записей."""
    client, _ = auth_client
    token = _register_and_login(client, email="list_lib@example.com")

    resp = client.get("/api/library", headers=_auth_headers(token))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_library_contains_saved_agent(auth_client):
    """GET /api/library возвращает ранее добавленного агента."""
    client, _ = auth_client
    token = _register_and_login(client, email="save_lib@example.com")
    company_id = _create_company(client, token, "Save Corp")
    agent_id = _create_agent(client, token, company_id, "Saved Agent")

    post_resp = _add_to_library(client, token, agent_id)
    assert post_resp.status_code == 201
    lib_entry_id = post_resp.json()["id"]

    resp = client.get("/api/library", headers=_auth_headers(token))
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()]
    assert lib_entry_id in ids


# ── AC3: GET /api/library/{id}/portfolio ──────────────────────────────────────

def test_get_portfolio_requires_jwt(auth_client):
    """GET /api/library/{id}/portfolio без токена → 401."""
    client, _ = auth_client
    resp = client.get("/api/library/some-id/portfolio")
    assert resp.status_code == 401


def test_get_portfolio_not_found(auth_client):
    """GET /api/library/nonexistent/portfolio → 404."""
    client, _ = auth_client
    token = _register_and_login(client, email="pf_404@example.com")

    resp = client.get(
        "/api/library/nonexistent-id/portfolio",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_get_portfolio_returns_structure(auth_client):
    """GET /api/library/{id}/portfolio → 200, содержит library_agent и forks."""
    client, _ = auth_client
    token = _register_and_login(client, email="pf_ok@example.com")
    company_id = _create_company(client, token, "Portfolio Corp")
    agent_id = _create_agent(client, token, company_id, "Portfolio Agent")

    post_resp = _add_to_library(client, token, agent_id)
    assert post_resp.status_code == 201
    lib_id = post_resp.json()["id"]

    resp = client.get(
        f"/api/library/{lib_id}/portfolio",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "library_agent" in data
    assert "forks" in data
    assert data["library_agent"]["id"] == lib_id


# ── AC4: POST /api/companies/{id}/agents/fork ─────────────────────────────────

def test_fork_requires_jwt(auth_client):
    """POST /api/companies/{id}/agents/fork без токена → 401."""
    client, _ = auth_client
    resp = client.post(
        "/api/companies/some-company/agents/fork",
        json={"library_agent_id": "some-lib-id"},
    )
    assert resp.status_code == 401


def test_fork_agent_not_found(auth_client):
    """POST fork с несуществующим library_agent_id → 404."""
    client, _ = auth_client
    token = _register_and_login(client, email="fork_404@example.com")
    company_id = _create_company(client, token, "Fork Corp 404")

    resp = client.post(
        f"/api/companies/{company_id}/agents/fork",
        json={"library_agent_id": "nonexistent-lib-id"},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_fork_company_not_found(auth_client):
    """POST fork в несуществующую компанию → 404."""
    client, _ = auth_client
    token = _register_and_login(client, email="fork_co_404@example.com")
    company_id = _create_company(client, token, "Fork Corp Base")
    agent_id = _create_agent(client, token, company_id, "Fork Base Agent")
    post_resp = _add_to_library(client, token, agent_id)
    lib_id = post_resp.json()["id"]

    resp = client.post(
        "/api/companies/nonexistent-company/agents/fork",
        json={"library_agent_id": lib_id},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 404


def test_fork_creates_agent_in_company(auth_client):
    """POST fork → 201, создаёт агента в компании с library_agent_id."""
    client, _ = auth_client
    token = _register_and_login(client, email="fork_ok@example.com")
    company_id = _create_company(client, token, "Fork OK Corp")
    agent_id = _create_agent(client, token, company_id, "Template Agent")

    post_resp = _add_to_library(client, token, agent_id)
    assert post_resp.status_code == 201
    lib_id = post_resp.json()["id"]

    # Форкнуть в ту же компанию
    target_company_id = _create_company(client, token, "Target Corp")
    resp = client.post(
        f"/api/companies/{target_company_id}/agents/fork",
        json={"library_agent_id": lib_id},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["company_id"] == target_company_id
    assert data["library_agent_id"] == lib_id
    # Счётчик использований должен увеличиться
    assert data["name"] == "Template Agent"


def test_fork_increments_use_count(auth_client):
    """Форкирование агента увеличивает use_count в библиотеке."""
    client, _ = auth_client
    token = _register_and_login(client, email="fork_count@example.com")
    company_id = _create_company(client, token, "Count Corp")
    agent_id = _create_agent(client, token, company_id, "Count Agent")

    post_resp = _add_to_library(client, token, agent_id)
    lib_id = post_resp.json()["id"]
    initial_count = post_resp.json().get("use_count", 0)

    target_company_id = _create_company(client, token, "Target Count Corp")
    client.post(
        f"/api/companies/{target_company_id}/agents/fork",
        json={"library_agent_id": lib_id},
        headers=_auth_headers(token),
    )

    # Проверяем через GET /api/library
    lib_resp = client.get("/api/library", headers=_auth_headers(token))
    entries = lib_resp.json()
    entry = next((e for e in entries if e["id"] == lib_id), None)
    assert entry is not None
    assert entry.get("use_count", 0) == initial_count + 1
