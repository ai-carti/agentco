"""
Tests for ALEX-TD-035 and ALEX-TD-036.

ALEX-TD-035: ws_events.py should release DB session before websocket.accept()
ALEX-TD-036: list_run_events supports pagination (limit/offset)
"""
import pytest
from fastapi.testclient import TestClient


# ── ALEX-TD-035: DB session released before WebSocket accept ──────────────────

def test_ws_events_session_closed_before_accept():
    """
    ws_events.py должен явно закрывать DB session до websocket.accept().

    Статический анализ: хендлер должен вызывать session.close() в finally-блоке
    ДО await websocket.accept() — чтобы не держать DB connection на весь WS lifetime.
    """
    import inspect
    from agentco.handlers import ws_events as ws_module

    source = inspect.getsource(ws_module)

    # Должен закрывать сессию явно
    assert "session.close()" in source, (
        "ws_events.py должен вызывать session.close() явно до websocket.accept() "
        "— чтобы освободить DB connection до начала долгой WS сессии."
    )

    # Должен использовать finally для гарантированного закрытия
    assert "finally" in source, (
        "ws_events.py должен закрывать DB сессию в finally блоке"
    )


def test_ws_events_accept_after_close():
    """
    websocket.accept() должен вызываться ПОСЛЕ session.close() в теле функции.
    """
    import inspect
    from agentco.handlers.ws_events import ws_company_events

    # Inspect only the function body (not the module docstring)
    source = inspect.getsource(ws_company_events)

    close_pos = source.find("session.close()")
    accept_pos = source.find("websocket.accept()")

    assert close_pos != -1, "session.close() не найден в ws_company_events"
    assert accept_pos != -1, "websocket.accept() не найден в ws_company_events"
    assert close_pos < accept_pos, (
        f"session.close() (pos={close_pos}) должен быть ДО websocket.accept() (pos={accept_pos})"
    )


# ── ALEX-TD-036: list_run_events pagination ───────────────────────────────────

def _setup_user_and_run(client: TestClient):
    """Helper: создаёт пользователя, компанию, таск и ран."""
    client.post("/auth/register", json={
        "email": "pagtest@example.com",
        "password": "pass1234",
        "name": "Pag Test",
    })
    login = client.post("/auth/login", json={
        "email": "pagtest@example.com",
        "password": "pass1234",
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    co = client.post("/api/companies/", json={"name": "PagCo"}, headers=headers)
    company_id = co.json()["id"]

    run = client.post(
        f"/api/companies/{company_id}/runs",
        json={"goal": "Test pagination"},
        headers=headers,
    )
    run_id = run.json()["id"]

    return headers, company_id, run_id


def test_list_run_events_default_limit(auth_client):
    """GET /runs/{id}/events должен принимать limit/offset параметры."""
    client, _ = auth_client
    headers, company_id, run_id = _setup_user_and_run(client)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        params={"limit": 10, "offset": 0},
        headers=headers,
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_list_run_events_limit_param(auth_client):
    """GET /runs/{id}/events?limit=5 должен уважать limit параметр."""
    client, _ = auth_client
    headers, company_id, run_id = _setup_user_and_run(client)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        params={"limit": 5},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) <= 5


def test_list_run_events_offset_param(auth_client):
    """GET /runs/{id}/events?offset=N должен принимать offset без ошибок."""
    client, _ = auth_client
    headers, company_id, run_id = _setup_user_and_run(client)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        params={"limit": 10, "offset": 100},
        headers=headers,
    )
    assert resp.status_code == 200
    # При большом offset — пустой список (нет событий)
    assert resp.json() == []


def test_list_run_events_invalid_limit_rejected(auth_client):
    """GET /runs/{id}/events?limit=0 должен вернуть 422."""
    client, _ = auth_client
    headers, company_id, run_id = _setup_user_and_run(client)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        params={"limit": 0},
        headers=headers,
    )
    assert resp.status_code == 422


def test_list_run_events_over_max_limit_rejected(auth_client):
    """GET /runs/{id}/events?limit=99999 должен вернуть 422."""
    client, _ = auth_client
    headers, company_id, run_id = _setup_user_and_run(client)

    resp = client.get(
        f"/api/companies/{company_id}/runs/{run_id}/events",
        params={"limit": 99999},
        headers=headers,
    )
    assert resp.status_code == 422
