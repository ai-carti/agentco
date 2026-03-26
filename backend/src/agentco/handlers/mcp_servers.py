import uuid
import ipaddress
import logging
import os
from datetime import datetime
from enum import Enum
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db.session import get_session
from ..auth.dependencies import get_current_user
from ..orm.user import UserORM
from ..orm.mcp_server import MCPServerORM
from ..repositories.base import NotFoundError
from ..repositories.agent import AgentRepository
from ..repositories.company import CompanyRepository
from ..core.rate_limiting import limiter

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/companies/{company_id}/agents/{agent_id}/mcp-servers",
    tags=["mcp-servers"],
)

# ALEX-TD-118: rate limits for mutable MCP server endpoints
_RATE_LIMIT_MCP_CREATE = os.getenv("RATE_LIMIT_MCP_CREATE", "20/minute")
_RATE_LIMIT_MCP_DELETE = os.getenv("RATE_LIMIT_MCP_DELETE", "20/minute")
# ALEX-TD-155: rate limit for GET list endpoint
_RATE_LIMIT_MCP_READ = os.getenv("RATE_LIMIT_MCP_READ", "120/minute")


# ── Schemas ───────────────────────────────────────────────────────────────────

class TransportEnum(str, Enum):
    stdio = "stdio"
    sse = "sse"


class MCPServerCreate(BaseModel):
    # ALEX-TD-121: max_length=200 prevents megabyte name payloads
    name: str = Field(..., min_length=1, max_length=200)
    # ALEX-TD-121: max_length + scheme validation prevents SSRF vectors
    server_url: str = Field(..., min_length=1, max_length=2048)
    transport: TransportEnum

    @field_validator("server_url")
    @classmethod
    def url_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("server_url must not be empty or whitespace-only")
        # ALEX-TD-121: only allow http/https to prevent SSRF (file://, ftp://, etc.)
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("server_url must start with http:// or https://")
        # ALEX-TD-162: block localhost and private IP ranges to prevent SSRF.
        # Attackers can use MCP server URLs to probe internal network / cloud metadata.
        from urllib.parse import urlparse
        try:
            parsed = urlparse(v)
            hostname = parsed.hostname or ""
        except Exception as parse_exc:
            # ALEX-TD-227: log parse failure so SSRF validation errors are diagnosable
            # BUG-082: use WARNING so admins see URL rejection reason at LOG_LEVEL=INFO
            logger.warning("urlparse failed for SSRF check on %r: %s", v, parse_exc)
            raise ValueError("server_url is not a valid URL")
        # Block by hostname string
        _blocked_names = {"localhost", "localhost."}
        if hostname.lower() in _blocked_names or hostname.lower().endswith(".localhost"):
            raise ValueError("server_url hostname is not allowed (localhost is not allowed for SSRF prevention)")
        # Block by IP address ranges
        # ALEX-TD-233: also handle hex IPv4 (e.g. 0x7f000001 → 127.0.0.1) and
        # full-form IPv6 loopback (0:0:0:0:0:0:0:1) which urlparse doesn't expand.
        # ipaddress.ip_address() cannot parse hex IPv4 strings directly, so we
        # detect the 0x prefix and convert via int() first.
        # DNS rebinding KNOWN LIMITATION: if a hostname resolves to a public IP at
        # validation time but an attacker controls DNS to flip it to a private IP
        # for the actual connection, this filter is bypassed. Full protection requires
        # re-resolving the hostname at connection time (runtime DNS check), which is
        # complex in async systems. Documented as known limitation — mitigate with
        # network-level egress filtering (firewall deny RFC-1918 outbound).
        try:
            # ALEX-TD-256: also handle decimal-encoded IPv4 (e.g. 2130706433 → 127.0.0.1)
            # and octal-encoded (e.g. 0177.0.0.1). ipaddress.ip_address() does NOT parse
            # these as valid IPs (raises ValueError), so they would silently pass as
            # "domain name" without explicit detection.
            # ALEX-TD-261: also handle hex-dotted (0x7f.0.0.1) and octal-dotted (0177.0.0.1)
            # bypass formats. Python socket/ipaddress do NOT parse these, so each dotted
            # octet must be normalised manually before the private-range check.
            candidate = hostname

            def _is_private_ip(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
                return addr.is_loopback or addr.is_private or addr.is_link_local or addr.is_unspecified

            def _try_parse_dotted_octet(octet: str) -> int | None:
                """Parse a single IPv4 octet that may be hex (0x..) or octal (0..)."""
                octet = octet.strip()
                if octet.startswith(("0x", "0X")):
                    try:
                        return int(octet, 16)
                    except ValueError:
                        return None
                if len(octet) > 1 and octet.startswith("0"):
                    try:
                        return int(octet, 8)
                    except ValueError:
                        return None
                try:
                    return int(octet, 10)
                except ValueError:
                    return None

            if candidate.startswith(("0x", "0X")) and "." not in candidate:
                # Hex IPv4: 0x7f000001 → 127.0.0.1
                try:
                    int_val = int(candidate, 16)
                    candidate_addr = ipaddress.ip_address(int_val)
                    if _is_private_ip(candidate_addr):
                        raise ValueError(
                            f"server_url hostname '{hostname}' resolves to a private/internal IP (hex format) — not allowed for SSRF prevention"
                        )
                except (ValueError, OverflowError) as hex_exc:
                    if "not allowed" in str(hex_exc) or "SSRF" in str(hex_exc):
                        raise
            elif candidate.isdigit():
                # Decimal-encoded IPv4: 2130706433 → 127.0.0.1
                try:
                    int_val = int(candidate)
                    candidate_addr = ipaddress.ip_address(int_val)
                    if _is_private_ip(candidate_addr):
                        raise ValueError(
                            f"server_url hostname '{hostname}' resolves to a private/internal IP (decimal format) — not allowed for SSRF prevention"
                        )
                except (ValueError, OverflowError) as dec_exc:
                    if "not allowed" in str(dec_exc) or "SSRF" in str(dec_exc):
                        raise
            else:
                # First try: standard ipaddress parse (handles plain dotted-decimal + IPv6)
                parsed_std = None
                try:
                    parsed_std = ipaddress.ip_address(candidate)
                except ValueError:
                    pass

                if parsed_std is not None:
                    # Standard dotted-decimal or IPv6
                    if _is_private_ip(parsed_std):
                        raise ValueError(
                            f"server_url hostname '{hostname}' is a private/internal IP — not allowed for SSRF prevention"
                        )
                else:
                    # ALEX-TD-261: attempt to parse as 4-octet dotted notation where each
                    # octet may use hex (0x..) or octal (0..) encoding. Python's ipaddress
                    # rejects these, so normalise each octet explicitly.
                    parts = candidate.split(".")
                    if len(parts) == 4:
                        octets = [_try_parse_dotted_octet(p) for p in parts]
                        if all(o is not None and 0 <= o <= 255 for o in octets):
                            # Valid 4-part dotted address with non-standard octet encoding
                            dotted = ".".join(str(o) for o in octets)
                            try:
                                norm_addr = ipaddress.ip_address(dotted)
                                if _is_private_ip(norm_addr):
                                    raise ValueError(
                                        f"server_url hostname '{hostname}' resolves to a private/internal IP "
                                        f"(normalised: {dotted}) — not allowed for SSRF prevention"
                                    )
                            except ValueError as v_exc:
                                if "not allowed" in str(v_exc) or "SSRF" in str(v_exc):
                                    raise
                    # If none of the above matched, treat as domain name — fine.
        except ValueError as ip_exc:
            # If it's already a ValueError from our SSRF check, re-raise
            if "not allowed" in str(ip_exc) or "private" in str(ip_exc) or "SSRF" in str(ip_exc):
                raise
            # hostname is a domain name or unrecognized format — that's fine
        return v


class MCPServerResponse(BaseModel):
    id: str
    name: str
    server_url: str
    transport: str
    enabled: bool

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_agent(session: Session, company_id: str, agent_id: str, owner_id: str) -> None:
    """Check company ownership and agent existence. Raises 404 via HTTPException."""
    company_repo = CompanyRepository(session)
    agent_repo = AgentRepository(session)
    try:
        company = company_repo.get(company_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Company not found")
    try:
        agent = agent_repo.get(agent_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.company_id != company_id:
        raise HTTPException(status_code=404, detail="Agent not found")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=MCPServerResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(_RATE_LIMIT_MCP_CREATE)
def create_mcp_server(
    request: Request,
    company_id: uuid.UUID,
    agent_id: uuid.UUID,
    body: MCPServerCreate,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    _resolve_agent(session, str(company_id), str(agent_id), current_user.id)

    # Check duplicate name for this agent
    existing = session.scalars(
        select(MCPServerORM).where(
            MCPServerORM.agent_id == str(agent_id),
            MCPServerORM.name == body.name,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"MCP server with name '{body.name}' already exists for this agent")

    mcp = MCPServerORM(
        agent_id=str(agent_id),
        name=body.name,
        server_url=body.server_url,
        transport=body.transport.value,
    )
    session.add(mcp)
    session.commit()
    session.refresh(mcp)
    return mcp


@router.get("", response_model=list[MCPServerResponse])
@limiter.limit(_RATE_LIMIT_MCP_READ)
def list_mcp_servers(
    request: Request,
    company_id: uuid.UUID,
    agent_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),  # ALEX-TD-244: le=200→100 consistent with ALEX-TD-238
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    _resolve_agent(session, str(company_id), str(agent_id), current_user.id)
    servers = session.scalars(
        select(MCPServerORM)
        .where(MCPServerORM.agent_id == str(agent_id))
        .order_by(MCPServerORM.created_at.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    return list(servers)


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_RATE_LIMIT_MCP_DELETE)
def delete_mcp_server(
    request: Request,
    company_id: uuid.UUID,
    agent_id: uuid.UUID,
    server_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: UserORM = Depends(get_current_user),
):
    _resolve_agent(session, str(company_id), str(agent_id), current_user.id)
    mcp = session.get(MCPServerORM, str(server_id))
    if mcp is None or mcp.agent_id != str(agent_id):
        raise HTTPException(status_code=404, detail="MCP server not found")
    session.delete(mcp)
    session.commit()
