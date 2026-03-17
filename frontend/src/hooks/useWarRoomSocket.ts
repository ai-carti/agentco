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
        } else if (data.type === 'agent_status') {
          updateAgentStatus(data.agentId as string, data.status as WarRoomAgentStatus)
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
  }, [companyId, addMessage, updateAgentStatus])

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
