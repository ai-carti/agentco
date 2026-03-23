"""
M3-003: Company Templates + Onboarding — TDD.

Tests:
- POST /api/companies/from-template creates company + agents in one transaction
- GET /api/templates lists available templates
- First-login welcome flag (has_completed_onboarding)

Run: uv run pytest tests/test_templates.py -v
"""
import pytest


def _register_and_login(client, email="user@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── GET /api/templates ────────────────────────────────────────────────────────

def test_list_templates_returns_list(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.get("/api/templates", headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_startup_team_template_exists(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.get("/api/templates", headers=_auth(token))
    ids = [t["id"] for t in resp.json()]
    assert "startup-team" in ids


def test_template_has_required_fields(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.get("/api/templates", headers=_auth(token))
    for template in resp.json():
        assert "id" in template
        assert "name" in template
        assert "description" in template
        assert "agents" in template
        assert isinstance(template["agents"], list)


# ── POST /api/companies/from-template ────────────────────────────────────────

def test_create_from_template_returns_201(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/companies/from-template",
        json={"template_id": "startup-team", "name": "My Startup"},
        headers=_auth(token),
    )
    assert resp.status_code == 201


def test_create_from_template_returns_company_and_agents(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/companies/from-template",
        json={"template_id": "startup-team", "name": "My Startup"},
        headers=_auth(token),
    )
    data = resp.json()
    assert "id" in data
    assert data["name"] == "My Startup"
    assert "agents" in data
    assert len(data["agents"]) > 0


def test_create_from_template_agents_have_prompts(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/companies/from-template",
        json={"template_id": "startup-team", "name": "My Startup"},
        headers=_auth(token),
    )
    agents = resp.json()["agents"]
    for agent in agents:
        assert "name" in agent
        assert "role" in agent
        assert "system_prompt" in agent
        assert agent["system_prompt"]  # not empty


def test_create_from_template_company_visible_in_list(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    client.post(
        "/api/companies/from-template",
        json={"template_id": "startup-team", "name": "My Startup"},
        headers=_auth(token),
    )
    resp = client.get("/api/companies/", headers=_auth(token))
    names = [c["name"] for c in resp.json()]
    assert "My Startup" in names


def test_create_from_template_invalid_template_404(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/companies/from-template",
        json={"template_id": "nonexistent-template", "name": "Test"},
        headers=_auth(token),
    )
    assert resp.status_code == 404


def test_create_from_template_requires_auth(auth_client):
    client, _ = auth_client
    resp = client.post(
        "/api/companies/from-template",
        json={"template_id": "startup-team", "name": "Test"},
    )
    assert resp.status_code == 401


def test_create_from_template_empty_name_returns_4xx(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.post(
        "/api/companies/from-template",
        json={"template_id": "startup-team", "name": "   "},
        headers=_auth(token),
    )
    assert resp.status_code in (400, 422)


# ── Onboarding flag ───────────────────────────────────────────────────────────

def test_new_user_has_not_completed_onboarding(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    resp = client.get("/auth/me", headers=_auth(token))
    data = resp.json()
    assert "has_completed_onboarding" in data
    assert data["has_completed_onboarding"] is False


def test_after_template_creation_onboarding_complete(auth_client):
    client, _ = auth_client
    token = _register_and_login(client)
    client.post(
        "/api/companies/from-template",
        json={"template_id": "startup-team", "name": "My Co"},
        headers=_auth(token),
    )
    resp = client.get("/auth/me", headers=_auth(token))
    assert resp.json()["has_completed_onboarding"] is True
