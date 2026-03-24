"""
ALEX-TD-170: RegisterRequest.password — no max_length Field constraint.
ALEX-TD-171: .env.example — missing env vars documentation.

TDD: tests written first (red), then fix (green).
"""
import os
import pytest


# ── ALEX-TD-170: RegisterRequest.password max_length ─────────────────────────

def test_register_password_100kb_returns_422(auth_client):
    """100KB password string must be rejected at Pydantic field level (max_length=128).

    ALEX-TD-170: Without max_length, Pydantic allocates the full 100KB string
    in memory before the validator can check length. With max_length=128 in Field(),
    Pydantic rejects it at field validation, before the validator even runs.
    """
    client, _ = auth_client
    huge_password = "A" * 100_000  # 100KB
    response = client.post(
        "/auth/register",
        json={"email": "test@example.com", "password": huge_password},
    )
    assert response.status_code == 422, (
        f"Expected 422 for 100KB password, got {response.status_code}: {response.json()}"
    )


def test_register_password_129_chars_returns_422(auth_client):
    """Password with 129 chars must be rejected (max_length=128)."""
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "test2@example.com", "password": "A" * 129},
    )
    assert response.status_code == 422, (
        f"Expected 422 for 129-char password, got {response.status_code}: {response.json()}"
    )


def test_register_password_128_chars_valid_format_returns_422_for_bcrypt_limit(auth_client):
    """Password exactly 128 chars should pass max_length check but still fail bcrypt limit (>72 bytes).

    RegisterRequest.password validator checks len(v.encode('utf-8')) > 72.
    max_length=128 allows the field through field validation; the existing
    validator then rejects it as > 72 bcrypt bytes.
    """
    client, _ = auth_client
    # 128 ASCII chars: passes max_length=128, but > 72 bytes → validator rejects
    response = client.post(
        "/auth/register",
        json={"email": "test3@example.com", "password": "A" * 128},
    )
    assert response.status_code == 422, (
        f"Expected 422 for 128-char password (bcrypt limit), got {response.status_code}"
    )


def test_register_password_72_ascii_chars_accepted(auth_client):
    """72 ASCII chars (72 bytes) should pass both max_length=128 and bcrypt validator."""
    client, _ = auth_client
    response = client.post(
        "/auth/register",
        json={"email": "td170_ok@example.com", "password": "A" * 72},
    )
    assert response.status_code == 201, (
        f"Expected 201 for 72-char password, got {response.status_code}: {response.json()}"
    )


# ── ALEX-TD-171: .env.example coverage ───────────────────────────────────────

ENV_EXAMPLE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "backend", ".env.example"
)
# Relative from test file location: tests/ → backend/ → .env.example
_ENV_EXAMPLE_ABS = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", ".env.example")
)

# Env vars that exist in production code but were missing from .env.example
REQUIRED_ENV_VARS = [
    "RATE_LIMIT_RUNS_READ",
    "RATE_LIMIT_AUTH_ME",
    "RATE_LIMIT_COMPANIES_READ",
    "RATE_LIMIT_AGENTS_READ",
    "RATE_LIMIT_AGENTS_TREE",
    "RATE_LIMIT_TASKS_CREATE",
    "RATE_LIMIT_TASKS_MUTATE",
    "RATE_LIMIT_TASKS_READ",
    "RATE_LIMIT_CREDENTIALS",
    "RATE_LIMIT_LIBRARY_READ",
    "RATE_LIMIT_SAVE_LIBRARY",
    "RATE_LIMIT_FORK",
    "RATE_LIMIT_TEMPLATES_READ",
    "RATE_LIMIT_TEMPLATES_CREATE",
    "RATE_LIMIT_MCP_CREATE",
    "RATE_LIMIT_MCP_DELETE",
    "RATE_LIMIT_MCP_READ",
    "RATE_LIMIT_MEMORY",
    "LLM_CALL_TIMEOUT_SEC",
    "MAX_WS_CONNECTIONS_PER_USER",
    "VALIDATE_KEY_TIMEOUT_SEC",
]


def test_env_example_documents_all_rate_limit_vars():
    """.env.example must document all env vars used in production code.

    ALEX-TD-171: Many rate limit and tuning variables are used in handlers/
    and orchestration/ but not mentioned in .env.example. A production operator
    cannot know about them without reading source code.
    """
    assert os.path.exists(_ENV_EXAMPLE_ABS), f".env.example not found at {_ENV_EXAMPLE_ABS}"
    with open(_ENV_EXAMPLE_ABS) as f:
        content = f.read()

    missing = [var for var in REQUIRED_ENV_VARS if var not in content]
    assert not missing, (
        f".env.example is missing documentation for these env vars: {missing}"
    )
