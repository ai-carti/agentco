"""
ALEX-TD-152: PgVectorStore reconnect on lost connection.

TDD: test first → red → implement → green.
"""
import pytest
from unittest.mock import MagicMock, patch, PropertyMock


class TestPgVectorStoreReconnect:
    """PgVectorStore must reconnect when DB connection is lost."""

    def test_pgvector_store_has_reconnect_method(self):
        """ALEX-TD-152: PgVectorStore must have _ensure_connection method."""
        from agentco.memory.vector_store import PgVectorStore
        assert hasattr(PgVectorStore, "_ensure_connection"), (
            "PgVectorStore must have _ensure_connection method for reconnect guard"
        )

    def test_pgvector_store_reconnects_on_interface_error(self):
        """ALEX-TD-152: insert must reconnect and retry on psycopg2.InterfaceError."""
        try:
            import psycopg2
        except ImportError:
            pytest.skip("psycopg2 not installed")

        from agentco.memory.vector_store import PgVectorStore

        # Create store without real DB — mock the connection
        with patch("psycopg2.connect") as mock_connect, \
             patch("pgvector.psycopg2.register_vector"):

            mock_conn = MagicMock()
            mock_conn.closed = 1  # psycopg2: 0=open, 1=closed
            mock_new_conn = MagicMock()
            mock_new_conn.closed = 0

            # First connect returns mock_conn, reconnect returns mock_new_conn
            mock_connect.side_effect = [mock_conn, mock_new_conn]

            # Setup mock cursor for _setup()
            mock_cursor = MagicMock()
            mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
            mock_cursor.__exit__ = MagicMock(return_value=False)
            mock_conn.cursor.return_value = mock_cursor
            mock_new_conn.cursor.return_value = mock_cursor

            store = PgVectorStore("postgresql://fake/db")

            # After construction, _conn is mock_conn (closed)
            # _ensure_connection should detect closed conn and reconnect
            store._ensure_connection()

            # Should have reconnected
            assert mock_connect.call_count >= 2, "Should have called psycopg2.connect again for reconnect"

    def test_pgvector_store_no_reconnect_when_conn_open(self):
        """ALEX-TD-152: _ensure_connection must NOT reconnect when connection is open."""
        try:
            import psycopg2
        except ImportError:
            pytest.skip("psycopg2 not installed")

        from agentco.memory.vector_store import PgVectorStore

        with patch("psycopg2.connect") as mock_connect, \
             patch("pgvector.psycopg2.register_vector"):

            mock_conn = MagicMock()
            mock_conn.closed = 0  # open

            mock_cursor = MagicMock()
            mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
            mock_cursor.__exit__ = MagicMock(return_value=False)
            mock_conn.cursor.return_value = mock_cursor

            mock_connect.return_value = mock_conn

            store = PgVectorStore("postgresql://fake/db")
            call_count_before = mock_connect.call_count

            store._ensure_connection()

            # No additional connect calls
            assert mock_connect.call_count == call_count_before, (
                "_ensure_connection must not reconnect when conn is open"
            )
