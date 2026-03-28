"""
ALEX-TD-289: _EMBEDDING_MODEL и _DEFAULT_DB должны быть lazy (не module-level constants).

Тесты с monkeypatch.setenv должны реально влиять на поведение MemoryService,
т.к. _get_embedding_model() и _get_default_db() используют @functools.lru_cache
и могут быть сброшены через cache_clear().
"""
from __future__ import annotations

import pytest

from agentco.memory.service import _get_embedding_model, _get_default_db, MemoryService


@pytest.fixture(autouse=True)
def _clear_caches():
    """Clear lru_cache before and after each test."""
    _get_embedding_model.cache_clear()
    _get_default_db.cache_clear()
    yield
    _get_embedding_model.cache_clear()
    _get_default_db.cache_clear()


def test_embedding_model_default():
    """Without env var, returns default model."""
    import os
    os.environ.pop("EMBEDDING_MODEL", None)
    _get_embedding_model.cache_clear()
    assert _get_embedding_model() == "text-embedding-3-small"


def test_embedding_model_from_env(monkeypatch):
    """monkeypatch.setenv + cache_clear makes _get_embedding_model() return new value."""
    monkeypatch.setenv("EMBEDDING_MODEL", "custom-embed-v2")
    _get_embedding_model.cache_clear()
    assert _get_embedding_model() == "custom-embed-v2"


def test_default_db_from_env(monkeypatch):
    """monkeypatch.setenv + cache_clear makes _get_default_db() return new value."""
    monkeypatch.setenv("AGENTCO_MEMORY_DB", "/tmp/test_memory.db")
    _get_default_db.cache_clear()
    assert _get_default_db() == "/tmp/test_memory.db"


def test_default_db_fallback_to_db_path(monkeypatch):
    """Falls back to AGENTCO_DB_PATH when AGENTCO_MEMORY_DB is not set."""
    monkeypatch.delenv("AGENTCO_MEMORY_DB", raising=False)
    monkeypatch.setenv("AGENTCO_DB_PATH", "/tmp/fallback.db")
    _get_default_db.cache_clear()
    assert _get_default_db() == "/tmp/fallback.db"


def test_default_db_default_value(monkeypatch):
    """Without any env vars, returns the hardcoded default."""
    monkeypatch.delenv("AGENTCO_MEMORY_DB", raising=False)
    monkeypatch.delenv("AGENTCO_DB_PATH", raising=False)
    _get_default_db.cache_clear()
    assert _get_default_db() == "./agentco_memory.db"


def test_cache_clear_actually_changes_value(monkeypatch):
    """Verify that cache_clear allows picking up new env var values mid-process."""
    monkeypatch.setenv("EMBEDDING_MODEL", "model-A")
    _get_embedding_model.cache_clear()
    assert _get_embedding_model() == "model-A"

    # Change env var — without cache_clear, would still return "model-A"
    monkeypatch.setenv("EMBEDDING_MODEL", "model-B")
    # Cached value should still be "model-A"
    assert _get_embedding_model() == "model-A"

    # After cache_clear, picks up new value
    _get_embedding_model.cache_clear()
    assert _get_embedding_model() == "model-B"


def test_get_functions_are_lru_cached():
    """Both functions must have cache_clear attribute (lru_cache)."""
    assert hasattr(_get_embedding_model, "cache_clear"), (
        "_get_embedding_model must be wrapped with @functools.lru_cache"
    )
    assert hasattr(_get_default_db, "cache_clear"), (
        "_get_default_db must be wrapped with @functools.lru_cache"
    )
