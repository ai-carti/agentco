import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWarRoomStore, getNextMockEvent, type WarRoomAgentStatus } from '../store/warRoomStore'
import { useWarRoomSocket } from '../hooks/useWarRoomSocket'
import { useToast } from '../context/ToastContext'
import { getStoredToken } from '../api/client'
import Button from './Button'
import { Moon } from 'lucide-react'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

const statusDotStyle: Record<WarRoomAgentStatus, string> = {
  idle: 'bg-gray-500',
  thinking: 'bg-green-400 animate-pulse',
  running: 'bg-green-400 animate-pulse',
  done: 'bg-blue-500',
}

const statusLabel: Record<WarRoomAgentStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking…',
  running: 'Running',
  done: 'Done',
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return mobile
}

export default function WarRoomPage() {
  const agents = useWarRoomStore((s) => s.agents)
  const messages = useWarRoomStore((s) => s.messages)
  const cost = useWarRoomStore((s) => s.cost)
  const flashingAgents = useWarRoomStore((s) => s.flashingAgents)
  const loadMockData = useWarRoomStore((s) => s.loadMockData)
  const addMessage = useWarRoomStore((s) => s.addMessage)
  const updateAgentStatus = useWarRoomStore((s) => s.updateAgentStatus)
  const addCost = useWarRoomStore((s) => s.addCost)
  const clearFlash = useWarRoomStore((s) => s.clearFlash)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedEndRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const { id: companyId } = useParams<{ id?: string }>()
  const toast = useToast()
  const [stopping, setStopping] = useState(false)
  const [agentPanelOpen, setAgentPanelOpen] = useState(false)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()

  // WebSocket connection for real-time events
  const { isConnected } = useWarRoomSocket(companyId ?? 'mock-company')

  // SIRI-UX-025: isConnecting — true until first data arrives or 3s timeout
  const [isConnecting, setIsConnecting] = useState(true)
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // If agents arrive, stop connecting state
    if (agents.length > 0) {
      setIsConnecting(false)
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current)
        connectingTimerRef.current = null
      }
      return
    }
    // Only apply isConnecting logic when real WS is connected
    if (isConnected && agents.length === 0) {
      connectingTimerRef.current = setTimeout(() => {
        setIsConnecting(false)
      }, 3000)
      return () => {
        if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
      }
    }
    // Not connected via real WS — not in connecting state
    setIsConnecting(false)
  }, [isConnected, agents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load mock data on mount — only when no real WS is connected
  // SIRI-UX-032: clear mock data when real WS connects so no flash of fake agents
  useEffect(() => {
    if (!isConnected) {
      loadMockData()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When WS connects (real data), clear mock data so no stale mock agents show
  const prevConnectedRef = useRef(false)
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      // WS just connected — reset store so mock agents are cleared
      // Real agents will come in via WS events
      useWarRoomStore.getState().reset()
    }
    prevConnectedRef.current = isConnected
  }, [isConnected])

  // Mock WS fallback: setInterval ~3 sec cycling agent statuses + adding messages
  // Only run when not connected to real WS
  useEffect(() => {
    if (agents.length === 0) return
    if (isConnected) {
      // Stop interval if running
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      const store = useWarRoomStore.getState()
      const event = getNextMockEvent(store.agents)

      addMessage(event.message)
      addCost(0.0012)

      if (event.statusUpdate) {
        updateAgentStatus(event.statusUpdate.agentId, event.statusUpdate.status)
      }
    }, 3000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [agents.length, isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  // SIRI-UX-016: Auto-scroll activity feed to latest message
  useEffect(() => {
    if (feedEndRef.current && typeof feedEndRef.current.scrollIntoView === 'function') {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Clear flash after animation
  useEffect(() => {
    if (flashingAgents.size === 0) return
    const timer = setTimeout(() => {
      flashingAgents.forEach((id) => clearFlash(id))
    }, 1000)
    return () => clearTimeout(timer)
  }, [flashingAgents, clearFlash])

  const handleStop = async () => {
    if (!companyId || stopping) return
    setStopping(true)
    try {
      const token = getStoredToken()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

      // Fetch active runs and stop each
      const runsRes = await fetch(`${BASE_URL}/api/companies/${companyId}/runs?status=running`, { headers })
      if (!runsRes.ok) {
        toast.error(`Failed to fetch runs (${runsRes.status})`)
        return
      }
      // RunOut schema uses `id`, not `run_id` — SIRI-UX-078 fix
      const runs: { id: string }[] = await runsRes.json().catch(() => [])
      const toStop = Array.isArray(runs) ? runs : []

      if (toStop.length === 0) {
        toast.info('No active runs to stop')
        return
      }

      const results = await Promise.allSettled(
        toStop.map((r) =>
          fetch(`${BASE_URL}/api/companies/${companyId}/runs/${r.id}/stop`, {
            method: 'POST',
            headers,
          }),
        ),
      )

      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
      if (failures.length > 0) {
        toast.error(`Failed to stop ${failures.length} run(s)`)
      } else {
        toast.success('All runs stopped')
      }
    } catch {
      toast.error('Failed to stop runs')
    } finally {
      setStopping(false)
    }
  }

  // SIRI-UX-025: Connecting state — show spinner while waiting for first WS data
  if (agents.length === 0 && isConnecting) {
    return (
      <div
        data-testid="war-room-connecting"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 360,
          background: '#0a0f1a',
          color: '#e2e8f0',
          gap: '1rem',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid #374151',
          borderTopColor: '#3b82f6',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Connecting…</div>
      </div>
    )
  }

  // Empty state
  if (agents.length === 0) {
    return (
      <div
        data-testid="war-room-page"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 360,
          background: '#0a0f1a',
          color: '#e2e8f0',
          gap: '1.5rem',
        }}
      >
        <Moon className="w-12 h-12 text-gray-400" />

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
            All quiet here
          </div>
          <div style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: 280 }}>
            No agents are running. Start a task to see the magic
          </div>
        </div>

        <Button
          data-testid="war-room-run-task-btn"
          variant="primary"
          onClick={() => companyId ? navigate(`/companies/${companyId}`) : navigate('/')}
          style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem' }}
        >
          ▶ Run a Task
        </Button>
      </div>
    )
  }

  // Sort agents: level 0 (CEO) first, then by level
  const sortedAgents = [...agents].sort((a, b) => a.level - b.level)

  return (
    <div
      data-testid="war-room-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 360,
        background: '#0a0f1a',
        color: '#e2e8f0',
      }}
    >
      {/* Top bar: cost + stop */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#0d1321',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Mobile: agents toggle (SIRI-UX-017) */}
          {isMobile && (
            <button
              data-testid="mobile-agents-toggle"
              onClick={() => setAgentPanelOpen((v) => !v)}
              aria-label="Toggle agents panel"
              aria-expanded={agentPanelOpen}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6,
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '0.75rem',
              }}
            >
              👥 {agents.length}
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>
            War Room
          </h1>
          <span
            data-testid="ws-status-indicator"
            title={isConnected ? 'Connected' : 'Disconnected'}
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: isConnected ? '#22c55e' : '#6b7280',
              flexShrink: 0,
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            data-testid="cost-counter"
            style={{
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              color: '#fbbf24',
              background: 'rgba(251,191,36,0.1)',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            ${cost.toFixed(4)}
          </span>

          <Button
            data-testid="stop-btn"
            variant="danger"
            onClick={handleStop}
            disabled={stopping}
            style={{ padding: '8px 20px', fontSize: '0.9rem' }}
          >
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        </div>
      </div>

      {/* Main content: agent sidebar + activity feed */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Mobile agent panel backdrop */}
        {isMobile && agentPanelOpen && (
          <div
            onClick={() => setAgentPanelOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9 }}
          />
        )}

        {/* Agent cards sidebar */}
        <div
          data-testid="agent-panel"
          style={{
            width: 280,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 12px',
            overflowY: 'auto',
            background: '#0d1321',
            // Mobile: slide-in drawer (SIRI-UX-017)
            ...(isMobile ? {
              position: 'absolute',
              top: 0,
              left: agentPanelOpen ? 0 : -290,
              bottom: 0,
              zIndex: 10,
              transition: 'left 0.25s ease',
              boxShadow: agentPanelOpen ? '4px 0 20px rgba(0,0,0,0.5)' : 'none',
            } : {}),
          }}
        >
          <h2 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Agents ({agents.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedAgents.map((agent) => {
              const isFlashing = flashingAgents.has(agent.id)
              return (
                <div
                  key={agent.id}
                  data-testid={`agent-card-${agent.id}`}
                  data-flash={isFlashing ? 'true' : 'false'}
                  className={isFlashing ? 'flash-green' : ''}
                  style={{
                    marginLeft: `${agent.level * 24}px`,
                    background: isFlashing
                      ? 'rgba(34,197,94,0.25)'
                      : agent.status === 'thinking' || agent.status === 'running'
                        ? 'rgba(34,197,94,0.06)'
                        : 'rgba(255,255,255,0.03)',
                    border: isFlashing
                      ? '1px solid rgba(34,197,94,0.5)'
                      : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    transition: 'background 0.3s, border-color 0.3s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.4rem' }}>{agent.avatar}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f1f5f9' }}>
                        {agent.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                        {agent.role}
                      </div>
                    </div>
                    <span
                      data-testid="agent-status-dot"
                      className={statusDotStyle[agent.status]}
                      aria-label={statusLabel[agent.status]}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: '0.7rem',
                      color: agent.status === 'thinking' || agent.status === 'running' ? '#4ade80' : '#64748b',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {statusLabel[agent.status]}
                    {(agent.status === 'thinking' || agent.status === 'running') && (
                      <span
                        data-testid="thinking-animation"
                        style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}
                      >
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            style={{
                              width: 3,
                              height: 3,
                              borderRadius: '50%',
                              background: '#4ade80',
                              display: 'inline-block',
                              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity Feed */}
        <div
          data-testid="activity-feed"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Activity Feed
            <span
              data-testid="live-indicator"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 12,
                padding: '1px 8px',
                fontSize: '0.65rem',
                color: '#4ade80',
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#4ade80',
                  animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                  display: 'inline-block',
                }}
              />
              LIVE
            </span>
          </div>
          {/* SIRI-UX-068: aria-live so screen readers announce new agent messages */}
          <div
            aria-live="polite"
            aria-label="Agent activity feed"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {messages.map((msg) => {
              const isExpanded = expandedMessages.has(msg.id)
              const isLong = msg.content.length > 120
              return (
                <div
                  key={msg.id}
                  data-testid="feed-message"
                  role={isLong ? 'button' : undefined}
                  tabIndex={isLong ? 0 : undefined}
                  aria-expanded={isLong ? isExpanded : undefined}
                  onClick={() => {
                    if (!isLong) return
                    setExpandedMessages((prev) => {
                      const next = new Set(prev)
                      if (next.has(msg.id)) next.delete(msg.id)
                      else next.add(msg.id)
                      return next
                    })
                  }}
                  onKeyDown={(e) => {
                    if (!isLong) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setExpandedMessages((prev) => {
                        const next = new Set(prev)
                        if (next.has(msg.id)) next.delete(msg.id)
                        else next.add(msg.id)
                        return next
                      })
                    }
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    border: '1px solid rgba(255,255,255,0.05)',
                    cursor: isLong ? 'pointer' : 'default',
                  }}
                >
                  <div data-testid={`feed-message-${msg.id}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#60a5fa' }}>
                        {msg.senderName}
                      </span>
                      <span style={{ color: '#475569', fontSize: '0.8rem' }}>→</span>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#a78bfa' }}>
                        {msg.targetName}
                      </span>
                      <span
                        data-testid="message-timestamp"
                        style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#475569', fontFamily: 'monospace' }}
                      >
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      data-testid="message-content"
                      style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.4 }}
                    >
                      {/* SIRI-UX-050: expand/collapse long messages on click */}
                      {isExpanded ? msg.content : truncate(msg.content, 120)}
                    </div>
                    {isLong && (
                      <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 4 }}>
                        {isExpanded ? '▲ Show less' : '▼ Show more'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: '0.9rem' }}>
                Waiting for agent activity...
              </div>
            )}
            {/* SIRI-UX-016: sentinel for auto-scroll */}
            <div ref={feedEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
