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

ALEX-TD-055 fix: Always call websocket.accept() AFTER session.close() but
BEFORE websocket.close(). Satisfies both TD-035 (release DB before long-lived WS)
and TD-055 (proper WebSocket close handshake — proxies like Nginx/HAProxy log
close-before-accept as a connection error). Use custom codes 4001/4003 instead
of 1008 — better browser compatibility.
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

import jwt as pyjwt

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
    # 1. Authenticate — decode JWT (no DB required)
    user_id: str | None = None
    if token:
        try:
            user_id = decode_access_token(token)
        except pyjwt.PyJWTError:
            pass  # expected: invalid/expired token → user_id stays None → unauthorized
        except Exception as exc:
            logger.warning("Unexpected error decoding JWT token: %s", exc)

    # 2. ALEX-TD-011: Verify company ownership via DB.
    # ALEX-TD-035: session.close() in finally — DB released before websocket.accept().
    # This prevents holding DB connections open for the entire WebSocket lifetime.
    authorized = False
    if user_id is not None:
        try:
            company = session.scalars(
                select(CompanyORM).where(CompanyORM.id == company_id)
            ).first()
            authorized = company is not None and company.owner_id == user_id
        finally:
            session.close()  # ← released before websocket.accept() (ALEX-TD-035)
    else:
        session.close()  # always release

    # 3. ALEX-TD-055: accept() always comes before close() — correct WS handshake.
    # Proxies (Nginx, HAProxy) log close-before-accept as a connection error.
    await websocket.accept()

    if not token or user_id is None:
        # 4001 = Unauthorized (missing/invalid token)
        await websocket.close(code=4001, reason="Missing or invalid token")
        return

    if not authorized:
        # 4003 = Forbidden (valid token but no ownership)
        await websocket.close(code=4003, reason="Company not found or access denied")
        return

    bus = EventBus.get()
    # ALEX-TD-081: detect silent client disconnect (TCP close without WS close frame).
    #
    # Root problem: bus.subscribe() async generator awaits queue.get() which blocks
    # indefinitely if no events arrive. A silent TCP disconnect is never detected →
    # subscriber leaks in InProcessEventBus._subscribers list → memory leak over time.
    #
    # Fix: run a concurrent "disconnect monitor" task that awaits websocket.receive().
    # Any disconnect (WS close frame or TCP RST) raises WebSocketDisconnect there.
    # When either task finishes, we cancel the other.

    async def _forward_events() -> None:
        """Forward bus events to WebSocket."""
        async for event in bus.subscribe(company_id):
            await websocket.send_json(event)

    async def _watch_disconnect() -> None:
        """Block until client disconnects (receives close frame or error)."""
        try:
            while True:
                await websocket.receive()  # blocks; raises WebSocketDisconnect on close
        except WebSocketDisconnect:
            pass

    forward_task = asyncio.ensure_future(_forward_events())
    watch_task = asyncio.ensure_future(_watch_disconnect())

    try:
        # Wait for either task to complete (disconnect detected or connection error)
        done, pending = await asyncio.wait(
            [forward_task, watch_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
    except Exception:
        # ALEX-TD-082: must await cancelled tasks to prevent "Task exception was never retrieved"
        logger.debug("WebSocket closed for company %s", company_id)
        forward_task.cancel()
        watch_task.cancel()
        await asyncio.gather(forward_task, watch_task, return_exceptions=True)
