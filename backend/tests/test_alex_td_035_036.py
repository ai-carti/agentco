"""
Tests for ALEX-TD-035 and ALEX-TD-036.

ALEX-TD-035: ws_events.py should release DB session before websocket.accept()
ALEX-TD-036: list_run_events supports pagination (limit/offset)
"""
import pytest
from fastapi.testclient import TestClient


# ── ALEX-TD-035: DB session released before WebSocket accept ──────────────────

def test_ws_events_session_released_before_accept():
    """
    ws_events.py не должен держать DB session через Depends(get_session) на время
    жизни WebSocket. Проверяем что сессия закрывается до websocket.accept().

    Статический анализ: в хендлере не должно быть `Depends(get_session)` на уровне
    параметра функции ws_company_events — должен использоваться contextmanager внутри.
    """
    import inspect
    from agentco.handlers.ws_events import ws_company_events

    sig = inspect.signature(ws_company_events)
    param_names = list(sig.parameters.keys())

    # session не должна быть параметром функции (Depends инжекция на весь lifetime)
    assert "session" not in param_names, (
        "ws_company_events не должен принимать session через Depends(get_session) "
        "— это держит соединение открытым на весь lifetime WebSocket. "
        "Используй SessionLocal() внутри, закрывай до accept()."
    )


def test_ws_events_opens_closes_own_session():
    """
    ws_events.py должен явно создавать и закрывать сессию внутри хендлера
    для проверки ownership, а не использовать Depends(get_session).
    """
    import inspect
    from agentco.handlers import ws_events as ws_module

    source = inspect.getsource(ws_module)

    # Должен использовать SessionLocal напрямую
    assert "SessionLocal" in source or "get_session" not in source.split("Depends")[1] if "Depends" in source else True, (
        "ws_events.py должен создавать сессию через SessionLocal() внутри хендлера"
    )

    # Должен закрывать сессию (явный close или finally блок)
    assert "session.close()" in source or "finally" in source, (
        "ws_events.py должен закрывать DB сессию в finally блоке до websocket.accept()"
    )


# ── ALEX-TD-036: list_run_events pagination ───────────────────────────────────

def _setup_user_and_run(client: TestClient):
    """Helper: создаёт пользователя, компанию, таск и ран."""
    client.post("/auth/register", json={
        "email": "pagtest@example.com",
        "password": "pass123",
        "name": "Pag Test",
    })
    login = client.post("/auth/login", json={
        "email": "pagtest@example.com",
        "password": "pass123",
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
