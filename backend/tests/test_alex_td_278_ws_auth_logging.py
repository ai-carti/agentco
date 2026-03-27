"""
ALEX-TD-278: WebSocket auth/authz failures must be visible in prod logs.

Before: when WS is closed with 4001 (invalid/missing token) or 4003 (unauthorized),
no logger.warning was emitted — brute-force attempts and token expiry were invisible.

Fix: logger.warning("ws_auth_failed: ...") for 4001,
     logger.warning("ws_authz_failed: ...") for 4003.

Regression tests verify that warning messages are emitted when:
1. Token is missing / invalid (4001 → ws_auth_failed)
2. Valid token but wrong company owner (4003 → ws_authz_failed)
"""
import logging
import uuid
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _register_and_login(client: TestClient, email: str, password: str = "Secret123!") -> str:
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _create_company(client: TestClient, token: str, name: str = "Corp") -> str:
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _connect_ws(client: TestClient, company_id: str, token: str = ""):
    """Connect to WS, return close code on disconnect."""
    url = f"/ws/companies/{company_id}/events?token={token}"
    try:
        with client.websocket_connect(url) as ws:
            try:
                ws.receive_text()
            except WebSocketDisconnect as e:
                return e.code
    except WebSocketDisconnect as e:
        return e.code
    return None


class TestWsAuthLogging:
    """ALEX-TD-278: WS auth failures must emit logger.warning."""

    def test_first_message_with_invalid_token_emits_auth_failed_warning(self, auth_client, caplog):
        """When WS uses first-message auth with invalid JWT, ws_auth_failed warning is emitted.

        SIRI-UX-360: token can be passed as first-message {type:'auth', token:'...'}.
        If the token in the first message is an invalid JWT, user_id=None → 4001 + warning.
        """
        client, _ = auth_client
        token = _register_and_login(client, f"ws-firstmsg-{uuid.uuid4()}@test.com")
        company_id = _create_company(client, token, "FirstMsg Corp")

        with caplog.at_level(logging.WARNING, logger="agentco.handlers.ws_events"):
            # Use no query param token, then send first-message auth with invalid JWT
            try:
                with client.websocket_connect(
                    f"/ws/companies/{company_id}/events"
                ) as ws:
                    ws.send_json({"type": "auth", "token": "invalid.jwt.token"})
                    try:
                        ws.receive_text()
                    except Exception:
                        pass
            except Exception:
                pass

        # Check that warning was logged (ws_auth_failed for invalid token)
        assert any(
            "ws_auth_failed" in record.message or "ws_auth_failed" in str(record.args)
            for record in caplog.records
        ), f"Expected ws_auth_failed warning. Got: {[r.message for r in caplog.records]}"

    def test_invalid_token_emits_auth_failed_warning(self, auth_client, caplog):
        """When WS token is invalid JWT, ws_auth_failed warning is emitted."""
        client, _ = auth_client
        token = _register_and_login(client, f"ws-badtoken-{uuid.uuid4()}@test.com")
        company_id = _create_company(client, token, "BadToken Corp")

        with caplog.at_level(logging.WARNING, logger="agentco.handlers.ws_events"):
            code = _connect_ws(client, company_id, token="not.a.valid.jwt")

        assert code == 4001
        assert any(
            "ws_auth_failed" in record.message or "ws_auth_failed" in str(record.args)
            for record in caplog.records
        ), f"Expected ws_auth_failed warning. Got: {[r.message for r in caplog.records]}"

    def test_unauthorized_company_emits_authz_failed_warning(self, auth_client, caplog):
        """When valid token but wrong company owner, ws_authz_failed warning is emitted."""
        client, _ = auth_client
        # User A owns the company
        token_a = _register_and_login(client, f"ws-owner-{uuid.uuid4()}@test.com")
        company_id = _create_company(client, token_a, "Owner A Corp")

        # User B has valid token but doesn't own the company
        token_b = _register_and_login(client, f"ws-intruder-{uuid.uuid4()}@test.com")

        with caplog.at_level(logging.WARNING, logger="agentco.handlers.ws_events"):
            code = _connect_ws(client, company_id, token=token_b)

        assert code == 4003
        assert any(
            "ws_authz_failed" in record.message or "ws_authz_failed" in str(record.args)
            for record in caplog.records
        ), f"Expected ws_authz_failed warning. Got: {[r.message for r in caplog.records]}"
