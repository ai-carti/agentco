"""
Tests for ALEX-POST-012 — Rate limit storage in-memory → Redis.

AC:
- If REDIS_URL is set → slowapi uses Redis storage (storage_uri=REDIS_URL)
- If REDIS_URL is not set → fallback to in-memory (current behavior)
- Tests: rate limit with Redis storage mock, fallback on in-memory when no REDIS_URL
"""
import os
import sys
import importlib
import pytest
from unittest.mock import patch, MagicMock


def _reimport_rate_limiting():
    """Force fresh import of rate_limiting module."""
    for mod_name in list(sys.modules.keys()):
        if "agentco.core.rate_limiting" in mod_name:
            del sys.modules[mod_name]
    import agentco.core.rate_limiting as m
    importlib.reload(m)
    return m


def _mock_redis_package():
    """Provide a minimal fake redis module so slowapi can load without real Redis."""
    fake_redis = MagicMock()
    fake_redis.__version__ = "4.6.0"
    # limits checks for `redis` module existence; patch it in sys.modules
    return fake_redis


class TestRateLimitStorageSelection:
    """Tests that limiter uses correct storage based on REDIS_URL env var."""

    def test_no_redis_url_uses_memory_storage(self):
        """When REDIS_URL is not set, limiter should use in-memory storage."""
        env_without_redis = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}
        with patch.dict(os.environ, env_without_redis, clear=True):
            rl_mod = _reimport_rate_limiting()
            lim = rl_mod.limiter
            storage_class = type(lim._storage).__name__
            assert "memory" in storage_class.lower() or "Memory" in storage_class, (
                f"Expected in-memory storage, got: {storage_class}"
            )

    def test_no_redis_url_storage_uri_is_none(self):
        """When REDIS_URL is not set, storage_uri on the limiter is None."""
        env_without_redis = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}
        with patch.dict(os.environ, env_without_redis, clear=True):
            rl_mod = _reimport_rate_limiting()
            lim = rl_mod.limiter
            assert lim._storage_uri is None, (
                f"Expected _storage_uri=None, got {lim._storage_uri!r}"
            )

    def test_get_limiter_for_env_no_redis_url(self):
        """get_limiter_for_env() returns in-memory limiter when no REDIS_URL."""
        env_without_redis = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}
        with patch.dict(os.environ, env_without_redis, clear=True):
            rl_mod = _reimport_rate_limiting()
            lim = rl_mod.get_limiter_for_env()
            assert lim._storage_uri is None

    def test_create_limiter_none_storage_uri(self):
        """create_limiter(None) produces in-memory limiter."""
        env_without_redis = {k: v for k, v in os.environ.items() if k != "REDIS_URL"}
        with patch.dict(os.environ, env_without_redis, clear=True):
            rl_mod = _reimport_rate_limiting()
            lim = rl_mod.create_limiter(storage_uri=None)
            assert lim._storage_uri is None
            storage_class = type(lim._storage).__name__
            assert "memory" in storage_class.lower() or "Memory" in storage_class

    def test_redis_url_env_creates_limiter_with_redis_storage_uri(self):
        """When REDIS_URL is set, limiter is created with storage_uri=REDIS_URL.

        Uses mock redis module so no real Redis connection needed.
        """
        redis_url = "redis://localhost:6379/0"
        fake_redis = _mock_redis_package()
        fake_redis_client = MagicMock()
        fake_redis_client.info.return_value = {}
        fake_redis.Redis.return_value = fake_redis_client
        fake_redis.ConnectionPool.return_value = MagicMock()

        with patch.dict(os.environ, {"REDIS_URL": redis_url}):
            with patch.dict(sys.modules, {"redis": fake_redis, "redis.asyncio": MagicMock()}):
                rl_mod = _reimport_rate_limiting()
                lim = rl_mod.limiter
                assert lim._storage_uri == redis_url, (
                    f"Expected storage_uri={redis_url!r}, got {lim._storage_uri!r}"
                )

    def test_get_limiter_for_env_redis_url(self):
        """get_limiter_for_env() returns Redis-backed limiter when REDIS_URL is set."""
        redis_url = "redis://localhost:6379/1"
        fake_redis = _mock_redis_package()
        fake_redis_client = MagicMock()
        fake_redis_client.info.return_value = {}
        fake_redis.Redis.return_value = fake_redis_client
        fake_redis.ConnectionPool.return_value = MagicMock()

        with patch.dict(os.environ, {"REDIS_URL": redis_url}):
            with patch.dict(sys.modules, {"redis": fake_redis, "redis.asyncio": MagicMock()}):
                rl_mod = _reimport_rate_limiting()
                lim = rl_mod.get_limiter_for_env()
                assert lim._storage_uri == redis_url, (
                    f"Expected storage_uri={redis_url!r}, got {lim._storage_uri!r}"
                )

    def test_create_limiter_with_redis_url(self):
        """create_limiter(redis_url) passes storage_uri to Limiter."""
        redis_url = "redis://localhost:6379/2"
        fake_redis = _mock_redis_package()
        fake_redis_client = MagicMock()
        fake_redis_client.info.return_value = {}
        fake_redis.Redis.return_value = fake_redis_client
        fake_redis.ConnectionPool.return_value = MagicMock()

        with patch.dict(sys.modules, {"redis": fake_redis, "redis.asyncio": MagicMock()}):
            rl_mod = _reimport_rate_limiting()
            lim = rl_mod.create_limiter(storage_uri=redis_url)
            assert lim._storage_uri == redis_url


class TestEnvExampleDocumented:
    """REDIS_URL must be documented in backend/.env.example for rate limiting."""

    def test_redis_url_in_backend_env_example(self):
        """backend/.env.example contains REDIS_URL entry."""
        import pathlib
        env_example = pathlib.Path(__file__).parent.parent / ".env.example"
        assert env_example.exists(), ".env.example not found in backend/"
        content = env_example.read_text()
        assert "REDIS_URL" in content, ".env.example does not document REDIS_URL"

    def test_redis_url_rate_limit_comment_in_env_example(self):
        """backend/.env.example has REDIS_URL documented in rate limiting section."""
        import pathlib
        env_example = pathlib.Path(__file__).parent.parent / ".env.example"
        content = env_example.read_text()
        # Check REDIS_URL is present AND there's a rate limiting section
        has_redis_url = "REDIS_URL" in content
        has_rate_limit = "rate limit" in content.lower() or "rate_limit" in content.lower()
        assert has_redis_url and has_rate_limit, (
            "backend/.env.example must document REDIS_URL with rate limiting context. "
            f"has_redis_url={has_redis_url}, has_rate_limit={has_rate_limit}"
        )

    def test_redis_url_rate_limit_storage_mentioned(self):
        """backend/.env.example specifically mentions REDIS_URL for rate limit storage."""
        import pathlib
        env_example = pathlib.Path(__file__).parent.parent / ".env.example"
        content = env_example.read_text()
        # Look for REDIS_URL mention near "rate limit storage" or similar
        lines = content.splitlines()
        found = False
        for i, line in enumerate(lines):
            if "REDIS_URL" in line:
                # Check surrounding lines (5 above and 5 below) for rate limit mention
                context = "\n".join(lines[max(0, i-5):min(len(lines), i+6)])
                if "rate" in context.lower() or "storage" in context.lower():
                    found = True
                    break
        assert found, (
            "REDIS_URL in .env.example should be documented near rate limit storage context"
        )
