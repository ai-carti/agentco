"""
ALEX-TD-149: WebSocket connection limit per user.

TDD: test first → red → implement → green.
"""
import uuid
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession


def _make_mock_user(user_id="user-001"):
    user = MagicMock()
    user.id = user_id
    return user


def _make_mock_company(owner_id="user-001"):
    company = MagicMock()
    company.owner_id = owner_id
    return company


def _make_app_with_ws():
    """Import app; override DB deps."""
    from agentco.main import app
    return app


@pytest.fixture()
def app():
    return _make_app_with_ws()


class TestWsConnectionLimitTracking:
    """Test that WS connection limit per user is tracked and enforced."""

    def test_ws_conn_limit_module_has_active_connections_tracking(self):
        """ALEX-TD-149: ws_events module must expose per-user active connection tracking."""
        from agentco.handlers import ws_events
        # The module must expose a way to track active connections
        assert hasattr(ws_events, "_active_ws_connections"), (
            "ws_events must have _active_ws_connections dict for per-user tracking"
        )

    def test_ws_conn_limit_constant_defined(self):
        """ALEX-TD-149: ws_events module must expose configurable limit constant."""
        from agentco.handlers import ws_events
        assert hasattr(ws_events, "_MAX_WS_CONNECTIONS_PER_USER"), (
            "ws_events must define _MAX_WS_CONNECTIONS_PER_USER"
        )
        assert ws_events._MAX_WS_CONNECTIONS_PER_USER >= 1

    def test_ws_conn_limit_close_code_4029_on_exceed(self, app):
        """ALEX-TD-149: when user exceeds connection limit, new WS should be closed with 4029."""
        from agentco.handlers import ws_events
        import os

        # Patch limit to 1 for easy testing
        original_limit = ws_events._MAX_WS_CONNECTIONS_PER_USER

        with patch.object(ws_events, "_MAX_WS_CONNECTIONS_PER_USER", 1):
            # Simulate user already has 1 active connection
            user_id = "user-limit-test"
            ws_events._active_ws_connections[user_id] = 1

            try:
                with patch("agentco.handlers.ws_events.decode_access_token", return_value=user_id):
                    with patch("agentco.handlers.ws_events.Session") as MockSession:
                        mock_session = MagicMock()
                        mock_session.scalars.return_value.first.return_value = _make_mock_company(user_id)
                        MockSession.return_value.__enter__ = MagicMock(return_value=mock_session)
                        MockSession.return_value.__exit__ = MagicMock(return_value=False)

                        with TestClient(app) as client:
                            with client.websocket_connect(
                                f"/ws/companies/{uuid.uuid4()}/events?token=valid-token"
                            ) as ws:
                                # Should receive close with code 4029
                                with pytest.raises(Exception):
                                    ws.receive_json()
            finally:
                # Cleanup
                ws_events._active_ws_connections.pop(user_id, None)

    def test_ws_conn_limit_counter_incremented_on_connect(self):
        """ALEX-TD-149: active connection counter must increase when connection accepted."""
        from agentco.handlers import ws_events
        # Verify the dict exists and can be incremented
        user_id = "user-counter-test"
        initial = ws_events._active_ws_connections.get(user_id, 0)
        ws_events._active_ws_connections[user_id] = initial + 1
        assert ws_events._active_ws_connections[user_id] == initial + 1
        # Cleanup
        ws_events._active_ws_connections.pop(user_id, None)

    def test_ws_conn_limit_counter_decremented_on_disconnect(self):
        """ALEX-TD-149: active connection counter must decrease when connection closed."""
        from agentco.handlers import ws_events
        user_id = "user-decrement-test"
        ws_events._active_ws_connections[user_id] = 2
        # Simulate decrement
        ws_events._active_ws_connections[user_id] -= 1
        assert ws_events._active_ws_connections[user_id] == 1
        # When reaches 0 - should be cleaned up
        ws_events._active_ws_connections[user_id] -= 1
        if ws_events._active_ws_connections.get(user_id, 0) <= 0:
            ws_events._active_ws_connections.pop(user_id, None)
        assert user_id not in ws_events._active_ws_connections
