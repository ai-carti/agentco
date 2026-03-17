import { useEffect, useRef } from 'react'
import { useWarRoomStore, getNextMockEvent, type WarRoomAgentStatus } from '../store/warRoomStore'

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

  // Load mock data on mount
  useEffect(() => {
    loadMockData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mock WS: setInterval ~3 sec cycling agent statuses + adding messages
  useEffect(() => {
    if (agents.length === 0) return

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
  }, [agents.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear flash after animation
  useEffect(() => {
    if (flashingAgents.size === 0) return
    const timer = setTimeout(() => {
      flashingAgents.forEach((id) => clearFlash(id))
    }, 1000)
    return () => clearTimeout(timer)
  }, [flashingAgents, clearFlash])

  const handleStop = () => {
    console.log('stop clicked')
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
          height: 'calc(100vh - 49px)',
          background: '#0a0f1a',
          color: '#e2e8f0',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎯</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
          No active runs
        </div>
        <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
          Start a task to see the magic
        </div>
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
        height: 'calc(100vh - 49px)',
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
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>
            War Room
          </h1>
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

          <button
            data-testid="stop-btn"
            onClick={handleStop}
            style={{
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Stop
          </button>
        </div>
      </div>

      {/* Main content: agent sidebar + activity feed */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Agent cards sidebar */}
        <div
          data-testid="agent-panel"
          style={{
            width: 280,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            padding: '16px 12px',
            overflowY: 'auto',
            background: '#0d1321',
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
                    }}
                  >
                    {statusLabel[agent.status]}
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
            }}
          >
            Activity Feed
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                data-testid="feed-message"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  border: '1px solid rgba(255,255,255,0.05)',
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
                    {truncate(msg.content, 120)}
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: '0.9rem' }}>
                Waiting for agent activity...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
