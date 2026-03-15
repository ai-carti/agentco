"""
WebSocket endpoint for real-time events (M2-005).

GET /ws/companies/{company_id}/events?token=<jwt>
"""
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState

from ..auth.security import decode_access_token
from ..core.event_bus import EventBus

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/companies/{company_id}/events")
async def ws_company_events(
    websocket: WebSocket,
    company_id: str,
    token: str = Query(default=""),
):
    # Authenticate via query param token
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return

    try:
        decode_access_token(token)
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
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
