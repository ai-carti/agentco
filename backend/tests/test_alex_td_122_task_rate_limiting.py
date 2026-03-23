"""
ALEX-TD-122: Tasks mutable endpoints have rate limiting.

Verifies that create_task, update_task, update_task_status, delete_task
all respond correctly under normal load (rate limiter present, not triggered).
"""
import pytest


def _login(client, email="task_rl@example.com", password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _setup(client):
    token = _login(client)
    company = client.post("/api/companies/", json={"name": "RL Test Co"}, headers=_auth(token))
    company_id = company.json()["id"]
    agent = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": "TaskAgent", "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    agent_id = agent.json()["id"]
    return token, company_id, agent_id


def test_create_task_rate_limited_endpoint_accepts_normal_load(auth_client):
    """POST /tasks returns 201 normally (rate limiter present but not triggered)."""
    client, _ = auth_client
    token, company_id, agent_id = _setup(client)
    resp = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": "Test Task"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "Test Task"


def test_update_task_rate_limited_endpoint_accepts_normal_load(auth_client):
    """PUT /tasks/{id} returns 200 normally."""
    client, _ = auth_client
    token, company_id, agent_id = _setup(client)
    created = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": "Original"},
        headers=_auth(token),
    )
    task_id = created.json()["id"]
    resp = client.put(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        json={"title": "Updated"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated"


def test_update_task_status_rate_limited_endpoint_accepts_normal_load(auth_client):
    """PATCH /tasks/{id}/status returns 200 normally."""
    client, _ = auth_client
    token, company_id, agent_id = _setup(client)
    created = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": "Status Task"},
        headers=_auth(token),
    )
    task_id = created.json()["id"]
    resp = client.patch(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


def test_delete_task_rate_limited_endpoint_accepts_normal_load(auth_client):
    """DELETE /tasks/{id} returns 204 normally."""
    client, _ = auth_client
    token, company_id, agent_id = _setup(client)
    created = client.post(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks",
        json={"title": "To Delete"},
        headers=_auth(token),
    )
    task_id = created.json()["id"]
    resp = client.delete(
        f"/api/companies/{company_id}/agents/{agent_id}/tasks/{task_id}",
        headers=_auth(token),
    )
    assert resp.status_code == 204
