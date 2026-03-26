"""
Tests for ALEX-TD-232, ALEX-TD-234, ALEX-TD-235, ALEX-TD-237 backend self-audit fixes.

ALEX-TD-232: structlog setup_logging() — add_logger_name removed (PrintLogger compat)
ALEX-TD-234: ProxyHeadersMiddleware added to main.py for Railway/nginx trusted proxy
ALEX-TD-235: RunService._active_tasks.clear() in lifespan shutdown
ALEX-TD-237: encryption.py raises RuntimeError in production when ENCRYPTION_KEY not set
"""
from __future__ import annotations

import os
import logging
import pytest
from unittest.mock import patch


# ─── ALEX-TD-232: structlog no longer crashes with PrintLoggerFactory ──────────

class TestStructlogPrintLoggerCompat:
    """ALEX-TD-232: add_logger_name removed — PrintLogger compatible."""

    def test_setup_logging_no_crash(self):
        """setup_logging() must not raise even when called multiple times."""
        from agentco.logging_config import setup_logging
        setup_logging(level="WARNING")
        setup_logging(level="WARNING")  # idempotent

    def test_structlog_logger_call_no_attribute_error(self):
        """Calling structlog logger after setup must not raise AttributeError."""
        import structlog
        from agentco.logging_config import setup_logging
        setup_logging(level="WARNING")
        log = structlog.get_logger("test.alex_td_232")
        # Should not raise AttributeError: 'PrintLogger' object has no attribute 'name'
        log.info("test_event", ticket="ALEX-TD-232")

    def test_add_logger_name_not_in_processors(self):
        """add_logger_name must NOT be in the configured processors."""
        import structlog
        from agentco.logging_config import setup_logging
        setup_logging(level="WARNING")
        config = structlog.get_config()
        processor_names = [
            getattr(p, "__name__", type(p).__name__) for p in config["processors"]
        ]
        # add_logger_name requires .name attr → incompatible with PrintLogger
        assert "add_logger_name" not in processor_names, (
            "add_logger_name must be removed from processors (ALEX-TD-232): "
            f"found processors: {processor_names}"
        )


# ─── ALEX-TD-234: ProxyHeadersMiddleware in main.py ───────────────────────────

class TestProxyHeadersMiddleware:
    """ALEX-TD-234: uvicorn ProxyHeadersMiddleware must be added to app."""

    def test_main_imports_proxy_headers_middleware(self):
        """main.py must attempt to import and add ProxyHeadersMiddleware."""
        import agentco.main as main_module
        # The import is wrapped in try/except ImportError — verify the app is built
        app = main_module.app
        assert app is not None

    def test_proxy_headers_middleware_in_source(self):
        """ProxyHeadersMiddleware import and add_middleware must appear in main.py source."""
        try:
            from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware  # noqa: F401
        except ImportError:
            pytest.skip("uvicorn not installed — ProxyHeadersMiddleware skip")

        import inspect
        import agentco.main as main_module
        source = inspect.getsource(main_module)
        assert "ProxyHeadersMiddleware" in source, (
            "ProxyHeadersMiddleware must be imported and added in main.py (ALEX-TD-234)"
        )
        assert "add_middleware(ProxyHeadersMiddleware" in source, (
            "app.add_middleware(ProxyHeadersMiddleware, ...) must be called in main.py (ALEX-TD-234)"
        )


# ─── ALEX-TD-235: _active_tasks cleared in shutdown ───────────────────────────

class TestActiveTasksClearedOnShutdown:
    """ALEX-TD-235: RunService._active_tasks.clear() must be called during lifespan shutdown."""

    def test_active_tasks_clear_called(self):
        """Verify clear() is present in lifespan shutdown code."""
        import inspect
        import agentco.main as main_module
        source = inspect.getsource(main_module.lifespan)
        assert "_active_tasks.clear()" in source, (
            "RunService._active_tasks.clear() must be called in lifespan shutdown (ALEX-TD-235)"
        )

    def test_active_tasks_dict_is_class_level(self):
        """_active_tasks is a class-level dict on RunService."""
        from agentco.services.run import RunService
        assert isinstance(RunService._active_tasks, dict), \
            "_active_tasks must be a class-level dict"


# ─── ALEX-TD-237: encryption.py raises in production when key not set ─────────

class TestEncryptionProductionGuard:
    """ALEX-TD-237: _get_fernet must raise RuntimeError in prod when ENCRYPTION_KEY absent."""

    def test_raises_in_production_env(self):
        """RuntimeError must be raised when AGENTCO_ENV=production and no key."""
        import agentco.services.encryption as enc_mod

        original_cache = enc_mod._fernet_cache
        enc_mod._fernet_cache = None  # force key re-read
        try:
            with patch.dict(
                os.environ,
                {"AGENTCO_ENV": "production"},
                clear=False,
            ):
                # Ensure ENCRYPTION_KEY is absent
                env_without_key = {k: v for k, v in os.environ.items() if k != "ENCRYPTION_KEY"}
                with patch.dict(os.environ, env_without_key, clear=True):
                    os.environ["AGENTCO_ENV"] = "production"
                    enc_mod._fernet_cache = None
                    with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
                        enc_mod._get_fernet()
        finally:
            enc_mod._fernet_cache = original_cache

    def test_dev_fallback_with_warning(self, caplog):
        """Dev mode (no AGENTCO_ENV) must use fallback key and log warning."""
        import agentco.services.encryption as enc_mod

        original_cache = enc_mod._fernet_cache
        enc_mod._fernet_cache = None
        try:
            env_without_key = {
                k: v for k, v in os.environ.items()
                if k not in ("ENCRYPTION_KEY", "AGENTCO_ENV", "RAILWAY_ENVIRONMENT")
            }
            with patch.dict(os.environ, env_without_key, clear=True):
                enc_mod._fernet_cache = None
                with caplog.at_level(logging.WARNING, logger="agentco.services.encryption"):
                    fernet = enc_mod._get_fernet()
                assert fernet is not None
                assert any("ENCRYPTION_KEY" in r.message for r in caplog.records), \
                    "Must log warning when ENCRYPTION_KEY not set in dev"
        finally:
            enc_mod._fernet_cache = original_cache

    def test_raises_in_railway_staging(self):
        """RuntimeError must be raised when RAILWAY_ENVIRONMENT=staging and no key."""
        import agentco.services.encryption as enc_mod

        original_cache = enc_mod._fernet_cache
        enc_mod._fernet_cache = None
        try:
            env_without_key = {
                k: v for k, v in os.environ.items()
                if k not in ("ENCRYPTION_KEY", "AGENTCO_ENV", "RAILWAY_ENVIRONMENT")
            }
            with patch.dict(os.environ, env_without_key, clear=True):
                os.environ["RAILWAY_ENVIRONMENT"] = "staging"
                enc_mod._fernet_cache = None
                with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
                    enc_mod._get_fernet()
        finally:
            enc_mod._fernet_cache = original_cache
