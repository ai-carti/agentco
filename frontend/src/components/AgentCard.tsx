import { Link } from 'react-router-dom'
import { type Agent } from '../store/agentStore'
import Button from './Button'

const AVATAR_COLORS = [
  '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#9333ea', '#c2410c', '#0d9488',
]

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return Math.abs(h)
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[hashCode(name) % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_COLORS: Record<string, string> = {
  idle:    '#6b7280',
  running: '#22c55e',
  done:    '#3b82f6',
  error:   '#ef4444',
}

interface AgentCardProps {
  agent: Agent
  companyId: string
  onEdit: (agent: Agent) => void
}

export default function AgentCard({ agent, companyId, onEdit }: AgentCardProps) {
  const avatarColor = getAvatarColor(agent.name)
  const initials = getInitials(agent.name)
  const isRunning = agent.status === 'running'
  const statusColor = STATUS_COLORS[agent.status] ?? STATUS_COLORS.idle

  return (
    <div
      data-testid={`agent-card-${agent.id}`}
      style={{
        background: '#1f2937',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '1rem',
        position: 'relative',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
    >
      {/* Avatar + name + status dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div
          data-testid="agent-avatar"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            backgroundColor: avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {agent.name}
            <span
              data-testid="status-dot"
              className={isRunning ? 'animate-pulse' : ''}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: statusColor,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          </div>
          {agent.role && (
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.role}
            </div>
          )}
        </div>
      </div>

      {/* Model badge */}
      {agent.model && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span
            data-testid="model-badge"
            style={{
              display: 'inline-block',
              fontSize: '0.625rem',
              padding: '0.15rem 0.45rem',
              borderRadius: 4,
              background: 'rgba(109,40,217,0.3)',
              color: '#c4b5fd',
              border: '1px solid #6d28d9',
              fontWeight: 600,
              letterSpacing: '0.03em',
            }}
          >
            {agent.model}
          </span>
        </div>
      )}

      {/* Last task time */}
      <div
        data-testid="last-task-time"
        style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}
      >
        {agent.last_task_at ? `Last task: ${relativeTime(agent.last_task_at)}` : 'No tasks yet'}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          data-testid="agent-edit-btn"
          variant="secondary"
          onClick={() => onEdit(agent)}
          style={{ flex: 1, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
        >
          Edit
        </Button>
        <Link
          data-testid="agent-history-btn"
          to={`/companies/${companyId}/agents/${agent.id}`}
          style={{
            flex: 1,
            textDecoration: 'none',
            display: 'flex',
          }}
        >
          <Button
            variant="secondary"
            style={{ flex: 1, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
          >
            View Agent
          </Button>
        </Link>
      </div>
    </div>
  )
}
