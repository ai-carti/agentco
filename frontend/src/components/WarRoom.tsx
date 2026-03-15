import { useAgentStore } from '../store/agentStore'

const statusColor: Record<string, string> = {
  idle: '#6b7280',
  running: '#f59e0b',
  done: '#10b981',
  error: '#ef4444',
}

export default function WarRoom() {
  const agents = useAgentStore((s) => s.agents)

  return (
    <div data-testid="war-room" style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '1rem' }}>
        War Room
      </h1>

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
