import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'
import { useWarRoomStore, getNextMockEvent, type WarRoomAgentStatus } from '../store/warRoomStore'
import { useWarRoomSocket } from '../hooks/useWarRoomSocket'
import { useToast } from '../context/ToastContext'
import { getStoredToken, BASE_URL } from '../api/client'
import Button from './Button'
import { Moon } from 'lucide-react'
import { formatTimeHMS, truncate } from '../utils/taskUtils'


const statusDotStyle: Record<WarRoomAgentStatus, string> = {
  idle: 'bg-gray-500',
  thinking: 'bg-green-400 animate-pulse',
  running: 'bg-green-400 animate-pulse',
  done: 'bg-blue-500',
}

// SIRI-UX-335: inline background fallbacks for environments without Tailwind CSS processing
// (test environments, SSR, email previews). Tailwind classes are the primary source; these
// are fallbacks that ensure dots are visible even without CSS compilation.
const statusDotBg: Record<WarRoomAgentStatus, string> = {
  idle: '#6b7280',      // gray-500
  thinking: '#4ade80',  // green-400
  running: '#4ade80',   // green-400
  done: '#3b82f6',      // blue-500
}

const statusLabel: Record<WarRoomAgentStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking…',
  running: 'Running',
  done: 'Done',
}

// SIRI-UX-132: use shared debounced useIsMobile hook (was inline here, now extracted)
import { useIsMobile } from '../hooks/useIsMobile'

export default function WarRoomPage() {
  // SIRI-UX-297: merge state subscriptions into one useShallow selector to avoid up to 10
  // separate re-renders when the store updates multiple fields in a batch.
  // Actions are stable references and kept as separate subscriptions (no re-render cost).
  const { agents, messages, cost, runStatus, flashingAgents } = useWarRoomStore(
    useShallow((s) => ({
      agents: s.agents,
      messages: s.messages,
      cost: s.cost,
      runStatus: s.runStatus,
      flashingAgents: s.flashingAgents,
    }))
  )
  const loadMockData = useWarRoomStore((s) => s.loadMockData)
  const addMessage = useWarRoomStore((s) => s.addMessage)
  const updateAgentStatus = useWarRoomStore((s) => s.updateAgentStatus)
  // SIRI-UX-212: addCost removed from mock interval — cost only accumulated from real WS llm_token events
  const clearFlash = useWarRoomStore((s) => s.clearFlash)
  const setRunStatus = useWarRoomStore((s) => s.setRunStatus)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedEndRef = useRef<HTMLDivElement | null>(null)
  // SIRI-UX-175: store abort controller for handleStop so it can be cancelled on unmount
  const stopAbortRef = useRef<AbortController | null>(null)
  const navigate = useNavigate()
  const { id: companyId } = useParams<{ id?: string }>()
  const toast = useToast()
  const [stopping, setStopping] = useState(false)
  const [agentPanelOpen, setAgentPanelOpen] = useState(false)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()

  // WebSocket connection for real-time events
  const { isConnected, error: wsError } = useWarRoomSocket(companyId ?? 'mock-company')

  // SIRI-UX-025: isConnecting — true until first data arrives or 3s timeout
  const [isConnecting, setIsConnecting] = useState(true)
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // SIRI-UX-184: always clean up timer on re-run (regardless of which branch set it)
    // If agents arrive, stop connecting state
    if (agents.length > 0) {
      setIsConnecting(false)
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current)
        connectingTimerRef.current = null
      }
      return () => {
        if (connectingTimerRef.current) {
          clearTimeout(connectingTimerRef.current)
          connectingTimerRef.current = null
        }
      }
    }
    // Only apply isConnecting logic when real WS is connected
    if (isConnected && agents.length === 0) {
      connectingTimerRef.current = setTimeout(() => {
        setIsConnecting(false)
        connectingTimerRef.current = null
      }, 3000)
      return () => {
        if (connectingTimerRef.current) {
          clearTimeout(connectingTimerRef.current)
          connectingTimerRef.current = null
        }
      }
    }
    // Not connected via real WS — not in connecting state
    setIsConnecting(false)
    return () => {
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current)
        connectingTimerRef.current = null
      }
    }
  }, [isConnected, agents.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // SIRI-UX-113: reset store when companyId changes (switching between companies)
  // Without this, cost/$, messages and agents from previous company persist in store
  // Use ref to skip reset on initial mount — only reset on actual companyId change
  const prevCompanyIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const safeReset = () => {
      // Guard against mocked store in tests that don't provide getState
      if (typeof useWarRoomStore.getState === 'function') {
        useWarRoomStore.getState().reset()
      }
    }
    if (prevCompanyIdRef.current !== undefined && prevCompanyIdRef.current !== companyId) {
      safeReset()
      // SIRI-UX-128: clear stale expanded message IDs when switching companies
      setExpandedMessages(new Set())
      // SIRI-UX-223: reset mobile agent panel open state when switching companies
      setAgentPanelOpen(false)
    }
    prevCompanyIdRef.current = companyId
    return () => {
      safeReset()
    }
  }, [companyId])

  // Load mock data on mount — only when no real WS is connected AND VITE_MOCK_WAR_ROOM is enabled
  // SIRI-UX-032: clear mock data when real WS connects so no flash of fake agents
  // SIRI-UX-222: guard with VITE_MOCK_WAR_ROOM flag so production doesn't load fake agents
  useEffect(() => {
    if (!isConnected && import.meta.env.VITE_MOCK_WAR_ROOM === 'true') {
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
  // Only run when not connected to real WS AND VITE_MOCK_WAR_ROOM flag is enabled
  useEffect(() => {
    if (import.meta.env.VITE_MOCK_WAR_ROOM !== 'true') return
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
      // SIRI-UX-212: do NOT call addCost in mock interval — cost must only come from real WS llm_token events
      // (per SIRI-POST-004). Fake cost values confuse developers testing the real WS path.

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

  // SIRI-UX-149: prune expandedMessages Set when messages are evicted by the 300-cap
  // Prevents unbounded growth of stale message IDs in long sessions
  useEffect(() => {
    if (expandedMessages.size === 0) return
    const currentIds = new Set(messages.map((m) => m.id))
    setExpandedMessages((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (currentIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear flash after animation
  useEffect(() => {
    if (flashingAgents.size === 0) return
    const timer = setTimeout(() => {
      flashingAgents.forEach((id) => clearFlash(id))
    }, 1000)
    return () => clearTimeout(timer)
  }, [flashingAgents, clearFlash])

  // SIRI-UX-175: abort any in-flight stop request when component unmounts
  useEffect(() => {
    return () => { stopAbortRef.current?.abort() }
  }, [])

  // SIRI-UX-273: useCallback prevents handleStop recreation on every render
  const handleStop = useCallback(async () => {
    if (!companyId || stopping) return
    setStopping(true)
    // SIRI-UX-173/175: AbortController stored in ref so unmount can abort it
    const abortController = new AbortController()
    stopAbortRef.current = abortController
    const { signal } = abortController
    try {
      const token = getStoredToken()
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

      // Fetch active runs and stop each
      const runsRes = await fetch(`${BASE_URL}/api/companies/${companyId}/runs?status=running`, { headers, signal })
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
            signal,
          }),
        ),
      )

      // SIRI-UX-216: guard signal after async Promise.allSettled — component may have unmounted
      if (signal.aborted) return
      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
      if (failures.length > 0) {
        toast.error(`Failed to stop ${failures.length} run(s)`)
      } else {
        // SIRI-UX-098: update run status so Stop banner appears and button disables
        setRunStatus('stopped')
        toast.success('All runs stopped')
      }
    } catch (err) {
      // SIRI-UX-173: guard against AbortError when component unmounts during request
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Failed to stop runs')
    } finally {
      if (!signal.aborted) {
        setStopping(false)
        stopAbortRef.current = null
      }
    }
  // SIRI-UX-284: removed `runStatus` from deps — it's not read inside handleStop.
  // Including it caused handleStop to be recreated on every status change unnecessarily.
  // SIRI-UX-320: setRunStatus added to deps to avoid stale closure
  }, [companyId, stopping, toast, setRunStatus]) // SIRI-UX-273

  // SIRI-UX-266: useMemo MUST be before any early returns (Rules of Hooks)
  // Sort agents: level 0 (CEO) first, then by level
  const sortedAgents = useMemo(() => [...agents].sort((a, b) => a.level - b.level), [agents])

  // SIRI-UX-294: extracted from Stop button — was duplicated in `disabled` and `style.opacity`
  const isStopDisabled = stopping || runStatus === 'idle' || runStatus === 'done' || runStatus === 'failed' || runStatus === 'stopped'

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
        {/* SIRI-UX-209: use CSS class instead of inline animation so prefers-reduced-motion can override */}
        <div
          className="war-room-connecting-spinner"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid #374151',
            borderTopColor: '#3b82f6',
          }}
        />
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
            aria-label={isConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
            role="img"
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
            disabled={isStopDisabled}
            style={{ padding: '8px 20px', fontSize: '0.9rem', opacity: isStopDisabled ? 0.4 : 1 }}
          >
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        </div>
      </div>

      {/* SIRI-UX-099: WS error banner — shown when WebSocket fails to connect */}
      {wsError && (
        <div
          data-testid="ws-error-banner"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            background: 'rgba(239,68,68,0.12)',
            borderBottom: '1px solid rgba(239,68,68,0.3)',
            fontSize: '0.8rem',
            color: '#f87171',
            fontWeight: 600,
          }}
        >
          ⚠ {wsError}
        </div>
      )}

      {/* SIRI-UX-082: Run status banner — shown when run finishes/fails/stops */}
      {(runStatus === 'done' || runStatus === 'failed' || runStatus === 'stopped') && (
        <div
          data-testid="run-status-banner"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            background: runStatus === 'done'
              ? 'rgba(34,197,94,0.12)'
              : runStatus === 'failed'
                ? 'rgba(239,68,68,0.12)'
                : 'rgba(107,114,128,0.12)',
            borderBottom: `1px solid ${runStatus === 'done' ? 'rgba(34,197,94,0.3)' : runStatus === 'failed' ? 'rgba(239,68,68,0.3)' : 'rgba(107,114,128,0.3)'}`,
            fontSize: '0.8rem',
            color: runStatus === 'done' ? '#4ade80' : runStatus === 'failed' ? '#f87171' : '#9ca3af',
            fontWeight: 600,
          }}
        >
          {runStatus === 'done' && '✓ Run completed'}
          {runStatus === 'failed' && '✗ Run failed'}
          {runStatus === 'stopped' && '⏹ Run stopped'}
        </div>
      )}

      {/* Main content: agent sidebar + activity feed */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Mobile agent panel backdrop */}
        {isMobile && agentPanelOpen && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Close agents panel"
            onClick={() => setAgentPanelOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                e.preventDefault()
                setAgentPanelOpen(false)
              }
            }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9 }}
          />
        )}

        {/* Agent cards sidebar */}
        {/* SIRI-UX-340: role="region" + aria-labelledby so screen reader landmark navigation reaches agents panel */}
        <div
          data-testid="agent-panel"
          role="region"
          aria-labelledby="agents-panel-heading"
          // BUG-074: CSS class provides transition with prefers-reduced-motion support
          className={isMobile ? 'war-room-agent-panel' : undefined}
          style={{
            width: 280,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 12px',
            overflowY: 'auto',
            background: '#0d1321',
            // Mobile: slide-in drawer (SIRI-UX-017)
            // BUG-074: use CSS class for transition so prefers-reduced-motion can override it
            ...(isMobile ? {
              position: 'absolute',
              top: 0,
              left: agentPanelOpen ? 0 : -290,
              bottom: 0,
              zIndex: 10,
              boxShadow: agentPanelOpen ? '4px 0 20px rgba(0,0,0,0.5)' : 'none',
            } : {}),
          }}
        >
          <h2 id="agents-panel-heading" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
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
                  // SIRI-UX-200: role + aria-label for screen reader accessibility
                  role="article"
                  aria-label={`${agent.name} — ${statusLabel[agent.status]}`}
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
                      role="img"
                      className={statusDotStyle[agent.status]}
                      aria-label={statusLabel[agent.status]}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        flexShrink: 0,
                        // SIRI-UX-335: inline fallback so dot is visible without Tailwind
                        background: statusDotBg[agent.status],
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
                            key={`thinking-dot-${i}`}
                            className="war-room-thinking-dot"
                            style={{
                              width: 3,
                              height: 3,
                              borderRadius: '50%',
                              background: '#4ade80',
                              display: 'inline-block',
                              animationDelay: `${i * 0.2}s`,
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
        {/* SIRI-UX-340: role="region" + aria-labelledby so screen reader landmark navigation reaches activity feed */}
        <div
          data-testid="activity-feed"
          role="region"
          aria-labelledby="activity-feed-heading"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            id="activity-feed-heading"
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
            {/* SIRI-UX-332: hide LIVE badge when run is in a terminal state (done/stopped/failed)
                SIRI-UX-337: also hide when runStatus === 'idle' (no run started yet) —
                showing LIVE on initial page load misleads users before any run begins. */}
            {runStatus !== 'idle' && runStatus !== 'done' && runStatus !== 'stopped' && runStatus !== 'failed' && (
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
                  className="war-room-live-dot"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#4ade80',
                    display: 'inline-block',
                  }}
                />
                LIVE
              </span>
            )}
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
                  aria-label={isLong ? `${isExpanded ? 'Collapse' : 'Expand'} message from ${msg.senderName}` : undefined}
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
                        {formatTimeHMS(msg.timestamp)}
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
            {/* SIRI-UX-325: differentiate empty feed message by runStatus to avoid misleading "waiting" after run ends */}
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: '0.9rem' }}>
                {runStatus === 'stopped'
                  ? '⏹ Run stopped — no activity recorded'
                  : runStatus === 'done'
                  ? '✓ Run completed — all messages shown'
                  : runStatus === 'failed'
                  ? '✗ Run failed — no messages were sent'
                  : 'Waiting for agent activity...'}
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
