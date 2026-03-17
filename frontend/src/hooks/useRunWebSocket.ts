import { useEffect, useRef, useCallback } from 'react'
import { useWarRoomStore } from '../store/warRoomStore'

const MAX_RETRIES = 3
const RETRY_DELAY = 3000

export function useRunWebSocket(runId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addMessage = useWarRoomStore((s) => s.addMessage)
  const updateAgentStatus = useWarRoomStore((s) => s.updateAgentStatus)
  const addCost = useWarRoomStore((s) => s.addCost)
  const setRunStatus = useWarRoomStore((s) => s.setRunStatus)

  const connect = useCallback(() => {
    if (!runId) return

    const ws = new WebSocket(`ws://localhost:8000/ws/runs/${runId}`)

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data)

      if (event.type === 'agent.message') {
        addMessage({
          id: event.id,
          senderId: event.sender_id,
          senderName: event.sender_name,
          targetId: event.target_id,
          targetName: event.target_name,
          content: event.content,
          timestamp: event.timestamp,
        })
      } else if (event.type === 'agent.status') {
        updateAgentStatus(event.agent_id, event.status)
      } else if (event.type === 'cost.update') {
        addCost(event.amount)
      } else if (event.type === 'run.stopped' || event.type === 'run.done' || event.type === 'run.failed') {
        setRunStatus(event.type.split('.')[1] as 'stopped' | 'done' | 'failed')
      }
    }

    ws.onclose = () => {
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current += 1
        timerRef.current = setTimeout(() => {
          connect()
        }, RETRY_DELAY)
      }
    }

    wsRef.current = ws
  }, [runId, addMessage, updateAgentStatus, addCost, setRunStatus])

  useEffect(() => {
    retriesRef.current = 0
    connect()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [connect])
}
