"""
ALEX-TD-160: validate_llm_key — нет timeout на acompletion
ALEX-TD-161: _ws_connection_locks — memory leak при дисконнекте
ALEX-TD-162: MCP server_url — SSRF через localhost/private IP
ALEX-TD-163: credentials.py — лишний `import os` внутри функции
"""
import asyncio
import inspect
import pytest


# ── ALEX-TD-160: validate_llm_key timeout ──────────────────────────────────

def test_validate_llm_key_uses_timeout(monkeypatch):
    """validate_llm_key должен использовать wait_for/timeout чтобы LLM-запрос не висел бесконечно."""
    import agentco.handlers.credentials as creds_mod
    src = inspect.getsource(creds_mod.validate_llm_key)
    # Must use asyncio.wait_for or have timeout kwarg
    has_timeout = (
        "wait_for" in src
        or "timeout=" in src
    )
    assert has_timeout, (
        "ALEX-TD-160: validate_llm_key must wrap acompletion() in asyncio.wait_for or pass timeout= kwarg. "
        "Without it, a hung LLM API will hold a server thread indefinitely."
    )


def test_validate_llm_key_returns_error_on_timeout(auth_client, monkeypatch):
    """validate_llm_key должен вернуть valid=False при TimeoutError."""
    import asyncio
    client, _ = auth_client

    # Register and login
    client.post("/auth/register", json={"email": "td160@example.com", "password": "pass1234"})
    resp = client.post("/auth/login", json={"email": "td160@example.com", "password": "pass1234"})
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    import agentco.handlers.credentials as creds_mod

    async def _hang(*args, **kwargs):
        raise asyncio.TimeoutError("mock timeout")

    monkeypatch.setattr(creds_mod, "acompletion", _hang)

    resp = client.post(
        "/api/llm/validate-key",
        json={"provider": "openai", "api_key": "sk-test"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["error"] is not None


# ── ALEX-TD-161: _ws_connection_locks memory leak ──────────────────────────

def test_ws_connection_locks_cleaned_up():
    """После дисконнекта (счётчик → 0) lock должен удаляться из _ws_connection_locks."""
    from agentco.handlers import ws_events

    user_id = "test-user-td161-unique-xyz"

    # Simulate: lock was created for user, one active connection
    import asyncio
    ws_events._ws_connection_locks[user_id] = asyncio.Lock()
    ws_events._active_ws_connections[user_id] = 1

    # Simulate the actual finally block from ws_events.py (fixed version)
    remaining = ws_events._active_ws_connections.get(user_id, 1) - 1
    if remaining <= 0:
        ws_events._active_ws_connections.pop(user_id, None)
        ws_events._ws_connection_locks.pop(user_id, None)
    else:
        ws_events._active_ws_connections[user_id] = remaining

    assert user_id not in ws_events._ws_connection_locks, (
        "ALEX-TD-161: _ws_connection_locks must remove user entry when connection count drops to 0. "
        "Without cleanup, locks accumulate indefinitely → memory leak."
    )
    
    # Verify the actual ws_events finally block also cleans up the lock
    import inspect
    src = inspect.getsource(ws_events.ws_company_events)
    assert "_ws_connection_locks.pop" in src, (
        "ALEX-TD-161: ws_company_events finally block must call _ws_connection_locks.pop(user_id, None) "
        "when connection count drops to 0."
    )


# ── ALEX-TD-162: MCP server_url SSRF ───────────────────────────────────────

@pytest.mark.parametrize("url", [
    "http://localhost/api",
    "http://localhost:8080",
    "http://127.0.0.1/internal",
    "http://0.0.0.0/",
    "http://10.0.0.1/secret",
    "http://192.168.1.1/admin",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data/",  # AWS metadata
])
def test_mcp_server_url_blocks_private_ips(url):
    """MCPServerCreate должен отклонять localhost и private IP ranges для защиты от SSRF."""
    from pydantic import ValidationError
    from agentco.handlers.mcp_servers import MCPServerCreate

    with pytest.raises(ValidationError):
        MCPServerCreate(name="test", server_url=url, transport="sse")


# ── ALEX-TD-163: лишний `import os` внутри функции ─────────────────────────

def test_no_duplicate_import_os_in_validate_llm_key():
    """validate_llm_key не должна содержать `import os` внутри тела функции (dead code)."""
    import agentco.handlers.credentials as creds_mod
    src = inspect.getsource(creds_mod.validate_llm_key)
    # The function body should NOT contain a standalone import os line
    lines = [line.strip() for line in src.split("\n")]
    inner_imports = [l for l in lines if l == "import os"]
    assert len(inner_imports) == 0, (
        "ALEX-TD-163: `import os` inside validate_llm_key body is dead code — os is already "
        "imported at module level. Remove it."
    )
