"""
WebSocket endpoint for real-time events (M2-005).

GET /ws/companies/{company_id}/events?token=<jwt>   ← legacy (logs JWT in nginx)
GET /ws/companies/{company_id}/events               ← preferred (SIRI-UX-360 fix)

SIRI-UX-360 fix: support auth via first WS message instead of query param.
When no ?token= is provided, the backend accepts the WS connection and waits
up to WS_AUTH_TIMEOUT_SEC (default 5) seconds for the first message:
  {"type": "auth", "token": "<jwt>"}
If the message is received within the timeout, it is used for authentication.
This prevents the JWT from appearing in server access logs as a query param.
Backward compatibility: ?token= query param still works (legacy fallback).

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
import json
import logging
import os
import uuid

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

# SIRI-UX-360: when client connects without ?token= query param, wait up to
# WS_AUTH_TIMEOUT_SEC seconds for a first message: {"type": "auth", "token": "<jwt>"}
# This prevents JWT leaking into nginx/Railway access logs as a query param.
_WS_AUTH_TIMEOUT_SEC: float = float(os.environ.get("WS_AUTH_TIMEOUT_SEC", "5"))

# ALEX-TD-149: per-user WebSocket connection limit to prevent DoS.
# Each WS connection subscribes to InProcessEventBus + runs 2 asyncio tasks.
# Without limit, a single user can exhaust server memory with 10K+ connections.
# Configurable via MAX_WS_CONNECTIONS_PER_USER env var (default 5).
_MAX_WS_CONNECTIONS_PER_USER: int = int(os.environ.get("MAX_WS_CONNECTIONS_PER_USER", "5"))
_active_ws_connections: dict[str, int] = {}  # user_id → active connection count

# ALEX-TD-159: per-user asyncio.Lock for TOCTOU-safe read-check-increment.
# Without this lock, two concurrent WS connections from the same user can both
# read the same current_count (below limit), both pass the check, and both
# increment — resulting in more accepted connections than the configured limit.
# The lock ensures check+increment is atomic across concurrent asyncio coroutines.
_ws_connection_locks: dict[str, asyncio.Lock] = {}  # user_id → Lock


def _get_ws_lock(user_id: str) -> asyncio.Lock:
    """Return (creating if needed) the per-user asyncio.Lock."""
    if user_id not in _ws_connection_locks:
        _ws_connection_locks[user_id] = asyncio.Lock()
    return _ws_connection_locks[user_id]


def _decode_token_safe(token: str) -> str | None:
    """Decode a JWT token and return user_id, or None on any error."""
    try:
        return decode_access_token(token)
    except pyjwt.PyJWTError:
        return None  # expected: invalid/expired token
    except Exception as exc:
        logger.warning("Unexpected error decoding JWT token: %s", exc)
        return None


@router.websocket("/ws/companies/{company_id}/events")
async def ws_company_events(
    websocket: WebSocket,
    company_id: uuid.UUID,
    token: str = Query(default=""),
    session: Session = Depends(get_session),
):
    # SIRI-UX-360: support two auth modes:
    #   a) Legacy: ?token=<jwt> in query param (logs JWT in nginx — deprecated)
    #   b) Preferred: no query param; wait for first WS message {"type":"auth","token":"<jwt>"}
    #
    # ALEX-TD-055: websocket.accept() must come before websocket.close().
    # ALEX-TD-035: session must be released before the long-lived WS connection starts.

    # Step 1: Accept the WS connection unconditionally (ALEX-TD-055).
    await websocket.accept()

    # Step 2: Resolve the auth token — from query param or first message.
    auth_token: str = token  # may be empty if client uses first-message auth

    if not auth_token:
        # SIRI-UX-360: no query-param token → wait for first message auth
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=_WS_AUTH_TIMEOUT_SEC)
            msg = json.loads(raw)
            if isinstance(msg, dict) and msg.get("type") == "auth" and isinstance(msg.get("token"), str):
                auth_token = msg["token"]
            else:
                await websocket.close(code=4001, reason="Expected auth message {type:'auth', token:'...'}")
                session.close()
                return
        except asyncio.TimeoutError:
            await websocket.close(code=4001, reason="Auth timeout — send {type:'auth', token:'<jwt>'} within 5s")
            session.close()
            return
        except (WebSocketDisconnect, json.JSONDecodeError, Exception):
            session.close()
            return

    # Step 3: Authenticate — decode JWT (no DB required)
    user_id: str | None = _decode_token_safe(auth_token)

    # Step 4: ALEX-TD-011: Verify company ownership via DB.
    # ALEX-TD-035: session.close() in finally — DB released before event loop.
    authorized = False
    if user_id is not None:
        try:
            company = session.scalars(
                select(CompanyORM).where(CompanyORM.id == str(company_id))
            ).first()
            authorized = company is not None and company.owner_id == user_id
        finally:
            session.close()  # ← released before long-lived WS loop (ALEX-TD-035)
    else:
        session.close()  # always release

    if user_id is None:
        # 4001 = Unauthorized (missing/invalid token)
        # ALEX-TD-278: log auth failures so brute-force / invalid token issues are visible in prod logs.
        logger.warning(
            "ws_auth_failed: invalid or missing token for company %s (peer=%s)",
            str(company_id), websocket.client,
        )
        await websocket.close(code=4001, reason="Missing or invalid token")
        return

    if not authorized:
        # 4003 = Forbidden (valid token but no ownership)
        # ALEX-TD-278: log ownership failures — distinguishes "wrong company" from "no token" in logs.
        logger.warning(
            "ws_authz_failed: user %s denied access to company %s (not found or not owner)",
            user_id, str(company_id),
        )
        await websocket.close(code=4003, reason="Company not found or access denied")
        return

    # ALEX-TD-149 + ALEX-TD-159: enforce per-user connection limit (DoS prevention)
    # with TOCTOU-safe atomic check-increment via per-user asyncio.Lock.
    #
    # Without the lock: two concurrent connections can both read current_count=0,
    # both pass the limit check, and both increment — exceeding the limit silently.
    # With the lock: only one coroutine runs the check+increment at a time.
    assert user_id is not None  # guaranteed by auth checks above
    _lock = _get_ws_lock(user_id)
    async with _lock:
        current_count = _active_ws_connections.get(user_id, 0)
        if current_count >= _MAX_WS_CONNECTIONS_PER_USER:
            logger.warning(
                "ws_conn_limit: user %s exceeded limit %d (current=%d), closing with 4029",
                user_id, _MAX_WS_CONNECTIONS_PER_USER, current_count,
            )
            await websocket.close(code=4029, reason="Too many connections")
            return

        # Atomically increment — inside the lock, no other coroutine can race here
        _active_ws_connections[user_id] = current_count + 1

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
        """Forward bus events to WebSocket.

        ALEX-TD-089: catch send_json errors (WebSocketDisconnect, RuntimeError on
        already-closed socket) and break out of the event loop cleanly instead of
        raising an unhandled exception that shows as "Task exception was never retrieved"
        in Python stderr.
        """
        async for event in bus.subscribe(str(company_id)):
            try:
                await websocket.send_json(event)
            except (WebSocketDisconnect, RuntimeError, OSError):
                # Client disconnected mid-stream — stop forwarding
                # OSError covers ConnectionResetError from anyio transport layer
                break

    async def _watch_disconnect() -> None:
        """Block until client disconnects (receives close frame or error)."""
        try:
            while True:
                await websocket.receive()  # blocks; raises WebSocketDisconnect on close
        except WebSocketDisconnect:
            pass  # expected — client closed connection normally
        except Exception as exc:
            # ALEX-TD-124: log unexpected errors (OOM, transport errors, etc.)
            # instead of silently swallowing them.
            logger.warning("_watch_disconnect: unexpected error for company %s: %s", str(company_id), exc, exc_info=True)

    forward_task = asyncio.ensure_future(_forward_events())
    watch_task = asyncio.ensure_future(_watch_disconnect())

    try:
        # Wait for either task to complete (disconnect detected or connection error)
        done, pending = await asyncio.wait(
            [forward_task, watch_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        # ALEX-TD-089: retrieve exceptions from done tasks to prevent
        # "Task exception was never retrieved" Python warnings.
        # A task in 'done' may have raised an exception (e.g. send_json on closed WS).
        for task in done:
            try:
                task.result()
            except (asyncio.CancelledError, WebSocketDisconnect, Exception) as exc:
                logger.debug("WebSocket task finished with: %s", exc)

        for task in pending:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
    except Exception as exc:
        # ALEX-TD-082: must await cancelled tasks to prevent "Task exception was never retrieved"
        # ALEX-TD-124: log unexpected exceptions (not just debug) so they're visible in prod logs.
        logger.warning("WebSocket outer loop error for company %s: %s", str(company_id), exc)
        forward_task.cancel()
        watch_task.cancel()
        await asyncio.gather(forward_task, watch_task, return_exceptions=True)
    finally:
        # ALEX-TD-149: always decrement active connection count on disconnect.
        # Ensures the slot is freed even on unexpected errors, timeouts, or cancellations.
        remaining = _active_ws_connections.get(user_id, 1) - 1
        if remaining <= 0:
            _active_ws_connections.pop(user_id, None)
            # ALEX-TD-161: clean up per-user lock when last connection closes.
            # Without this, _ws_connection_locks grows unboundedly with each unique user.
            _ws_connection_locks.pop(user_id, None)
        else:
            _active_ws_connections[user_id] = remaining
