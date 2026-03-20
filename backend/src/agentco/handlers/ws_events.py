"""
WebSocket endpoint for real-time events (M2-005).

GET /ws/companies/{company_id}/events?token=<jwt>

ALEX-TD-011 fix: After JWT validation, verify that the authenticated user
actually owns the requested company. Without this check, any valid user
could subscribe to events from other users' companies.

ALEX-TD-035 fix: DB session is used ONLY for ownership check, then explicitly
closed BEFORE websocket.accept(). Previously the session was held open for the
entire WebSocket lifetime via Depends(get_session) — pool exhaustion under load.
We still receive the session via Depends so test fixtures can override it,
but close it explicitly right after the authorization check.

ALEX-TD-055 fix: Always call websocket.accept() before websocket.close().
Some proxies (Nginx, HAProxy) log a close-before-accept as a connection error.
Use custom codes 4001 (unauthorized) and 4003 (forbidden) instead of 1008 —
1008 is not reliably handled in all browsers.
"""
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth.security import decode_access_token
from ..core.event_bus import EventBus
from ..db.session import get_session
from ..orm.company import CompanyORM

logger = logging.getLogger(__name__)

router = APIRouter()

# Custom WebSocket close codes (4000–4999 are available for application use)
_WS_CLOSE_UNAUTHORIZED = 4001   # missing / invalid token
_WS_CLOSE_FORBIDDEN = 4003      # valid token but insufficient ownership


@router.websocket("/ws/companies/{company_id}/events")
async def ws_company_events(
    websocket: WebSocket,
    company_id: str,
    token: str = Query(default=""),
    session: Session = Depends(get_session),
):
    # 1. Always accept first so proxies don't log a spurious connection error.
    await websocket.accept()

    # 2. Authenticate via query param token
    if not token:
        await websocket.close(code=4001, reason="Missing token")  # 4001 = Unauthorized
        return

    try:
        user_id = decode_access_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")  # 4001 = Unauthorized
        return

    # 3. ALEX-TD-011: Verify company ownership — user must own the company
    # ALEX-TD-035: close session immediately after ownership check, before accept().
    # This prevents holding DB connections open for the entire WebSocket lifetime.
    try:
        company = session.scalars(
            select(CompanyORM).where(CompanyORM.id == company_id)
        ).first()
        authorized = company is not None and company.owner_id == user_id
    finally:
        session.close()

    if not authorized:
        await websocket.close(code=4003, reason="Company not found or access denied")  # 4003 = Forbidden
        return

    bus = EventBus.get()
    try:
        async for event in bus.subscribe(company_id):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket closed for company %s", company_id)
