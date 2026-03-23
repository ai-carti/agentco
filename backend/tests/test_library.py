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

def _register_and_login(client, email="lib_user@example.com", password="pass1234"):
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


# ── ALEX-TD-103: cross-tenant forks data leak ────────────────────────────────

def test_portfolio_forks_only_shows_own_company_forks(auth_client):
    """
    ALEX-TD-103: GET /api/library/{id}/portfolio не должен раскрывать
    company_id чужих пользователей через forks.

    Сценарий:
    1. user_a создаёт агента, сохраняет в библиотеку.
    2. user_b форкает этого агента.
    3. user_a запрашивает portfolio — должен видеть только СВОИ форки.
    4. user_b запрашивает portfolio — должен видеть только СВОИ форки.

    До фикса: оба видят ВСЕ форки, включая company_id чужих пользователей.
    После фикса: каждый видит только свои форки.
    """
    client, _ = auth_client

    # User A создаёт агента и сохраняет в библиотеку
    token_a = _register_and_login(client, email="td103_user_a@example.com")
    company_a = _create_company(client, token_a, "TD103 Corp A")
    agent_a = _create_agent(client, token_a, company_a, "TD103 Template Agent")
    lib_resp = _add_to_library(client, token_a, agent_a)
    assert lib_resp.status_code == 201
    lib_id = lib_resp.json()["id"]

    # User A форкает агента в свою компанию
    fork_company_a = _create_company(client, token_a, "TD103 Fork Corp A")
    fork_resp_a = client.post(
        f"/api/companies/{fork_company_a}/agents/fork",
        json={"library_agent_id": lib_id},
        headers=_auth_headers(token_a),
    )
    assert fork_resp_a.status_code == 201

    # User B форкает того же агента в свою компанию
    token_b = _register_and_login(client, email="td103_user_b@example.com")
    company_b = _create_company(client, token_b, "TD103 Corp B")
    fork_resp_b = client.post(
        f"/api/companies/{company_b}/agents/fork",
        json={"library_agent_id": lib_id},
        headers=_auth_headers(token_b),
    )
    assert fork_resp_b.status_code == 201

    # User A видит portfolio — должен видеть ТОЛЬКО свои форки (company_a)
    portfolio_resp_a = client.get(
        f"/api/library/{lib_id}/portfolio",
        headers=_auth_headers(token_a),
    )
    assert portfolio_resp_a.status_code == 200
    portfolio_a = portfolio_resp_a.json()
    forks_a = portfolio_a["forks"]
    fork_company_ids_a = {f["company_id"] for f in forks_a}
    # User A НЕ должен видеть company_b в своём portfolio
    assert company_b not in fork_company_ids_a, (
        f"ALEX-TD-103: portfolio forks leaked other user's company_id={company_b!r}. "
        f"Forks visible to user_a: {fork_company_ids_a}"
    )
    # User A ДОЛЖЕН видеть свой форк
    assert fork_company_a in fork_company_ids_a

    # User B видит portfolio — должен видеть ТОЛЬКО свои форки (company_b)
    portfolio_resp_b = client.get(
        f"/api/library/{lib_id}/portfolio",
        headers=_auth_headers(token_b),
    )
    assert portfolio_resp_b.status_code == 200
    portfolio_b = portfolio_resp_b.json()
    forks_b = portfolio_b["forks"]
    fork_company_ids_b = {f["company_id"] for f in forks_b}
    # User B НЕ должен видеть company_a или fork_company_a
    assert company_a not in fork_company_ids_b, (
        f"ALEX-TD-103: portfolio forks leaked other user's company_id={company_a!r}. "
        f"Forks visible to user_b: {fork_company_ids_b}"
    )
    assert fork_company_a not in fork_company_ids_b
    # User B ДОЛЖЕН видеть свой форк
    assert company_b in fork_company_ids_b


# ── ALEX-TD-105: pagination in get_portfolio ──────────────────────────────────

def test_portfolio_supports_limit_param(auth_client):
    """
    ALEX-TD-105: GET /api/library/{id}/portfolio должен принимать ?limit= параметр.
    Проверяем что limit ограничивает количество возвращаемых форков.
    """
    client, _ = auth_client
    token = _register_and_login(client, email="td105_limit@example.com")

    # Создаём агента в библиотеке
    company_id = _create_company(client, token, "TD105 Base Corp")
    agent_id = _create_agent(client, token, company_id, "TD105 Template Agent")
    lib_resp = _add_to_library(client, token, agent_id)
    assert lib_resp.status_code == 201
    lib_id = lib_resp.json()["id"]

    # Создаём 3 форка
    for i in range(3):
        fork_company = _create_company(client, token, f"TD105 Fork Corp {i}")
        fork_resp = client.post(
            f"/api/companies/{fork_company}/agents/fork",
            json={"library_agent_id": lib_id},
            headers=_auth_headers(token),
        )
        assert fork_resp.status_code == 201

    # Запрашиваем с limit=2 — должны получить не более 2 форков
    resp = client.get(
        f"/api/library/{lib_id}/portfolio?limit=2",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "forks" in data
    assert len(data["forks"]) <= 2, (
        f"ALEX-TD-105: limit=2 should return at most 2 forks, got {len(data['forks'])}"
    )


def test_portfolio_supports_offset_param(auth_client):
    """
    ALEX-TD-105: GET /api/library/{id}/portfolio должен принимать ?offset= параметр.
    С offset=2 при 3 форках должно вернуться не более 1 форка.
    """
    client, _ = auth_client
    token = _register_and_login(client, email="td105_offset@example.com")

    company_id = _create_company(client, token, "TD105 Offset Corp")
    agent_id = _create_agent(client, token, company_id, "TD105 Offset Agent")
    lib_resp = _add_to_library(client, token, agent_id)
    assert lib_resp.status_code == 201
    lib_id = lib_resp.json()["id"]

    # Создаём 3 форка
    for i in range(3):
        fork_company = _create_company(client, token, f"TD105 Offset Fork Corp {i}")
        client.post(
            f"/api/companies/{fork_company}/agents/fork",
            json={"library_agent_id": lib_id},
            headers=_auth_headers(token),
        )

    # С offset=2 должно вернуться не более 1 форка (всего 3, пропускаем 2)
    resp = client.get(
        f"/api/library/{lib_id}/portfolio?offset=2",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["forks"]) <= 1, (
        f"ALEX-TD-105: offset=2 with 3 forks should return at most 1 fork, got {len(data['forks'])}"
    )


def test_portfolio_limit_default_is_50(auth_client):
    """
    ALEX-TD-105: default limit должен быть 50 (возможность убедиться что параметр принимается).
    Запрос без параметров должен возвращать 200 с forks (не ошибку).
    """
    client, _ = auth_client
    token = _register_and_login(client, email="td105_default@example.com")

    company_id = _create_company(client, token, "TD105 Default Corp")
    agent_id = _create_agent(client, token, company_id, "TD105 Default Agent")
    lib_resp = _add_to_library(client, token, agent_id)
    lib_id = lib_resp.json()["id"]

    # Без параметров — должен работать нормально
    resp = client.get(
        f"/api/library/{lib_id}/portfolio",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200
    assert "forks" in resp.json()
