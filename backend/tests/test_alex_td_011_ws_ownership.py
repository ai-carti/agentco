"""
ALEX-TD-011: WebSocket /ws/companies/{company_id}/events must verify company ownership.

Bug: ws_company_events only validates the JWT token (user authenticated), but does NOT
check that the authenticated user owns the company_id in the URL.

Any authenticated user can subscribe to events for any company_id, including
companies belonging to other users — information disclosure vulnerability.

Fix: After decoding the token, look up the company and verify owner_id == current user.

ALEX-TD-055 note: with the TD-055 fix, the server now always performs the WS handshake
(websocket.accept()) before closing, so TestClient no longer raises on bad auth.
Instead we verify the close code: 4001 = Unauthorized, 4003 = Forbidden.
"""
import uuid
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _register_and_login(client: TestClient, email: str, password: str = "Secret123!"):
    """Register + login, return token."""
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _create_company(client: TestClient, token: str, name: str = "My Corp") -> str:
    resp = client.post(
        "/api/companies/",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _ws_close_code(client: TestClient, url: str) -> int | None:
    """Connect to WS, receive close frame, return close code (or None if still open)."""
    try:
        with client.websocket_connect(url) as ws:
            # Connection accepted — server should send close frame immediately
            try:
                ws.receive_text()
            except WebSocketDisconnect as e:
                return e.code
    except WebSocketDisconnect as e:
        return e.code
    return None


class TestWebSocketOwnership:
    """WebSocket must reject connections to companies the user doesn't own."""

    def test_owner_can_connect(self, auth_client):
        """Company owner can subscribe to its WebSocket events."""
        client, _ = auth_client
        token = _register_and_login(client, "owner@ws-test.com")
        company_id = _create_company(client, token, "Owner Corp")

        with client.websocket_connect(
            f"/ws/companies/{company_id}/events?token={token}"
        ) as ws:
            pass  # should not raise

    def test_non_owner_cannot_connect_to_foreign_company(self, auth_client):
        """Non-owner user gets close code 4003 (Forbidden) for another user's company."""
        client, _ = auth_client

        # User A creates a company
        token_a = _register_and_login(client, "user-a@ws-test.com")
        company_id = _create_company(client, token_a, "Company A")

        # User B tries to subscribe to User A's company events
        token_b = _register_and_login(client, "user-b@ws-test.com")

        code = _ws_close_code(
            client,
            f"/ws/companies/{company_id}/events?token={token_b}",
        )
        # ALEX-TD-055: close code 4003 = Forbidden (not 1008)
        assert code == 4003, f"Expected close code 4003 (Forbidden), got {code}"

    def test_nonexistent_company_rejected(self, auth_client):
        """WebSocket connection to nonexistent company_id gets close code 4003."""
        client, _ = auth_client
        token = _register_and_login(client, "user-c@ws-test.com")

        code = _ws_close_code(
            client,
            f"/ws/companies/{uuid.uuid4()}/events?token={token}",
        )
        assert code == 4003, f"Expected close code 4003 (Forbidden), got {code}"
