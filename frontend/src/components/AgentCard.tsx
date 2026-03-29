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
      // SIRI-UX-445: migrated inline styles → Tailwind classes
      className="agent-card bg-gray-800 border border-white/10 rounded-[10px] p-4 relative transition-[border-color] duration-150"
      // SIRI-UX-265: keyboard focus highlight handled by CSS .agent-card:focus (replaces JS onFocus/onBlur)
    >
      {/* Avatar + name + status dot */}
      <div className="flex items-center gap-3 mb-2">
        <div
          data-testid="agent-avatar"
          className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[0.9rem] flex items-center gap-[0.4rem]">
            {agent.name}
            <span
              data-testid="status-dot"
              role="img"
              aria-label={`Status: ${agent.status}`}
              className={`w-2 h-2 rounded-full inline-block shrink-0 ${isRunning ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: statusColor }}
            />
          </div>
          {agent.role && (
            <div className="text-xs text-gray-400 mt-px overflow-hidden text-ellipsis whitespace-nowrap">
              {agent.role}
            </div>
          )}
        </div>
      </div>

      {/* Model badge */}
      {agent.model && (
        <div className="mb-2">
          <span
            data-testid="model-badge"
            className="inline-block text-[0.625rem] px-[0.45rem] py-[0.15rem] rounded border border-violet-700 font-semibold tracking-wide bg-violet-800/30 text-violet-300"
          >
            {agent.model}
          </span>
        </div>
      )}

      {/* Last task time */}
      <div
        data-testid="last-task-time"
        className="text-xs text-gray-500 mb-3"
      >
        {agent.last_task_at ? `Last task: ${relativeTime(agent.last_task_at)}` : 'No tasks yet'}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
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
          className="flex-1 no-underline flex"
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
