import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useAgentStore } from '../store/agentStore'

interface Run {
  run_id: string
  agent_name: string
  task_title: string
  status: 'running' | 'done' | 'failed' | 'stopped'
  started_at: string
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  return `${min}m ago`
}

const dotColor: Record<Run['status'], string> = {
  running: 'bg-green-500 animate-pulse',
  done: 'bg-blue-500',
  failed: 'bg-red-500',
  stopped: 'bg-gray-500',
}

const badgeStyle: Record<Run['status'], string> = {
  running: 'bg-green-900/50 text-green-400',
  done: 'bg-blue-900/50 text-blue-400',
  failed: 'bg-red-900/50 text-red-400',
  stopped: 'bg-gray-700 text-gray-400',
}

export default function WarRoom() {
  const token = useAuthStore((s) => s.token)
  const companyId = useAgentStore((s) => s.currentCompany?.id)
  const [runs, setRuns] = useState<Run[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!token || !companyId) return
    const ws = new WebSocket(
      `ws://localhost:8000/ws/companies/${companyId}/events?token=${token}`,
    )

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data)
      const type: string = event.type
      if (type === 'run.started') {
        setRuns((prev) => [
          ...prev,
          {
            run_id: event.run_id,
            agent_name: event.agent_name,
            task_title: event.task_title,
            status: 'running',
            started_at: event.started_at,
          },
        ])
      } else if (
        type === 'run.done' ||
        type === 'run.failed' ||
        type === 'run.stopped'
      ) {
        const newStatus = type.split('.')[1] as Run['status']
        setRuns((prev) =>
          prev.map((r) =>
            r.run_id === event.run_id ? { ...r, status: newStatus } : r,
          ),
        )
      }
    }

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(() => {
        connect()
      }, 3000)
    }

    wsRef.current = ws
  }, [token, companyId])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return (
    <div data-testid="war-room" className="p-4">
      <h1 className="text-xl font-bold mb-4">War Room</h1>

      {runs.length === 0 ? (
        <p className="text-gray-500">💤 All quiet here</p>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <div
              key={run.run_id}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 bg-gray-800 border border-white/10 ${
                run.status === 'done' ? 'opacity-75' : ''
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor[run.status]}`}
              />
              <div className="flex-1 min-w-0">
                <span className="font-bold">{run.agent_name}</span>
                <span className="text-gray-400 text-sm ml-2 truncate">
                  {run.task_title}
                </span>
              </div>
              <span
                data-testid={`run-status-${run.run_id}`}
                className={`text-xs px-2 py-0.5 rounded ${badgeStyle[run.status]}`}
              >
                {run.status}
              </span>
              <span className="text-xs text-gray-500">
                {timeAgo(run.started_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
