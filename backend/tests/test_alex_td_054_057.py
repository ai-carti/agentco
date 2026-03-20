"""
ALEX-TD-054..057: Tech debt tests.

ALEX-TD-054: CompanyService.update/delete_owned — ownership check merged into service
ALEX-TD-055: ws_events.py — accept() before close(), use 4001/4003 codes
ALEX-TD-056: _execute_agent uses module-level asyncio/os imports
ALEX-TD-057: CompanyService.get_owned — ownership check in service layer, not handler
"""
import inspect
import pytest
from unittest.mock import patch, MagicMock


# ── ALEX-TD-054: update_company — single ownership-aware update ──────────────

def test_company_update_with_wrong_owner_raises_not_found():
    """CompanyService.update with wrong owner_id raises NotFoundError (not a generic error)."""
    from agentco.services.company import CompanyService
    from agentco.repositories.base import NotFoundError

    # Arrange: mock session + repo
    session = MagicMock()
    service = CompanyService(session)

    # Repo returns a company owned by user1
    mock_company_model = MagicMock()
    mock_company_model.owner_id = "user-1"
    mock_company_model.id = "company-1"

    with patch.object(service._repo, "get", return_value=mock_company_model):
        with pytest.raises(NotFoundError):
            service.update("company-1", "New Name", owner_id="user-2")


def test_company_update_with_correct_owner_calls_update_name():
    """CompanyService.update with correct owner_id calls update_name."""
    from agentco.services.company import CompanyService

    session = MagicMock()
    service = CompanyService(session)

    mock_company_model = MagicMock()
    mock_company_model.owner_id = "user-1"
    mock_company_model.id = "company-1"

    mock_updated = MagicMock()
    mock_updated.id = "company-1"
    mock_updated.name = "New Name"

    with patch.object(service._repo, "get", return_value=mock_company_model):
        with patch.object(service._repo, "update_name", return_value=mock_updated) as mock_update:
            result = service.update("company-1", "New Name", owner_id="user-1")
            mock_update.assert_called_once_with("company-1", "New Name")
            assert result.name == "New Name"


def test_company_delete_owned_with_wrong_owner_raises_not_found():
    """CompanyService.delete_owned with wrong owner_id raises NotFoundError."""
    from agentco.services.company import CompanyService
    from agentco.repositories.base import NotFoundError

    session = MagicMock()
    service = CompanyService(session)

    mock_company_model = MagicMock()
    mock_company_model.owner_id = "user-1"
    mock_company_model.id = "company-1"

    with patch.object(service._repo, "get", return_value=mock_company_model):
        with pytest.raises(NotFoundError):
            service.delete_owned("company-1", owner_id="user-2")


def test_company_delete_owned_with_correct_owner_calls_delete():
    """CompanyService.delete_owned with correct owner_id calls repo.delete."""
    from agentco.services.company import CompanyService

    session = MagicMock()
    service = CompanyService(session)

    mock_company_model = MagicMock()
    mock_company_model.owner_id = "user-1"
    mock_company_model.id = "company-1"

    with patch.object(service._repo, "get", return_value=mock_company_model):
        with patch.object(service._repo, "delete") as mock_delete:
            service.delete_owned("company-1", owner_id="user-1")
            mock_delete.assert_called_once_with("company-1")


# ── ALEX-TD-056: _execute_agent uses module-level imports (no in-function aliases) ─

def test_execute_agent_uses_module_level_asyncio():
    """_execute_agent source code should not contain 'import asyncio as _asyncio'."""
    from agentco.services.run import RunService
    source = inspect.getsource(RunService._execute_agent)
    assert "import asyncio as _asyncio" not in source, (
        "ALEX-TD-056: in-function asyncio alias found — should use module-level asyncio"
    )


def test_execute_agent_uses_module_level_os():
    """_execute_agent source code should not contain 'import os as _os'."""
    from agentco.services.run import RunService
    source = inspect.getsource(RunService._execute_agent)
    assert "import os as _os" not in source, (
        "ALEX-TD-056: in-function os alias found — should use module-level os"
    )


# ── ALEX-TD-055: ws_events.py — accept() before close(), use 4001/4003 ──────

def test_ws_events_handler_calls_accept_before_close():
    """ws_company_events source code must call websocket.accept() before any websocket.close()."""
    import agentco.handlers.ws_events as ws_mod
    source = inspect.getsource(ws_mod.ws_company_events)
    accept_pos = source.find("websocket.accept()")
    close_pos = source.find("websocket.close(")
    assert accept_pos != -1, "ALEX-TD-055: websocket.accept() not found in handler"
    assert close_pos != -1, "ALEX-TD-055: websocket.close() not found in handler"
    assert accept_pos < close_pos, (
        "ALEX-TD-055: websocket.accept() must appear before websocket.close()"
    )


def test_ws_events_handler_does_not_use_1008_for_auth_errors():
    """ws_company_events should use 4001/4003 custom codes, not 1008, for auth errors."""
    import agentco.handlers.ws_events as ws_mod
    source = inspect.getsource(ws_mod.ws_company_events)
    assert "code=1008" not in source, (
        "ALEX-TD-055: code=1008 found — use 4001 (unauthorized) or 4003 (forbidden) instead"
    )


def test_ws_events_handler_uses_custom_close_codes():
    """ws_company_events should use 4001 or 4003 close codes for auth errors."""
    import agentco.handlers.ws_events as ws_mod
    source = inspect.getsource(ws_mod.ws_company_events)
    assert "4001" in source or "4003" in source, (
        "ALEX-TD-055: must use custom close code 4001 (unauthorized) or 4003 (forbidden)"
    )


# ── ALEX-TD-057: CompanyService.get_owned — ownership in service layer ───────

def test_company_service_has_get_owned():
    """CompanyService must have a get_owned(company_id, owner_id) method."""
    from agentco.services.company import CompanyService
    assert hasattr(CompanyService, "get_owned"), (
        "ALEX-TD-057: CompanyService.get_owned method not found"
    )


def test_company_get_owned_with_wrong_owner_raises_not_found():
    """CompanyService.get_owned with wrong owner_id raises NotFoundError."""
    from agentco.services.company import CompanyService
    from agentco.repositories.base import NotFoundError

    session = MagicMock()
    service = CompanyService(session)

    mock_company = MagicMock()
    mock_company.owner_id = "user-1"
    mock_company.id = "company-1"

    with patch.object(service._repo, "get", return_value=mock_company):
        with pytest.raises(NotFoundError):
            service.get_owned("company-1", owner_id="user-2")


def test_company_get_owned_with_correct_owner_returns_company():
    """CompanyService.get_owned with correct owner_id returns the company."""
    from agentco.services.company import CompanyService

    session = MagicMock()
    service = CompanyService(session)

    mock_company = MagicMock()
    mock_company.owner_id = "user-1"
    mock_company.id = "company-1"

    with patch.object(service._repo, "get", return_value=mock_company):
        result = service.get_owned("company-1", owner_id="user-1")
        assert result is mock_company


def test_get_company_handler_uses_service_get_owned(auth_client):
    """GET /api/companies/{id} must return 404 for non-owner user (integration)."""
    client, _ = auth_client
    # Register two users
    client.post("/auth/register", json={"email": "td057-a@test.com", "password": "Secret123!"})
    resp_a = client.post("/auth/login", json={"email": "td057-a@test.com", "password": "Secret123!"})
    token_a = resp_a.json()["access_token"]

    client.post("/auth/register", json={"email": "td057-b@test.com", "password": "Secret123!"})
    resp_b = client.post("/auth/login", json={"email": "td057-b@test.com", "password": "Secret123!"})
    token_b = resp_b.json()["access_token"]

    # User A creates company
    resp = client.post(
        "/api/companies/",
        json={"name": "A's Company"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    company_id = resp.json()["id"]

    # User B tries to GET user A's company — must get 404
    resp = client.get(
        f"/api/companies/{company_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404
