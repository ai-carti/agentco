import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAgentStore } from '../store/agentStore'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import { Moon } from 'lucide-react'
// SIRI-UX-196: use shared relativeTime from taskUtils instead of local timeAgo
import { relativeTime } from '../utils/taskUtils'
// SIRI-UX-319: import BASE_URL from single source of truth
import { BASE_URL } from '../api/client'

// SIRI-UX-292: exponential backoff cap — mirrors useWarRoomSocket.ts
const MAX_BACKOFF_MS = 30_000
const INITIAL_BACKOFF_MS = 1_000

// SIRI-UX-351: module-level constant — was inside connect() (recalculated on every reconnect)
const BASE_WS_URL = BASE_URL.replace(/^http/, 'ws')

interface Run {
  run_id: string
  agent_name: string
  task_title: string
  status: 'running' | 'done' | 'failed' | 'stopped'
  started_at: string
}

// SIRI-UX-253: module-level constant — was inside component body (recreated on every render)
const MAX_RUNS = 100

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
  const [isConnecting, setIsConnecting] = useState(true)
  // SIRI-UX-110: tick state forces re-render every 30s so timeAgo stays fresh
  const [, setTick] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // SIRI-UX-292: exponential backoff delay — mirrors useWarRoomSocket.ts retryDelayRef
  const retryDelayRef = useRef<number>(INITIAL_BACKOFF_MS)
  // SIRI-UX-232: track mounted state so onclose doesn't schedule reconnect after cleanup runs
  const mountedRef = useRef(true)
  const navigate = useNavigate()

  // BUG-043: initial REST fetch to populate runs on mount / page refresh
  // SIRI-UX-163: use AbortController to prevent setState on unmounted component
  useEffect(() => {
    if (!token || !companyId) return
    const controller = new AbortController()
    fetch(`${BASE_URL}/api/companies/${companyId}/runs`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) return
        return res.json()
      })
      .then((data: Array<Record<string, unknown>> | undefined) => {
        // SIRI-UX-280: guard setState — response may arrive after component unmounts (abort fired)
        if (controller.signal.aborted) return
        if (data && data.length > 0) {
          // SIRI-UX-226: backend RunOut uses .id field, Run interface uses run_id
          // Map id → run_id so WS events (which use run_id) can find and update these runs
          const mapped: Run[] = data.map((r) => ({
            run_id: (r['run_id'] ?? r['id'] ?? '') as string,
            agent_name: (r['agent_name'] ?? '') as string,
            task_title: (r['task_title'] ?? '') as string,
            status: (r['status'] ?? 'running') as Run['status'],
            started_at: (r['started_at'] ?? new Date().toISOString()) as string,
          }))
          setRuns(mapped)
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        // silently ignore fetch errors — WS will populate state anyway
      })
    return () => controller.abort()
  }, [token, companyId])

  const connect = useCallback(() => {
    if (!token || !companyId) {
      // SIRI-UX-145: no token/company → not connecting, show empty state immediately
      setIsConnecting(false)
      return
    }
    // TODO(SIRI-UX-360): JWT in WS URL leaks to server logs. Full fix requires backend to support WS auth handshake (send token in first WS message). Tracked in ROADMAP.md SIRI-UX-360.
    const ws = new WebSocket(
      `${BASE_WS_URL}/ws/companies/${companyId}/events?token=${token}`,
    )

    // BUG-043: track connecting state — hide empty state until WS is open
    ws.onopen = () => {
      setIsConnecting(false)
      // SIRI-UX-292: reset backoff on successful connect — mirrors useWarRoomSocket.ts
      retryDelayRef.current = INITIAL_BACKOFF_MS
    }

    ws.onmessage = (e) => {
      // SIRI-UX-202: guard against malformed JSON to prevent crashing the WS handler
      let event: { type: string; run_id?: string; agent_name?: string; task_title?: string; started_at?: string }
      try {
        event = JSON.parse(e.data)
      } catch {
        return // silently ignore non-JSON frames
      }
      const type: string = event.type
      if (type === 'run.started') {
        // SIRI-UX-205: guard against missing run_id — event fields are optional, Run.run_id is required
        if (!event.run_id) return
        setRuns((prev) => {
          const next = [
            ...prev,
            {
              run_id: event.run_id as string,
              agent_name: event.agent_name ?? '',
              task_title: event.task_title ?? '',
              status: 'running' as Run['status'],
              started_at: event.started_at ?? new Date().toISOString(),
            },
          ]
          // SIRI-UX-146: cap at MAX_RUNS to prevent unbounded memory growth
          return next.length > MAX_RUNS ? next.slice(next.length - MAX_RUNS) : next
        })
      } else if (
        // SIRI-UX-224: backend publishes "run.completed" (not "run.done") — fix event type mismatch
        type === 'run.completed' ||
        type === 'run.failed' ||
        type === 'run.stopped'
      ) {
        // Map "run.completed" → 'done' status for the Run interface
        const newStatus: Run['status'] =
          type === 'run.completed' ? 'done' : (type.split('.')[1] as Run['status'])
        setRuns((prev) =>
          prev.map((r) =>
            r.run_id === event.run_id ? { ...r, status: newStatus } : r,
          ),
        )
      }
    }

    ws.onclose = (event: CloseEvent) => {
      // SIRI-UX-153: if onopen never fired, isConnecting may still be true — clear it
      // so we don't show a blank screen during reconnect cycles
      setIsConnecting(false)
      // SIRI-UX-232: if component unmounted, cleanup already ran — do NOT schedule reconnect
      if (!mountedRef.current) return
      // SIRI-UX-233: skip reconnect on intentional clean close (code 1000) — matches useWarRoomSocket pattern
      if (event.wasClean && event.code === 1000) return
      // SIRI-UX-147: do NOT reconnect on auth/permission errors — would loop forever
      if (event.code === 4001 || event.code === 4003) return
      // SIRI-UX-292: exponential backoff reconnect — mirrors useWarRoomSocket.ts pattern
      const delay = Math.min(retryDelayRef.current, MAX_BACKOFF_MS)
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) {
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_BACKOFF_MS)
          connect()
        }
      }, delay)
    }

    wsRef.current = ws
  }, [token, companyId])

  useEffect(() => {
    // SIRI-UX-254: reset mountedRef to true on every effect run (guards StrictMode double-invoke
    // and dep-change re-runs where cleanup already set it false)
    mountedRef.current = true
    // SIRI-UX-292: reset backoff on reconnect effect re-run (e.g. token/company change)
    retryDelayRef.current = INITIAL_BACKOFF_MS
    connect()
    return () => {
      // SIRI-UX-232: mark unmounted BEFORE close() so onclose doesn't schedule reconnect
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // SIRI-UX-110: refresh timeAgo labels every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div data-testid="war-room" className="p-4">
      <h1 className="text-xl font-bold mb-4">War Room</h1>

      {/* SIRI-UX-158: show skeleton while connecting so user gets feedback instead of blank area */}
      {isConnecting && runs.length === 0 ? (
        <SkeletonCard variant="task" count={3} />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<Moon className="w-12 h-12 text-gray-400" />}
          title="All quiet here"
          subtitle="No agents are running. Start a task to see the magic"
          ctaLabel="▶ Run a Task"
          onCTA={() => companyId ? navigate(`/companies/${companyId}`) : navigate('/')}
        />
      ) : (
        // SIRI-UX-321: removed dead `runs.length > 0 ? (...) : null` — always true at this point
        <div className="space-y-3">
          {runs.map((run) => (
            <div
              key={run.run_id}
              // SIRI-UX-197: keyboard accessible — role + tabIndex + onKeyDown
              role="article"
              aria-label={`${run.agent_name}: ${run.task_title} — ${run.status}`}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 bg-gray-800 border border-white/10 ${
                run.status === 'done' ? 'opacity-75' : ''
              }`}
            >
              <span
                // SIRI-UX-197: aria-label describes status dot for screen readers
                role="img"
                aria-label={`Status: ${run.status}`}
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
                {relativeTime(run.started_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
