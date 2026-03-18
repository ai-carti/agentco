"""
WebSocket endpoint for real-time events (M2-005).

GET /ws/companies/{company_id}/events?token=<jwt>

ALEX-TD-011 fix: After JWT validation, verify that the authenticated user
actually owns the requested company. Without this check, any valid user
could subscribe to events from other users' companies.
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


@router.websocket("/ws/companies/{company_id}/events")
async def ws_company_events(
    websocket: WebSocket,
    company_id: str,
    token: str = Query(default=""),
    session: Session = Depends(get_session),
):
    # 1. Authenticate via query param token
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return

    try:
        user_id = decode_access_token(token)
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
        return

    # 2. ALEX-TD-011: Verify company ownership — user must own the company
    company = session.scalars(
        select(CompanyORM).where(CompanyORM.id == company_id)
    ).first()

    if company is None or company.owner_id != user_id:
        await websocket.close(code=1008, reason="Company not found or access denied")
        return

    await websocket.accept()

    bus = EventBus.get()
    try:
        async for event in bus.subscribe(company_id):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket closed for company %s", company_id)
