import { useEffect, useRef, useState, useCallback } from 'react'
// SIRI-UX-298: removed `events` state — it was never consumed by any component
// and caused a re-render on every WS message. Kept as ref if debugging is ever needed.
import { useWarRoomStore, type WarRoomAgentStatus } from '../store/warRoomStore'
import { getStoredToken } from '../api/client'

const BASE_WS_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000')
  .replace(/^http/, 'ws')

const MAX_BACKOFF_MS = 30_000

interface WsEvent {
  id: string
  type: string
  [key: string]: unknown
}

interface UseWarRoomSocketResult {
  isConnected: boolean
  error: string | null
}

export function useWarRoomSocket(companyId: string): UseWarRoomSocketResult {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const retryDelayRef = useRef<number>(1000)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)

  // SIRI-UX-267: use getState() inside callback instead of subscribing to action refs
  // Zustand actions are stable but including them in useCallback deps is semantically incorrect
  // and causes WS to reconnect if the store is ever rebuilt (e.g. in tests).
  // Only companyId is a real dep — store actions are always the same functions.

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    // SIRI-UX-096: pass auth token as query param — backend requires ?token=<jwt>
    // Without it, backend closes with code 4001 (unauthorized), wiping mock data
    const token = getStoredToken()
    const url = token
      ? `${BASE_WS_URL}/ws/companies/${companyId}/events?token=${encodeURIComponent(token)}`
      : `${BASE_WS_URL}/ws/companies/${companyId}/events`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return }
      setIsConnected(true)
      setError(null)
      retryDelayRef.current = 1000 // reset backoff on successful connect
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WsEvent

        // SIRI-UX-267: access store actions via getState() — avoids stale closure issues
        // and keeps connect() deps array minimal ([companyId] only)
        const store = useWarRoomStore.getState()

        // Update warRoomStore based on event type
        if (data.type === 'llm_token') {
          // SIRI-POST-004: aggregate real cost from WS events
          if (typeof data.cost === 'number') {
            store.addCost(data.cost)
          }
        } else if (data.type === 'message') {
          // SIRI-UX-126: validate payload shape before addMessage to avoid undefined fields in Activity Feed
          if (!data.id || typeof data.content !== 'string') {
            // silently skip malformed message event
          } else {
            // SIRI-UX-135: FeedMessage now has optional senderId/targetId — no cast needed
            store.addMessage({
              id: data.id as string,
              senderName: (data.senderName ?? data.sender_name ?? '') as string,
              targetName: (data.targetName ?? data.target_name ?? '') as string,
              content: data.content as string,
              timestamp: (data.timestamp ?? new Date().toISOString()) as string,
              senderId: (data.senderId ?? data.sender_id) as string | undefined,
              targetId: (data.targetId ?? data.target_id) as string | undefined,
            })
          }
        } else if (data.type === 'run.completed') {
          // SIRI-UX-079: handle run lifecycle events
          store.setRunStatus('done')
        } else if (data.type === 'run.failed') {
          store.setRunStatus('failed')
        } else if (data.type === 'run.stopped') {
          store.setRunStatus('stopped')
        } else if (data.type === 'run.started' || data.type === 'run.status_changed') {
          store.setRunStatus('active')
        } else if (data.type === 'agent_status') {
          const VALID_STATUSES: WarRoomAgentStatus[] = ['idle', 'thinking', 'running', 'done']
          const agentId = data.agentId
          const status = data.status

          // SIRI-UX-101: removed console.warn — noisy in DevTools during demo
          if (typeof agentId !== 'string') {
            // silently skip malformed event
          } else if (typeof status !== 'string' || !VALID_STATUSES.includes(status as WarRoomAgentStatus)) {
            // silently skip unknown status
          } else {
            store.updateAgentStatus(agentId, status as WarRoomAgentStatus)
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      setError('WebSocket error')
    }

    ws.onclose = (event: CloseEvent) => {
      setIsConnected(false)
      if (unmountedRef.current) return
      // Clean close (1000) — don't reconnect
      if (event.wasClean && event.code === 1000) return
      // 4001 = Unauthorized (missing/invalid token) — don't retry, would loop forever
      if (event.code === 4001) {
        setError('WebSocket unauthorized — check authentication')
        return
      }
      // 4003 = Forbidden (no access to company) — don't retry
      if (event.code === 4003) {
        setError('WebSocket forbidden — no access to this company')
        return
      }

      // Exponential backoff reconnect
      const delay = Math.min(retryDelayRef.current, MAX_BACKOFF_MS)
      retryTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_BACKOFF_MS)
          connect()
        }
      }, delay)
    }
  // SIRI-UX-267: only companyId is a real dep — store actions accessed via getState() inside callback
  }, [companyId])

  useEffect(() => {
    unmountedRef.current = false
    connect()

    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return { isConnected, error }
}
