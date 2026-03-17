import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWarRoomStore, type WarRoomAgentStatus } from '../store/warRoomStore'
import { useRunWebSocket } from '../hooks/useRunWebSocket'
import { getStoredToken } from '../api/client'

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

export default function WarRoomPage() {
  const { id: companyId, runId } = useParams<{ id: string; runId: string }>()
  const agents = useWarRoomStore((s) => s.agents)
  const messages = useWarRoomStore((s) => s.messages)
  const cost = useWarRoomStore((s) => s.cost)
  const runStatus = useWarRoomStore((s) => s.runStatus)
  const loadMockData = useWarRoomStore((s) => s.loadMockData)
  const setRunStatus = useWarRoomStore((s) => s.setRunStatus)

  // Connect WebSocket
  useRunWebSocket(runId)

  // Load mock data on mount if no agents
  useEffect(() => {
    if (agents.length === 0) {
      loadMockData()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = async () => {
    if (!companyId || !runId) return
    const token = getStoredToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      await fetch(`${BASE_URL}/api/companies/${companyId}/runs/${runId}/stop`, {
        method: 'POST',
        headers,
      })
      setRunStatus('stopped')
    } catch {
      // silently fail
    }
  }

  const isActive = runStatus === 'active'

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
            ⚡ War Room
          </h1>
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
            ${cost.toFixed(4)} spent
          </span>
        </div>

        <button
          data-testid="stop-run-btn"
          onClick={handleStop}
          disabled={!isActive}
          style={{
            background: isActive ? '#dc2626' : '#4b5563',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 20px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: isActive ? 'pointer' : 'not-allowed',
            opacity: isActive ? 1 : 0.6,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ⏹ Stop Run
        </button>
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
            {agents.map((agent) => (
              <div
                key={agent.id}
                data-testid={`agent-card-${agent.id}`}
                style={{
                  background: agent.status === 'thinking' || agent.status === 'running'
                    ? 'rgba(34,197,94,0.06)'
                    : 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  padding: '12px 14px',
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
            ))}
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
                {...{ 'data-testid-msg': msg.id }}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {/* Use a unique testid wrapper for long-message tests */}
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
