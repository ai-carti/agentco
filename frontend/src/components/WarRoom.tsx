import { useAgentStore } from '../store/agentStore'
import { useAuthStore } from '../store/authStore'

const statusColor: Record<string, string> = {
  idle: '#6b7280',
  running: '#f59e0b',
  done: '#10b981',
  error: '#ef4444',
}

export default function WarRoom() {
  const agents = useAgentStore((s) => s.agents)
  const { user, logout } = useAuthStore()

  return (
    <div data-testid="war-room" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          War Room
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user && (
            <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              {user.email}
            </span>
          )}
          <button
            onClick={logout}
            style={{
              padding: '0.35rem 0.9rem',
              background: 'transparent',
              border: '1px solid #374151',
              borderRadius: 6,
              color: '#9ca3af',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {agents.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>No agents active</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {agents.map((agent) => (
            <li
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid #1f2937',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: statusColor[agent.status] ?? '#6b7280',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 500 }}>{agent.name}</span>
              {agent.currentTask && (
                <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  → {agent.currentTask}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
