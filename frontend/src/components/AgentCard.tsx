import React from 'react'
import { Link } from 'react-router-dom'
import { type Agent } from '../store/agentStore'
import Button from './Button'
// SIRI-UX-106: use shared utilities from taskUtils instead of duplicating locally
// SIRI-UX-196: use shared relativeTime from taskUtils (eliminates local duplicate)
// SIRI-UX-239: use AGENT_STATUS_DOT_COLORS from taskUtils (eliminates local STATUS_COLORS naming collision)
import { getAvatarColor, getInitials, relativeTime, AGENT_STATUS_DOT_COLORS } from '../utils/taskUtils'

interface AgentCardProps {
  agent: Agent
  companyId: string
  onEdit: (agent: Agent) => void
}

// SIRI-UX-439: wrap AgentCard in React.memo — rendered N times in agents grid via .map(),
// without memo all cards re-render when any CompanyPage state changes (same fix as SIRI-UX-435 for TaskCard)
const AgentCard = React.memo(function AgentCard({ agent, companyId, onEdit }: AgentCardProps) {
  const avatarColor = getAvatarColor(agent.name)
  const initials = getInitials(agent.name)
  const isRunning = agent.status === 'running'
  const statusColor = AGENT_STATUS_DOT_COLORS[agent.status] ?? AGENT_STATUS_DOT_COLORS.idle

  return (
    <div
      data-testid={`agent-card-${agent.id}`}
      // SIRI-UX-256: use CSS class for hover (replaces JS onMouseEnter/onMouseLeave)
      className="agent-card"
      style={{
        background: '#1f2937',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: '1rem',
        position: 'relative',
        transition: 'border-color 0.15s',
      }}
      // SIRI-UX-265: keyboard focus highlight handled by CSS .agent-card:focus (replaces JS onFocus/onBlur)
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
              role="img"
              aria-label={`Status: ${agent.status}`}
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
          // SIRI-UX-334: agent-specific aria-label — screen reader announces "Edit CEO" not just "Edit"
          aria-label={`Edit ${agent.name}`}
          style={{ flex: 1, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
        >
          Edit
        </Button>
        <Link
          data-testid="agent-history-btn"
          to={`/companies/${companyId}/agents/${agent.id}`}
          // SIRI-UX-334: agent-specific aria-label — screen reader announces "View CEO" not just "View Agent"
          aria-label={`View ${agent.name}`}
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
})

export default AgentCard
