import { useEffect, useRef, useState, useCallback } from 'react'
import { useWarRoomStore, type FeedMessage, type WarRoomAgentStatus } from '../store/warRoomStore'
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
  events: WsEvent[]
  isConnected: boolean
  error: string | null
}

// SIRI-UX-116: cap events array to prevent unbounded memory growth in long sessions
const MAX_EVENTS = 500

export function useWarRoomSocket(companyId: string): UseWarRoomSocketResult {
  const [events, setEvents] = useState<WsEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const retryDelayRef = useRef<number>(1000)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)

  const addMessage = useWarRoomStore((s) => s.addMessage)
  const updateAgentStatus = useWarRoomStore((s) => s.updateAgentStatus)
  const setRunStatus = useWarRoomStore((s) => s.setRunStatus)
  const addCost = useWarRoomStore((s) => s.addCost)

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
        // SIRI-UX-116: cap events array at MAX_EVENTS to prevent memory leak in long sessions
        setEvents((prev) => {
          const next = [...prev, data]
          return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next
        })

        // Update warRoomStore based on event type
        if (data.type === 'llm_token') {
          // SIRI-POST-004: aggregate real cost from WS events
          if (typeof data.cost === 'number') {
            addCost(data.cost)
          }
        } else if (data.type === 'message') {
          // SIRI-UX-126: validate payload shape before addMessage to avoid undefined fields in Activity Feed
          if (!data.id || typeof data.content !== 'string') {
            // silently skip malformed message event
          } else {
            addMessage(data as unknown as FeedMessage)
          }
        } else if (data.type === 'run.completed') {
          // SIRI-UX-079: handle run lifecycle events
          setRunStatus('done')
        } else if (data.type === 'run.failed') {
          setRunStatus('failed')
        } else if (data.type === 'run.stopped') {
          setRunStatus('stopped')
        } else if (data.type === 'run.started' || data.type === 'run.status_changed') {
          setRunStatus('active')
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
            updateAgentStatus(agentId, status as WarRoomAgentStatus)
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
  }, [companyId, addMessage, updateAgentStatus, setRunStatus, addCost])

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

  return { events, isConnected, error }
}
