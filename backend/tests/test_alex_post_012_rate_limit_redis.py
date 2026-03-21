"""
Tests for ALEX-POST-012 — Rate limit storage in-memory → Redis.

AC:
- If REDIS_URL is set → slowapi uses Redis storage (storage_uri=REDIS_URL)
- If REDIS_URL is not set → fallback to in-memory (current behavior)
- Tests: rate limit with Redis storage mock, fallback on in-memory when no REDIS_URL
"""
import os
import importlib
import sys
import pytest
from unittest.mock import patch, MagicMock


class TestRateLimitStorageSelection:
    """Tests that limiter uses correct storage based on REDIS_URL env var."""

    def test_no_redis_url_uses_memory_storage(self):
        """When REDIS_URL is not set, limiter should use in-memory storage."""
        env = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}
        with patch.dict(os.environ, env, clear=True):
            # Re-import the module to pick up env change
            if "agentco.core.rate_limiting" in sys.modules:
                del sys.modules["agentco.core.rate_limiting"]
            from agentco.core.rate_limiting import create_limiter
            lim = create_limiter(storage_uri=None)
            # In-memory storage class name contains "Memory" or it's the default
            storage_class = type(lim._storage).__name__
            assert "Memory" in storage_class or "InMemory" in storage_class or "memory" in storage_class.lower(), (
                f"Expected in-memory storage, got: {storage_class}"
            )

    def test_redis_url_env_creates_redis_storage(self):
        """When REDIS_URL is set, create_limiter(storage_uri=REDIS_URL) should configure Redis storage."""
        # We don't need an actual Redis connection — just check the storage_uri is passed through
        redis_url = "redis://localhost:6379/0"
        # Patch redis so it doesn't need a real connection
        with patch.dict(os.environ, {"REDIS_URL": redis_url}):
            if "agentco.core.rate_limiting" in sys.modules:
                del sys.modules["agentco.core.rate_limiting"]
            from agentco.core.rate_limiting import create_limiter
            # Storage URI should be accepted without error (lazy connection)
            lim = create_limiter(storage_uri=redis_url)
            assert lim is not None
            # The storage uri should be stored in the limiter
            assert lim._storage_uri == redis_url or redis_url in str(lim._storage_uri)

    def test_get_limiter_returns_redis_when_redis_url_set(self):
        """get_limiter() factory returns limiter with Redis storage_uri when REDIS_URL is set."""
        redis_url = "redis://localhost:6379/1"
        env_with_redis = {**os.environ, "REDIS_URL": redis_url}
        with patch.dict(os.environ, env_with_redis, clear=False):
            if "agentco.core.rate_limiting" in sys.modules:
                del sys.modules["agentco.core.rate_limiting"]
            from agentco.core.rate_limiting import get_limiter_for_env
            lim = get_limiter_for_env()
            assert lim is not None
            # Storage URI must match the Redis URL
            storage_uri = lim._storage_uri
            assert storage_uri == redis_url, (
                f"Expected storage_uri={redis_url!r}, got {storage_uri!r}"
            )

    def test_get_limiter_returns_memory_when_no_redis_url(self):
        """get_limiter() factory returns limiter with in-memory storage when no REDIS_URL."""
        env_without_redis = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}
        with patch.dict(os.environ, env_without_redis, clear=True):
            if "agentco.core.rate_limiting" in sys.modules:
                del sys.modules["agentco.core.rate_limiting"]
            from agentco.core.rate_limiting import get_limiter_for_env
            lim = get_limiter_for_env()
            assert lim is not None
            # storage_uri should be None for in-memory
            assert lim._storage_uri is None, (
                f"Expected None storage_uri for in-memory, got {lim._storage_uri!r}"
            )

    def test_module_level_limiter_uses_redis_when_env_set(self):
        """Module-level `limiter` object uses Redis when REDIS_URL is in env at import time."""
        redis_url = "redis://localhost:6379/2"
        env_with_redis = {**os.environ, "REDIS_URL": redis_url}

        # Clear module cache and reimport with REDIS_URL set
        for mod_name in list(sys.modules.keys()):
            if "agentco.core.rate_limiting" in mod_name:
                del sys.modules[mod_name]

        with patch.dict(os.environ, env_with_redis, clear=False):
            if "agentco.core.rate_limiting" in sys.modules:
                del sys.modules["agentco.core.rate_limiting"]
            import agentco.core.rate_limiting as rl_mod
            importlib.reload(rl_mod)
            module_limiter = rl_mod.limiter
            assert module_limiter._storage_uri == redis_url, (
                f"Expected storage_uri={redis_url!r}, got {module_limiter._storage_uri!r}"
            )

    def test_module_level_limiter_uses_memory_when_no_env(self):
        """Module-level `limiter` object uses in-memory when REDIS_URL is absent."""
        env_without_redis = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}

        for mod_name in list(sys.modules.keys()):
            if "agentco.core.rate_limiting" in mod_name:
                del sys.modules[mod_name]

        with patch.dict(os.environ, env_without_redis, clear=True):
            if "agentco.core.rate_limiting" in sys.modules:
                del sys.modules["agentco.core.rate_limiting"]
            import agentco.core.rate_limiting as rl_mod
            importlib.reload(rl_mod)
            module_limiter = rl_mod.limiter
            assert module_limiter._storage_uri is None, (
                f"Expected None storage_uri, got {module_limiter._storage_uri!r}"
            )


class TestEnvExampleDocumented:
    """REDIS_URL must be documented in .env.example."""

    def test_redis_url_in_backend_env_example(self):
        """backend/.env.example contains REDIS_URL entry for rate limiting."""
        import pathlib
        env_example = pathlib.Path(__file__).parent.parent / ".env.example"
        assert env_example.exists(), ".env.example not found in backend/"
        content = env_example.read_text()
        assert "REDIS_URL" in content, ".env.example does not document REDIS_URL"
        # Must be in context of rate limiting
        lines = content.splitlines()
        redis_lines = [l for l in lines if "REDIS_URL" in l]
        assert any("redis" in l.lower() or "REDIS_URL" in l for l in redis_lines), (
            f"REDIS_URL not properly documented: {redis_lines}"
        )

    def test_redis_url_rate_limit_comment_in_env_example(self):
        """backend/.env.example has a comment explaining REDIS_URL for rate limiting."""
        import pathlib
        env_example = pathlib.Path(__file__).parent.parent / ".env.example"
        content = env_example.read_text()
        # Check that there's mention of rate limit in proximity to REDIS_URL
        # (within the file, not necessarily adjacent)
        has_rate_limit_redis = (
            "rate limit" in content.lower() or "rate_limit" in content.lower()
        ) and "REDIS_URL" in content
        assert has_rate_limit_redis, (
            "No REDIS_URL + rate limit documentation found in .env.example"
        )
