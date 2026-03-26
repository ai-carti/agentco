"""
Tests for BUG-082: mcp_servers.py urlparse failure logged at DEBUG instead of WARNING.

Problem: handlers/mcp_servers.py — when urlparse fails for an invalid URL
(e.g. http://[broken-ipv6]), the except block calls logger.debug(...) which is
invisible at LOG_LEVEL=INFO (production default). Admins cannot diagnose why an
MCP server URL was rejected.

Fix: replace logger.debug with logger.warning in the urlparse except block.
"""
from __future__ import annotations

import logging
import pytest
from unittest.mock import patch


class TestBug082UrlparseLoggingLevel:
    """BUG-082: urlparse failure in SSRF check must log at WARNING, not DEBUG."""

    def test_urlparse_failure_logs_at_warning_level(self, caplog):
        """
        When urlparse raises an exception on a malformed URL, the except block
        must emit a WARNING so it's visible at LOG_LEVEL=INFO (production default).

        RED before fix: logger.debug(...) → invisible at INFO level.
        GREEN after fix: logger.warning(...) → visible at INFO level.
        """
        from agentco.handlers.mcp_servers import MCPServerCreate, TransportEnum
        import pydantic

        # Force urlparse to throw by patching urllib.parse.urlparse
        # (urlparse is imported locally inside url_not_blank validator)
        with patch("urllib.parse.urlparse", side_effect=Exception("simulated urlparse crash")):
            with caplog.at_level(logging.WARNING, logger="agentco.handlers.mcp_servers"):
                with pytest.raises(pydantic.ValidationError):
                    MCPServerCreate(
                        name="broken",
                        server_url="http://broken-url-that-crashes-urlparse.example.com",
                        transport=TransportEnum.sse,
                    )

        # Must have a WARNING record
        warning_records = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert warning_records, (
            "BUG-082: urlparse failure should emit a WARNING log, but none found. "
            "Replace logger.debug with logger.warning in mcp_servers.py urlparse except block."
        )

    def test_urlparse_failure_not_debug_only(self, caplog):
        """
        After fix, the log record for urlparse failure must be at WARNING level, not DEBUG.
        DEBUG-only logging is invisible in production (LOG_LEVEL=INFO).
        """
        from agentco.handlers.mcp_servers import MCPServerCreate, TransportEnum
        import pydantic

        with patch("urllib.parse.urlparse", side_effect=Exception("crash")):
            with caplog.at_level(logging.DEBUG, logger="agentco.handlers.mcp_servers"):
                with pytest.raises(pydantic.ValidationError):
                    MCPServerCreate(
                        name="broken",
                        server_url="http://example.com",
                        transport=TransportEnum.sse,
                    )

        all_records = [r for r in caplog.records]
        warning_plus = [r for r in all_records if r.levelno >= logging.WARNING]
        debug_only = [r for r in all_records if r.levelno == logging.DEBUG]

        # After fix: WARNING-level record expected for urlparse failure
        assert warning_plus, (
            "After BUG-082 fix: expect at least one WARNING-level record for urlparse failure"
        )
        # urlparse failure should NOT be at DEBUG level
        urlparse_debug = [r for r in debug_only if "urlparse" in r.message.lower() or "url" in r.message.lower()]
        assert not urlparse_debug, (
            f"BUG-082: urlparse failure record is still at DEBUG level: {urlparse_debug}"
        )
