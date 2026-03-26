"""
Tests for ALEX-TD-261: SSRF bypass via hex-dotted and octal-dotted IPv4 formats.

Bypass vectors not covered by prior SSRF fixes:
  - 0x7f.0.0.1    (hex-dotted: each octet as 0xNN)
  - 0177.0.0.1    (octal-dotted: leading-zero octet = octal)

Python's ipaddress.ip_address() does NOT parse these and raises ValueError, which
the prior filter incorrectly treated as "domain name" → silently passed through.

ALEX-TD-261 fix: detect 4-part dotted hostnames where any octet uses hex (0x) or
octal (leading zero) notation, normalise to a real IPv4, then apply the private-range check.

Run: uv run pytest tests/test_alex_td_261.py -v
"""
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _register_and_login(client, email, password="pass1234"):
    client.post("/auth/register", json={"email": email, "password": password})
    resp = client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_company(client, token, name):
    resp = client.post("/api/companies/", json={"name": name}, headers=_auth(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_agent(client, token, company_id, name="Test Agent"):
    resp = client.post(
        f"/api/companies/{company_id}/agents",
        json={"name": name, "role": "worker", "model": "gpt-4o-mini"},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _mcp_url(company_id, agent_id):
    return f"/api/companies/{company_id}/agents/{agent_id}/mcp-servers"


# ── Unit-level tests (Pydantic model, no HTTP stack) ─────────────────────────

class TestAlexTD261Pydantic:
    """Validate bypass vectors at the Pydantic model level (fastest feedback)."""

    def test_hex_dotted_loopback_blocked(self):
        """0x7f.0.0.1 → 127.0.0.1 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0x7f.0.0.1/mcp", transport="sse")

    def test_hex_dotted_private_class_c_blocked(self):
        """0xC0.0xa8.0x01.0x01 → 192.168.1.1 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0xC0.0xa8.0x01.0x01/secret", transport="sse")

    def test_hex_dotted_private_class_a_blocked(self):
        """0x0a.0x00.0x00.0x01 → 10.0.0.1 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0x0a.0x00.0x00.0x01/admin", transport="sse")

    def test_hex_dotted_link_local_blocked(self):
        """0xa9.0xfe.0xa9.0xfe → 169.254.169.254 (AWS metadata) — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0xa9.0xfe.0xa9.0xfe/latest", transport="sse")

    def test_octal_dotted_loopback_blocked(self):
        """0177.0.0.1 → 127.0.0.1 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0177.0.0.1/mcp", transport="sse")

    def test_octal_dotted_private_class_c_blocked(self):
        """0300.0250.01.01 → 192.168.1.1 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0300.0250.01.01/secret", transport="sse")

    def test_octal_dotted_link_local_blocked(self):
        """0251.0376.0251.0376 → 169.254.169.254 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0251.0376.0251.0376/latest", transport="sse")

    def test_mixed_dotted_loopback_blocked(self):
        """0x7f.000.0.1 (hex first octet, octal second) → 127.0.0.1 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://0x7f.000.0.1/mcp", transport="sse")

    def test_legitimate_url_still_passes(self):
        """Regression: normal external URLs must still be accepted."""
        from agentco.handlers.mcp_servers import MCPServerCreate
        obj = MCPServerCreate(name="test", server_url="https://mcp.example.com/tools", transport="sse")
        assert obj.server_url == "https://mcp.example.com/tools"

    def test_plain_dotted_decimal_still_blocked(self):
        """Regression: 127.0.0.1 must still be blocked (prior coverage)."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://127.0.0.1/mcp", transport="sse")


# ── Integration tests (HTTP stack, require auth_client fixture) ───────────────

@pytest.mark.parametrize("blocked_url,label", [
    ("http://0x7f.0.0.1/mcp",            "hex-dotted loopback 0x7f.0.0.1"),
    ("http://0177.0.0.1/mcp",            "octal-dotted loopback 0177.0.0.1"),
    ("http://0xC0.0xa8.1.1/secret",      "hex-dotted private 0xC0.0xa8.1.1"),
    ("http://0300.0250.01.01/secret",     "octal-dotted private 0300.0250.01.01"),
    ("http://0xa9.0xfe.0xa9.0xfe/meta",  "hex-dotted link-local (AWS metadata)"),
])
def test_ssrf_261_bypass_vectors_blocked(auth_client, blocked_url, label):
    """ALEX-TD-261: hex-dotted and octal-dotted SSRF vectors must return 422."""
    client, _ = auth_client
    token = _register_and_login(
        client, f"ssrf261_{abs(hash(label)) % 1000000}@example.com"
    )
    company_id = _create_company(client, token, f"SSRF261 {label[:15]}")
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "ssrf-probe", "server_url": blocked_url, "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-261 SSRF: URL '{blocked_url}' ({label}) should be blocked with 422, "
        f"got {resp.status_code}: {resp.text}"
    )


@pytest.mark.parametrize("allowed_url,label", [
    ("https://mcp.example.com/tools",    "public HTTPS domain"),
    ("http://mcp.example.com:8080/api",  "public HTTP with port"),
])
def test_ssrf_261_legit_urls_still_allowed(auth_client, allowed_url, label):
    """ALEX-TD-261 regression: legitimate external URLs must still return 201."""
    client, _ = auth_client
    token = _register_and_login(
        client, f"ssrf261ok_{abs(hash(label)) % 1000000}@example.com"
    )
    company_id = _create_company(client, token, f"SSRF261 Allow {label[:10]}")
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "ext-server", "server_url": allowed_url, "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 201, (
        f"ALEX-TD-261 regression: URL '{allowed_url}' ({label}) should be allowed (201), "
        f"got {resp.status_code}: {resp.text}"
    )
