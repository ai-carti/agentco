import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
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
  error: 'bg-red-500',
}

// SIRI-UX-335: inline background fallbacks for environments without Tailwind CSS processing
// (test environments, SSR, email previews). Tailwind classes are the primary source; these
// are fallbacks that ensure dots are visible even without CSS compilation.
const statusDotBg: Record<WarRoomAgentStatus, string> = {
  idle: '#6b7280',      // gray-500
  thinking: '#4ade80',  // green-400
  running: '#4ade80',   // green-400
  done: '#3b82f6',      // blue-500
  error: '#ef4444',     // red-500
}

const statusLabel: Record<WarRoomAgentStatus, string> = {
  idle: 'Idle',
  thinking: 'Thinking…',
  running: 'Running',
  done: 'Done',
  error: 'Error',
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
  // SIRI-UX-413: addMessage/updateAgentStatus accessed via getState() in mock interval — no need to subscribe
  // SIRI-UX-212: addCost removed from mock interval — cost only accumulated from real WS llm_token events
  const clearFlash = useWarRoomStore((s) => s.clearFlash)
  const setRunStatus = useWarRoomStore((s) => s.setRunStatus)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // SIRI-UX-430: smart auto-scroll — only scrolls when user is near bottom
  // SIRI-UX-436: destructure only used values — isNearBottom/scrollToBottom are handled internally by the hook
  const { feedEndRef, containerRef, handleScroll } = useAutoScroll([messages.length])
  // SIRI-UX-175: store abort controller for handleStop so it can be cancelled on unmount
  const stopAbortRef = useRef<AbortController | null>(null)
  const navigate = useNavigate()
  const { id: companyId } = useParams<{ id?: string }>()
  const toast = useToast()
  const [stopping, setStopping] = useState(false)
  const [agentPanelOpen, setAgentPanelOpen] = useState(false)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()

  // SIRI-UX-376: guard undefined companyId — pass empty string to skip WS connection
  const { isConnected, error: wsError } = useWarRoomSocket(companyId ?? '')

  // SIRI-UX-431: set document title for accessibility + tab distinction
  useDocumentTitle('War Room — AgentCo')

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
  }, [isConnected, agents.length])

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
      // SIRI-UX-363: reset isConnecting to true so the connecting spinner shows for new company
      // Without this, switching companies skips the connecting state (stays false from previous company)
      setIsConnecting(true)
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
  // SIRI-UX-418: reset-on-reconnect effect removed.
  // Store reset is already handled by companyId effect (above) — resetting on every
  // WS reconnect caused users to lose accumulated messages/cost after a network hiccup.

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

    // SIRI-UX-413: use getState() inside interval — avoids stale closure on addMessage/updateAgentStatus
    intervalRef.current = setInterval(() => {
      const store = useWarRoomStore.getState()
      const event = getNextMockEvent(store.agents)
      store.addMessage(event.message)
      // SIRI-UX-212: no addCost here — cost only from real WS llm_token events
      if (event.statusUpdate) {
        store.updateAgentStatus(event.statusUpdate.agentId, event.statusUpdate.status)
      }
    }, 3000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [agents.length, isConnected])

  // SIRI-UX-016 + SIRI-UX-430: Auto-scroll handled by useAutoScroll hook
  // Only scrolls when user is near bottom — respects manual scroll position

  // SIRI-UX-149: prune expandedMessages Set when messages are evicted by the 300-cap
  // Prevents unbounded growth of stale message IDs in long sessions
  // SIRI-UX-357: moved early-return guard inside functional updater so it reads `prev.size`
  // (always fresh) instead of closing over `expandedMessages.size` from the outer scope
  // which can be stale when the Set is cleared between effect runs.
  useEffect(() => {
    const currentIds = new Set(messages.map((m) => m.id))
    setExpandedMessages((prev) => {
      // Guard inside updater — reads fresh `prev` not stale outer scope
      if (prev.size === 0) return prev
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
      // SIRI-UX-347: parse JSON properly — .catch(() => []) masked parse errors with misleading toast
      let runs: { id: string }[]
      try {
        runs = await runsRes.json()
      } catch {
        toast.error('Failed to parse runs response')
        return
      }
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

  // SIRI-UX-344: stable toggle handler — avoids creating N new closures per render inside messages.map()
  const handleToggleExpand = useCallback((msgId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }, [])

  // SIRI-UX-294: extracted from Stop button — was duplicated in `disabled` and `style.opacity`
  const isStopDisabled = stopping || runStatus === 'idle' || runStatus === 'done' || runStatus === 'failed' || runStatus === 'stopped'

  // SIRI-UX-376: guard — if companyId is undefined/null, show error state and skip WS connection
  if (!companyId) {
    return (
      <div
        data-testid="war-room-no-company"
        className="flex flex-col items-center justify-center h-full min-h-[360px] bg-[#0a0f1a] text-slate-200 gap-4"
      >
        <div className="text-xl font-bold text-red-400">Company not found</div>
        <div className="text-[0.9rem] text-slate-500">
          No company selected. Please navigate to a company first.
        </div>
        <Button
          variant="secondary"
          onClick={() => navigate('/')}
        >
          Go Home
        </Button>
      </div>
    )
  }

  // SIRI-UX-025: Connecting state — show spinner while waiting for first WS data
  if (agents.length === 0 && isConnecting) {
    return (
      // SIRI-UX-397: role="status" + aria-label so screen readers announce connecting state
      <div
        data-testid="war-room-connecting"
        role="status"
        aria-label="Connecting to War Room…"
        className="flex flex-col items-center justify-center h-full min-h-[360px] bg-[#0a0f1a] text-slate-200 gap-4"
      >
        {/* SIRI-UX-209: use CSS class instead of inline animation so prefers-reduced-motion can override */}
        <div
          aria-hidden="true"
          className="war-room-connecting-spinner w-9 h-9 rounded-full border-[3px] border-gray-700 border-t-blue-500"
        />
        <div className="text-[0.9rem] text-slate-500">Connecting…</div>
      </div>
    )
  }

  // Empty state
  if (agents.length === 0) {
    return (
      <div
        data-testid="war-room-page"
        className="flex flex-col items-center justify-center h-full min-h-[360px] bg-[#0a0f1a] text-slate-200 gap-6"
      >
        <Moon className="w-12 h-12 text-gray-400" />

        <div className="text-center">
          <div className="text-xl font-bold text-slate-100 mb-2">
            All quiet here
          </div>
          <div className="text-[0.9rem] text-slate-500 max-w-[280px]">
            No agents are running. Start a task to see the magic
          </div>
        </div>

        <Button
          data-testid="war-room-run-task-btn"
          variant="primary"
          onClick={() => companyId ? navigate(`/companies/${companyId}`) : navigate('/')}
        >
          ▶ Run a Task
        </Button>
      </div>
    )
  }



  return (
    <div
      data-testid="war-room-page"
      className="flex flex-col h-full min-h-[360px] bg-[#0a0f1a] text-slate-200"
    >
      {/* Top bar: cost + stop */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#0d1321]">

        <div className="flex items-center gap-4">
          {/* Mobile: agents toggle (SIRI-UX-017) */}
          {isMobile && (
            <button
              data-testid="mobile-agents-toggle"
              onClick={() => setAgentPanelOpen((v) => !v)}
              aria-label="Toggle agents panel"
              aria-expanded={agentPanelOpen}
              className="bg-transparent border border-white/15 rounded-md text-slate-400 cursor-pointer px-2 py-1 text-xs"
            >
              👥 {agents.length}
            </button>
          )}
          <h1 className="m-0 text-[1.1rem] font-bold text-slate-100">
            War Room
          </h1>
          <span
            data-testid="ws-status-indicator"
            title={isConnected ? 'Connected' : 'Disconnected'}
            aria-label={isConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
            role="img"
            className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-gray-500'}`}
          />
        </div>

        <div className="flex items-center gap-4">
          {/* SIRI-UX-353: aria-label describes the cost counter for screen readers —
              the dollar sign and raw number alone are not self-descriptive */}
          <span
            data-testid="cost-counter"
            aria-label={`Total run cost: $${cost.toFixed(4)}`}
            className="font-mono text-[0.9rem] text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-md"
          >
            ${cost.toFixed(4)}
          </span>

          <Button
            data-testid="stop-btn"
            variant="danger"
            onClick={handleStop}
            disabled={isStopDisabled}
            // SIRI-UX-458: aria-disabled mirrors disabled so AT users know why button is inactive
            aria-disabled={isStopDisabled}
            className={`px-5 py-2 text-[0.9rem] ${isStopDisabled ? 'opacity-40' : 'opacity-100'}`}
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
          className="flex items-center gap-2 px-5 py-2 bg-red-500/[0.12] border-b border-red-500/30 text-[0.8rem] text-red-400 font-semibold"
        >
          ⚠ {wsError}
        </div>
      )}

      {/* SIRI-UX-082: Run status banner — shown when run finishes/fails/stops */}
      {(runStatus === 'done' || runStatus === 'failed' || runStatus === 'stopped') && (
        <div
          data-testid="run-status-banner"
          role="alert"
          className={`flex items-center gap-2 px-5 py-2 text-[0.8rem] font-semibold border-b ${
            runStatus === 'done'
              ? 'bg-green-500/[0.12] border-green-500/30 text-green-400'
              : runStatus === 'failed'
                ? 'bg-red-500/[0.12] border-red-500/30 text-red-400'
                : 'bg-gray-500/[0.12] border-gray-500/30 text-gray-400'
          }`}
        >
          {runStatus === 'done' && '✓ Run completed'}
          {runStatus === 'failed' && '✗ Run failed'}
          {runStatus === 'stopped' && '⏹ Run stopped'}
        </div>
      )}

      {/* Main content: agent sidebar + activity feed */}
      <div className="flex flex-1 overflow-hidden relative">
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
            className="absolute inset-0 bg-black/50 z-[9]"
          />
        )}

        {/* Agent cards sidebar */}
        {/* SIRI-UX-340: role="region" + aria-labelledby so screen reader landmark navigation reaches agents panel */}
        <div
          data-testid="agent-panel"
          role="region"
          aria-labelledby="agents-panel-heading"
          // BUG-074: CSS class provides transition with prefers-reduced-motion support
          className={`w-[280px] border-r border-white/[0.08] px-3 py-4 overflow-y-auto bg-[#0d1321] ${isMobile ? `war-room-agent-panel absolute top-0 bottom-0 z-10 ${agentPanelOpen ? 'left-0 shadow-[4px_0_20px_rgba(0,0,0,0.5)]' : '-left-[290px] shadow-none'}` : ''}`}
        >
          <h2 id="agents-panel-heading" className="text-[0.8rem] font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Agents ({agents.length})
          </h2>
          <div className="flex flex-col gap-2">
            {sortedAgents.map((agent) => {
              const isFlashing = flashingAgents.has(agent.id)
              return (
                <div
                  key={agent.id}
                  data-testid={`agent-card-${agent.id}`}
                  data-flash={isFlashing ? 'true' : 'false'}
                  // SIRI-UX-200: role + aria-label for screen reader accessibility
                  role="article"
                  aria-label={`${agent.name} — ${statusLabel[agent.status]}`}
                  className={`rounded-[10px] px-3.5 py-3 transition-[background,border-color] duration-300 border war-room-agent-card ${isFlashing ? 'flash-green' : ''} ${
                    isFlashing
                      ? 'bg-green-500/25 border-green-500/50'
                      : agent.status === 'thinking' || agent.status === 'running'
                        ? 'bg-green-500/[0.06] border-white/[0.08]'
                        : 'bg-white/[0.03] border-white/[0.08]'
                  }`}
                  // SIRI-UX-462: use CSS variable + data-level instead of inline marginLeft
                  // Prevents inline style, keeps CSS cacheable, and enables theme overrides
                  data-level={agent.level}
                  style={{ '--agent-level': agent.level } as React.CSSProperties}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[1.4rem]">{agent.avatar}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[0.9rem] text-slate-100">
                        {agent.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-px">
                        {agent.role}
                      </div>
                    </div>
                    <span
                      data-testid="agent-status-dot"
                      role="img"
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDotStyle[agent.status]}`}
                      aria-label={statusLabel[agent.status]}
                      style={{ background: statusDotBg[agent.status] }}
                    />
                  </div>
                  <div
                    className={`mt-2 text-[0.7rem] font-medium flex items-center gap-1 ${agent.status === 'thinking' || agent.status === 'running' ? 'text-green-400' : 'text-slate-500'}`}
                  >
                    {statusLabel[agent.status]}
                    {(agent.status === 'thinking' || agent.status === 'running') && (
                      <span
                        data-testid="thinking-animation"
                        className="inline-flex gap-0.5 items-center"
                      >
                        {[0, 1, 2].map((i) => (
                          <span
                            key={`thinking-dot-${i}`}
                            className="war-room-thinking-dot w-[3px] h-[3px] rounded-full bg-green-400 inline-block"
                            style={{ animationDelay: `${i * 0.2}s` }}
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
        {/* SIRI-UX-340: role="region" + aria-label so screen reader landmark navigation reaches activity feed */}
        {/* SIRI-UX-414: use aria-label directly instead of aria-labelledby — the heading div also
            contains the LIVE badge, so the computed accessible name was "Activity Feed LIVE" when
            a run was active, which is confusing for screen readers. aria-label="Activity Feed" is stable. */}
        <div
          data-testid="activity-feed"
          role="region"
          aria-label="Activity Feed"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div
            id="activity-feed-heading"
            className="px-5 py-3 border-b border-white/[0.06] text-[0.8rem] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2"
          >
            Activity Feed
            {/* SIRI-UX-332: hide LIVE badge when run is in a terminal state (done/stopped/failed)
                SIRI-UX-337: also hide when runStatus === 'idle' (no run started yet) —
                showing LIVE on initial page load misleads users before any run begins. */}
            {runStatus !== 'idle' && runStatus !== 'done' && runStatus !== 'stopped' && runStatus !== 'failed' && (
              <span
                data-testid="live-indicator"
                className="inline-flex items-center gap-1 bg-green-500/10 border border-green-500/30 rounded-xl px-2 py-px text-[0.65rem] text-green-400 font-bold tracking-wide"
              >
                <span
                  className="war-room-live-dot w-1.5 h-1.5 rounded-full bg-green-400 inline-block"
                />
                LIVE
              </span>
            )}
          </div>
          {/* SIRI-UX-068: aria-live so screen readers announce new agent messages */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            aria-live="polite"
            aria-label="Agent activity feed"
            className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-1.5"
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
                  // SIRI-UX-344: use stable handleToggleExpand (useCallback) instead of inline closure
                  onClick={() => { if (isLong) handleToggleExpand(msg.id) }}
                  onKeyDown={(e) => {
                    if (!isLong) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleToggleExpand(msg.id)
                    }
                  }}
                  className={`bg-white/[0.03] rounded-lg px-3.5 py-2.5 border border-white/[0.05] ${isLong ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div data-testid={`feed-message-${msg.id}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[0.85rem] text-blue-400">
                        {msg.senderName}
                      </span>
                      <span className="text-slate-600 text-[0.8rem]">→</span>
                      <span className="font-semibold text-[0.85rem] text-violet-400">
                        {msg.targetName}
                      </span>
                      <span
                        data-testid="message-timestamp"
                        className="ml-auto text-[0.7rem] text-slate-600 font-mono"
                      >
                        {formatTimeHMS(msg.timestamp)}
                      </span>
                    </div>
                    <div
                      data-testid="message-content"
                      className="text-[0.85rem] text-slate-300 leading-snug"
                    >
                      {/* SIRI-UX-050: expand/collapse long messages on click */}
                      {isExpanded ? msg.content : truncate(msg.content, 120)}
                    </div>
                    {isLong && (
                      <div className="text-[0.7rem] text-slate-600 mt-1">
                        {isExpanded ? '▲ Show less' : '▼ Show more'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {/* SIRI-UX-325: differentiate empty feed message by runStatus to avoid misleading "waiting" after run ends */}
            {messages.length === 0 && (
              <div className="text-center text-slate-600 p-10 text-[0.9rem]">
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
