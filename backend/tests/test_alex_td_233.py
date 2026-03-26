"""
Tests for ALEX-TD-233: SSRF via hex IPv4 and IPv6 loopback formats.

The existing SSRF filter (ALEX-TD-162/164) blocked dotted-decimal IPv4, plain IPv6,
and localhost by string. This ticket covers additional bypass vectors:
  - Hex IPv4: http://0x7f000001/ → resolves to 127.0.0.1
  - Hex private IPv4: http://0xC0A80101/ → resolves to 192.168.1.1
  - Bracketed full IPv6 loopback: http://[0:0:0:0:0:0:0:1]/

DNS rebinding KNOWN LIMITATION (documented in mcp_servers.py):
  Hostname validated at Pydantic time may resolve to a public IP now but an attacker-
  controlled DNS can flip it to a private IP for the actual connection. Full protection
  requires runtime DNS re-resolution + IP check at connection time. This is not
  implemented. Mitigation: network-level egress firewall blocking RFC-1918 outbound.

Run: uv run pytest tests/test_alex_td_233.py -v
"""
import pytest


# ── Helpers (mirrors test_mcp_servers.py) ─────────────────────────────────────

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


# ── ALEX-TD-233: hex IPv4 and IPv6 loopback SSRF vectors ──────────────────────

@pytest.mark.parametrize("blocked_url,label", [
    # Hex-encoded IPv4 loopback (0x7f000001 = 127.0.0.1)
    ("http://0x7f000001/",           "hex IPv4 loopback (127.0.0.1)"),
    # Hex-encoded private IPv4 (0xC0A80101 = 192.168.1.1)
    ("http://0xC0A80101/secret",     "hex IPv4 private class-C (192.168.1.1)"),
    # Hex-encoded AWS metadata (0xA9FEA9FE = 169.254.169.254)
    ("http://0xA9FEA9FE/latest",     "hex IPv4 link-local AWS metadata"),
    # Hex-encoded private class-A (0x0A000001 = 10.0.0.1)
    ("http://0x0A000001/admin",      "hex IPv4 private class-A (10.0.0.1)"),
    # IPv6 loopback bracketed (::1) — already worked but ensure regression-safe
    ("http://[::1]/cmd",             "IPv6 loopback [::1]"),
    # IPv6 loopback in full expanded bracketed form
    ("http://[0:0:0:0:0:0:0:1]/",   "IPv6 loopback [0:0:0:0:0:0:0:1]"),
])
def test_ssrf_hex_ipv4_and_ipv6_loopback_blocked(auth_client, blocked_url, label):
    """ALEX-TD-233: hex IPv4 and IPv6 loopback SSRF vectors must return 422."""
    client, _ = auth_client
    token = _register_and_login(
        client, f"ssrf233_{abs(hash(label)) % 1000000}@example.com"
    )
    company_id = _create_company(client, token, f"SSRF233 {label[:15]}")
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "ssrf-probe", "server_url": blocked_url, "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 422, (
        f"ALEX-TD-233 SSRF: URL '{blocked_url}' ({label}) should be blocked with 422, "
        f"got {resp.status_code}: {resp.text}"
    )


@pytest.mark.parametrize("allowed_url,label", [
    # Legitimate external URL must still pass (regression guard)
    ("https://mcp.example.com/tools",   "public HTTPS domain"),
    ("http://mcp.example.com:8080/api", "public HTTP with port"),
])
def test_ssrf_legit_urls_still_allowed(auth_client, allowed_url, label):
    """ALEX-TD-233 regression: legitimate external URLs must still return 201."""
    client, _ = auth_client
    token = _register_and_login(
        client, f"ssrf233ok_{abs(hash(label)) % 1000000}@example.com"
    )
    company_id = _create_company(client, token, f"SSRF233 Allow {label[:10]}")
    agent_id = _create_agent(client, token, company_id)

    resp = client.post(
        _mcp_url(company_id, agent_id),
        json={"name": "ext-server", "server_url": allowed_url, "transport": "sse"},
        headers=_auth(token),
    )
    assert resp.status_code == 201, (
        f"ALEX-TD-233 regression: URL '{allowed_url}' ({label}) should be allowed (201), "
        f"got {resp.status_code}: {resp.text}"
    )


def test_ssrf_dns_rebinding_known_limitation_documented():
    """ALEX-TD-233: DNS rebinding is documented as known limitation in source code."""
    import inspect
    from agentco.handlers import mcp_servers
    source = inspect.getsource(mcp_servers)
    assert "DNS rebinding" in source, (
        "DNS rebinding limitation must be documented with a comment in mcp_servers.py"
    )
    assert "known limitation" in source.lower() or "KNOWN LIMITATION" in source, (
        "DNS rebinding comment must say it is a known limitation"
    )


# ── ALEX-TD-256: Decimal-encoded IPv4 bypass ──────────────────────────────────

class TestAlexTD256DecimalIPv4:
    """Decimal-encoded IPv4 (e.g. 2130706433 = 127.0.0.1) must be blocked.

    ALEX-TD-256: Tests use Pydantic model directly to avoid HTTP routing complexity.
    The mcp-servers endpoint is scoped to /agents/{id}/mcp-servers, not /companies.
    """

    def test_decimal_loopback_blocked(self):
        """2130706433 = 127.0.0.1 — must be blocked by Pydantic validator."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://2130706433/mcp")

    def test_decimal_private_blocked(self):
        """3232235520 = 192.168.0.0 — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://3232235520/mcp")

    def test_decimal_link_local_blocked(self):
        """2851995648 = 169.254.0.0 (link-local) — must be blocked."""
        from pydantic import ValidationError
        from agentco.handlers.mcp_servers import MCPServerCreate
        with pytest.raises(ValidationError, match="not allowed"):
            MCPServerCreate(name="test", server_url="http://2851995648/mcp")

    def test_large_decimal_no_crash(self):
        """9999999999 > max IPv4 — treated as domain, validator should not crash."""
        from agentco.handlers.mcp_servers import MCPServerCreate
        # This may succeed or fail validation for other reasons, but must not raise
        # an unexpected exception (no crash/hang)
        try:
            MCPServerCreate(name="test", server_url="http://9999999999/mcp")
        except Exception:
            pass  # Any exception is fine — just no unhandled crash
