import { useEffect, useRef, useState, useCallback } from 'react'
import { useWarRoomStore, type FeedMessage, type WarRoomAgentStatus } from '../store/warRoomStore'

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

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    const url = `${BASE_WS_URL}/ws/companies/${companyId}/events`
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
        setEvents((prev) => [...prev, data])

        // Update warRoomStore based on event type
        if (data.type === 'message') {
          addMessage(data as unknown as FeedMessage)
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

          if (typeof agentId !== 'string') {
            console.warn('[useWarRoomSocket] agent_status: missing or invalid agentId field', data)
          } else if (typeof status !== 'string' || !VALID_STATUSES.includes(status as WarRoomAgentStatus)) {
            console.warn('[useWarRoomSocket] agent_status: invalid status value', data)
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

      // Exponential backoff reconnect
      const delay = Math.min(retryDelayRef.current, MAX_BACKOFF_MS)
      retryTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_BACKOFF_MS)
          connect()
        }
      }, delay)
    }
  }, [companyId, addMessage, updateAgentStatus, setRunStatus])

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
