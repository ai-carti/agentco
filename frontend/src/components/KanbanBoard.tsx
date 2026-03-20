import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useAgentStore, type Task, type TaskStatus, type TaskPriority } from '../store/agentStore'
import { getStoredToken } from '../api/client'
import TaskDetailSidebar from './TaskDetailSidebar'
import Button from './Button'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import { ClipboardList } from 'lucide-react'
// SIRI-UX-049: import shared utilities to eliminate duplication
import { STATUS_COLORS, getAvatarColor, getInitials as _getInitials } from '../utils/taskUtils'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: '#7f1d1d', text: '#fca5a5', label: 'High' },
  medium: { bg: '#78350f', text: '#fcd34d', label: 'Medium' },
  low:    { bg: '#1f2937', text: '#9ca3af', label: 'Low' },
}

// SIRI-UX-049: getInitials imported from taskUtils (alias to avoid breaking existing usages)
const getInitials = _getInitials

function formatDueDate(dateStr: string): { label: string; overdue: boolean } {
  const due = new Date(dateStr)
  const now = new Date()
  const overdue = due < now
  const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { label, overdue }
}

interface TaskCardProps {
  task: Task
  companyId: string
  onCardClick: (task: Task) => void
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  onDragEnd?: () => void
  isGrabbed?: boolean
}

function TaskCard({ task, companyId, onCardClick, onDragStart, onDragEnd, isGrabbed = false }: TaskCardProps) {
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDesc, setEditDesc] = useState(task.description ?? '')
  const toast = useToast()
  const agents = useAgentStore((s) => s.agents)
  const setTasks = useAgentStore((s) => s.setTasks)
  const tasks = useAgentStore((s) => s.tasks)

  const canRun = task.status === 'todo' || task.status === 'backlog'

  // BUG-050 / SIRI-UX-062 / SIRI-UX-070: close menu + modals on Escape key
  useEffect(() => {
    if (!menuOpen && !editOpen && !deleteOpen && !assignOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setEditOpen(false)
        setDeleteOpen(false)
        setAssignOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen, editOpen, deleteOpen, assignOpen])

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRunning(true)
    setRunError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        const msg = `Failed to run task (${res.status})`
        console.error(msg)
        setRunError(msg)
        toast.error(msg)
      } else {
        // SIRI-UX-047: update local status so Run button hides, preventing double-run
        setTasks(useAgentStore.getState().tasks.map((t) =>
          t.id === task.id ? { ...t, status: 'in_progress' as const } : t
        ))
        toast.success(`▶ Running: ${task.title}`)
      }
    } catch (err) {
      const msg = 'Network error — could not run task'
      console.error(msg, err)
      setRunError(msg)
      toast.error(msg)
    } finally {
      setRunning(false)
    }
  }

  const handleEdit = async () => {
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: editTitle, description: editDesc }),
      })
      if (res.ok) {
        setTasks(tasks.map((t) => t.id === task.id ? { ...t, title: editTitle, description: editDesc } : t))
        toast.success(`Task updated`)
        setEditOpen(false)
      } else {
        toast.error('Something went wrong. Try again.')
      }
    } catch {
      toast.error('Something went wrong. Try again.')
    }
  }

  const handleDelete = async () => {
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        setTasks(tasks.filter((t) => t.id !== task.id))
        toast.success(`Task "${task.title}" deleted`)
        setDeleteOpen(false)
      } else {
        toast.error('Something went wrong. Try again.')
      }
    } catch {
      toast.error('Something went wrong. Try again.')
    }
  }

  const handleAssign = async (agentId: string, agentName: string) => {
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ assignee_id: agentId }),
      })
      if (res.ok) {
        setTasks(tasks.map((t) => t.id === task.id ? { ...t, assignee_id: agentId, assignee_name: agentName } : t))
        toast.success(`Task assigned to ${agentName}`)
        setAssignOpen(false)
      } else {
        toast.error('Something went wrong. Try again.')
      }
    } catch {
      toast.error('Something went wrong. Try again.')
    }
  }

  const handleMenuAction = (action: string) => {
    setMenuOpen(false)
    if (action === 'Edit') {
      setEditTitle(task.title)
      setEditDesc(task.description ?? '')
      setEditOpen(true)
    } else if (action === 'Delete') {
      setDeleteOpen(true)
    } else if (action === 'Assign') {
      setAssignOpen(true)
    }
  }

  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.todo
  const assigneeName = task.assignee_name ?? 'Unassigned'
  const initials = getInitials(assigneeName)
  const avatarColor = task.assignee_name ? getAvatarColor(task.assignee_name) : '#4b5563'
  const priorityStyle = task.priority ? PRIORITY_COLORS[task.priority] : null
  const dueDateInfo = task.due_date ? formatDueDate(task.due_date) : null

  return (
    <div
      data-testid={`task-card-${task.id}`}
      draggable
      aria-grabbed={isGrabbed}
      onDragStart={(e) => onDragStart?.(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick(task)}
      style={{
        background: '#1f2937',
        borderRadius: 8,
        padding: '0.75rem',
        cursor: 'pointer',
        border: '1px solid #374151',
        position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#6b7280'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)'
        e.currentTarget.style.transform = 'scale(1.01)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#374151'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {/* Header: title + menu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4, flex: 1, marginRight: '0.5rem' }}>
          {task.title}
        </div>
        <button
          data-testid={`task-menu-${task.id}`}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          aria-label="Task options"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          style={{
            background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer',
            fontSize: '1rem', padding: '0 0.15rem', lineHeight: 1, flexShrink: 0,
          }}
          title="Task options"
        >
          ···
        </button>
        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute', background: '#1f2937', border: '1px solid #374151',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              padding: '0.25rem 0', zIndex: 10, minWidth: 120, right: 0, top: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {['Edit', 'Delete', 'Assign'].map((item) => (
              <button
                key={item}
                role="menuitem"
                style={{
                  display: 'block', width: '100%', padding: '0.4rem 0.75rem',
                  cursor: 'pointer', fontSize: '0.8rem', background: 'transparent',
                  border: 'none', color: '#e5e7eb', textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#374151')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => handleMenuAction(item)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleMenuAction(item) }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Description preview */}
      {task.description && (
        <div
          data-testid={`task-desc-preview-${task.id}`}
          style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            marginBottom: '0.5rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.description}
        </div>
      )}

      {/* Priority + due date row */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        {priorityStyle && (
          <span
            data-testid={`priority-badge-${task.id}`}
            style={{
              fontSize: '0.6rem',
              fontWeight: 700,
              padding: '0.1rem 0.4rem',
              borderRadius: 4,
              background: priorityStyle.bg,
              color: priorityStyle.text,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {priorityStyle.label}
          </span>
        )}
        {dueDateInfo && (
          <span
            data-testid={`due-date-${task.id}`}
            style={{
              fontSize: '0.65rem',
              color: dueDateInfo.overdue ? '#f87171' : '#9ca3af',
            }}
          >
            📅 {dueDateInfo.label}
          </span>
        )}
      </div>

      {/* Assignee + status badge row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: canRun ? '0.5rem' : 0 }}>
        <div
          data-testid={`assignee-avatar-${task.id}`}
          style={{
            width: 24, height: 24, borderRadius: '50%', background: avatarColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 700, color: '#fff', flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', flex: 1 }}>{assigneeName}</span>
        <span
          data-testid={`status-badge-${task.id}`}
          style={{
            fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 4,
            background: statusColor.bg, color: statusColor.text,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {task.status.replace('_', ' ')}
        </span>
      </div>

      {/* Run button — only for todo/backlog */}
      {canRun && (
        <Button
          data-testid={`run-btn-${task.id}`}
          variant="primary"
          onClick={handleRun}
          disabled={running}
          style={{
            width: '100%', padding: '0.3rem 0.5rem',
            fontSize: '0.75rem',
            gap: '0.25rem',
          }}
        >
          {running ? '⏳' : '▶'} {running ? 'Running…' : 'Run'}
        </Button>
      )}

      {runError && (
        <p
          data-testid={`run-error-${task.id}`}
          style={{ fontSize: '0.7rem', color: '#f87171', margin: '0.3rem 0 0' }}
        >
          ⚠ {runError}
        </p>
      )}

      {/* Edit modal */}
      {editOpen && (
        <div
          data-testid="edit-task-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Edit Task"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false) }}
        >
          <div style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 360,
            border: '1px solid #374151',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Edit Task</h2>
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
              placeholder="Task title"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '0.75rem',
                outline: 'none',
              }}
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
              placeholder="Description"
              rows={3}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button
                variant="secondary"
                onClick={() => setEditOpen(false)}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleEdit}
                disabled={!editTitle.trim()}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteOpen && (
        <div
          data-testid="confirm-delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Delete Task"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false) }}
        >
          <div style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 360,
            border: '1px solid #374151',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>Delete Task</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              Are you sure you want to delete "{task.title}"? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                data-testid="cancel-delete-btn"
                variant="secondary"
                onClick={() => setDeleteOpen(false)}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                Cancel
              </Button>
              <Button
                data-testid="confirm-delete-btn"
                variant="danger"
                onClick={handleDelete}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign dropdown */}
      {assignOpen && (
        <div
          data-testid="assign-dropdown"
          role="dialog"
          aria-modal="true"
          aria-label="Assign to Agent"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setAssignOpen(false) }}
        >
          <div style={{
            background: '#1f2937', borderRadius: 10, padding: '1rem', width: 280,
            border: '1px solid #374151',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '0.9rem' }}>Assign to Agent</h3>
            {agents.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No agents available</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    data-testid={`assign-agent-${agent.id}`}
                    onClick={() => handleAssign(agent.id, agent.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 0.75rem', background: 'transparent',
                      border: 'none', borderRadius: 6, color: '#f8fafc',
                      cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#374151')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: getAvatarColor(agent.name),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.6rem', fontWeight: 700, color: '#fff',
                    }}>
                      {getInitials(agent.name)}
                    </div>
                    {agent.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low']

interface FilterBarProps {
  searchQuery: string
  onSearchChange: (v: string) => void
  selectedAgents: string[]
  onToggleAgent: (id: string) => void
  selectedPriorities: TaskPriority[]
  onTogglePriority: (p: TaskPriority) => void
  onClearAll: () => void
  onRemoveAgent: (id: string) => void
  onRemovePriority: (p: TaskPriority) => void
  hasActiveFilters: boolean
}

function FilterBar({
  searchQuery, onSearchChange,
  selectedAgents, onToggleAgent,
  selectedPriorities, onTogglePriority,
  onClearAll, onRemoveAgent, onRemovePriority,
  hasActiveFilters,
}: FilterBarProps) {
  const agents = useAgentStore((s) => s.agents)
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false)
  const filterBarRef = useRef<HTMLDivElement>(null)

  // SIRI-UX-023: close dropdowns on mousedown outside FilterBar
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setAgentDropdownOpen(false)
        setPriorityDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  return (
    <div ref={filterBarRef} style={{ padding: '0.75rem 1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          data-testid="kanban-search-input"
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            padding: '0.4rem 0.75rem', background: '#111827', border: '1px solid #374151',
            borderRadius: 6, color: '#f8fafc', fontSize: '0.8rem', minWidth: 180,
          }}
        />

        {/* Agent dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            data-testid="filter-agent-btn"
            onClick={() => { setAgentDropdownOpen((v) => !v); setPriorityDropdownOpen(false) }}
            style={{
              padding: '0.4rem 0.75rem', background: selectedAgents.length > 0 ? '#1e3a5f' : '#1f2937',
              border: '1px solid #374151', borderRadius: 6, color: '#e5e7eb',
              fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            Agent {selectedAgents.length > 0 && `(${selectedAgents.length})`}
          </button>
          {agentDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1f2937',
              border: '1px solid #374151', borderRadius: 6, zIndex: 20, minWidth: 160,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  data-testid={`filter-agent-option-${agent.id}`}
                  role="menuitem"
                  aria-checked={selectedAgents.includes(agent.id)}
                  onClick={() => onToggleAgent(agent.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleAgent(agent.id) } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem',
                    background: selectedAgents.includes(agent.id) ? '#374151' : 'transparent',
                    border: 'none', width: '100%', textAlign: 'left', color: '#e5e7eb',
                  }}
                >
                  <span style={{ width: 14, height: 14, border: '1px solid #6b7280', borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>
                    {selectedAgents.includes(agent.id) ? '✓' : ''}
                  </span>
                  {agent.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            data-testid="filter-priority-btn"
            onClick={() => { setPriorityDropdownOpen((v) => !v); setAgentDropdownOpen(false) }}
            style={{
              padding: '0.4rem 0.75rem', background: selectedPriorities.length > 0 ? '#1e3a5f' : '#1f2937',
              border: '1px solid #374151', borderRadius: 6, color: '#e5e7eb',
              fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            Priority {selectedPriorities.length > 0 && `(${selectedPriorities.length})`}
          </button>
          {priorityDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1f2937',
              border: '1px solid #374151', borderRadius: 6, zIndex: 20, minWidth: 140,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  data-testid={`filter-priority-option-${p}`}
                  role="menuitem"
                  aria-checked={selectedPriorities.includes(p)}
                  onClick={() => onTogglePriority(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTogglePriority(p) } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem',
                    background: selectedPriorities.includes(p) ? '#374151' : 'transparent',
                    textTransform: 'capitalize', border: 'none', width: '100%', textAlign: 'left', color: '#e5e7eb',
                  }}
                >
                  <span style={{ width: 14, height: 14, border: '1px solid #6b7280', borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>
                    {selectedPriorities.includes(p) ? '✓' : ''}
                  </span>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button
            data-testid="filter-clear-all"
            onClick={onClearAll}
            style={{
              padding: '0.4rem 0.75rem', background: 'transparent', border: '1px solid #374151',
              borderRadius: 6, color: '#9ca3af', fontSize: '0.75rem', cursor: 'pointer',
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {selectedAgents.map((agentId) => {
            const agent = agents.find((a) => a.id === agentId)
            return (
              <span
                key={agentId}
                data-testid={`filter-badge-agent-${agentId}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  padding: '0.15rem 0.5rem', background: '#1e3a5f', borderRadius: 12,
                  fontSize: '0.7rem', color: '#93c5fd',
                }}
              >
                {agent?.name ?? agentId}
                <button
                  data-testid={`filter-badge-remove-agent-${agentId}`}
                  onClick={() => onRemoveAgent(agentId)}
                  style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0, fontSize: '0.75rem', lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            )
          })}
          {selectedPriorities.map((p) => (
            <span
              key={p}
              data-testid={`filter-badge-priority-${p}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.15rem 0.5rem', background: '#78350f', borderRadius: 12,
                fontSize: '0.7rem', color: '#fcd34d', textTransform: 'capitalize',
              }}
            >
              {p}
              <button
                data-testid={`filter-badge-remove-priority-${p}`}
                onClick={() => onRemovePriority(p)}
                style={{ background: 'none', border: 'none', color: '#fcd34d', cursor: 'pointer', padding: 0, fontSize: '0.75rem', lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface KanbanBoardProps {
  companyId: string
  isLoaded?: boolean
  /** Whether there are more tasks to load (server-side pagination) */
  hasMore?: boolean
  /** Callback to load the next page of tasks */
  onLoadMore?: () => void
}

export default function KanbanBoard({ companyId, isLoaded = true, hasMore = false, onLoadMore }: KanbanBoardProps) {
  const tasks = useAgentStore((s) => s.tasks)
  const setTasks = useAgentStore((s) => s.setTasks)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [grabbedTaskId, setGrabbedTaskId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority | ''>('')
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return
    setCreating(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          description: newTaskDesc.trim(),
          status: 'todo',
          ...(newTaskPriority ? { priority: newTaskPriority } : {}),
        }),
      })
      if (res.ok) {
        const newTask = await res.json()
        setTasks([...useAgentStore.getState().tasks, newTask])
        toast.success(`Task "${newTaskTitle.trim()}" created`)
        setNewTaskTitle('')
        setNewTaskDesc('')
        setNewTaskPriority('')
        setShowCreateModal(false)
      } else {
        toast.error('Failed to create task. Try again.')
      }
    } catch {
      toast.error('Failed to create task. Try again.')
    } finally {
      setCreating(false)
    }
  }

  // Filter state
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedPriorities, setSelectedPriorities] = useState<TaskPriority[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 150)
  }, [])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const toggleAgent = useCallback((id: string) => {
    setSelectedAgents((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id])
  }, [])

  const togglePriority = useCallback((p: TaskPriority) => {
    setSelectedPriorities((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }, [])

  const clearAllFilters = useCallback(() => {
    setSearchInput('')
    setDebouncedSearch('')
    setSelectedAgents([])
    setSelectedPriorities([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const hasActiveFilters = debouncedSearch.length > 0 || selectedAgents.length > 0 || selectedPriorities.length > 0

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (debouncedSearch && !t.title.toLowerCase().includes(debouncedSearch.toLowerCase())) return false
      if (selectedAgents.length > 0 && !selectedAgents.includes(t.assignee_id ?? '')) return false
      if (selectedPriorities.length > 0 && !selectedPriorities.includes(t.priority as TaskPriority)) return false
      return true
    })
  }, [tasks, debouncedSearch, selectedAgents, selectedPriorities])

  const handleClose = useCallback(() => setSelectedTask(null), [])

  // SIRI-UX-061: close Create modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
    setGrabbedTaskId(taskId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setGrabbedTaskId(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault()
    setDragOverCol(colId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null)
  }, [])

  const persistTaskOrder = useCallback((updatedTasks: Task[]) => {
    try {
      const order = updatedTasks.map((t) => t.id)
      localStorage.setItem(`kanban-task-order-${companyId}`, JSON.stringify(order))
    } catch {
      // localStorage may be unavailable in some envs — silently ignore
    }
  }, [companyId])

  const handleDrop = useCallback(async (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    setGrabbedTaskId(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId) return

    const currentTasks = useAgentStore.getState().tasks
    const task = currentTasks.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return

    const oldStatus = task.status

    // Optimistic update
    const optimisticTasks = currentTasks.map((t) => t.id === taskId ? { ...t, status: newStatus } : t)
    setTasks(optimisticTasks)

    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        // Rollback
        const rollbackTasks = useAgentStore.getState().tasks
        setTasks(rollbackTasks.map((t) => t.id === taskId ? { ...t, status: oldStatus } : t))
        toast.error('Failed to move task')
      } else {
        // Persist order to localStorage on success
        persistTaskOrder(optimisticTasks)
      }
    } catch {
      // Rollback
      const rollbackTasks = useAgentStore.getState().tasks
      setTasks(rollbackTasks.map((t) => t.id === taskId ? { ...t, status: oldStatus } : t))
      toast.error('Failed to move task')
    }
  }, [companyId, setTasks, toast, persistTaskOrder])

  const showEmpty = isLoaded && tasks.length === 0
  const showFilterEmpty = isLoaded && tasks.length > 0 && filteredTasks.length === 0 && hasActiveFilters

  return (
    <>
      {/* Always-visible header with New Task button when loaded and tasks exist */}
      {isLoaded && !showEmpty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.5rem 1rem 0' }}>
          <button
            data-testid="kanban-new-task-btn"
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '0.35rem 0.85rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1d4ed8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#2563eb')}
          >
            + New Task
          </button>
        </div>
      )}
      {showEmpty && (
        <EmptyState
          icon={<ClipboardList className="w-12 h-12 text-gray-400" />}
          title="No tasks yet"
          subtitle="Create your first task and assign it to an agent"
          ctaLabel="+ New Task"
          onCTA={() => setShowCreateModal(true)}
          ctaTestId="kanban-new-task-btn"
        />
      )}
      {!showEmpty && isLoaded && (
        <FilterBar
          searchQuery={searchInput}
          onSearchChange={handleSearchChange}
          selectedAgents={selectedAgents}
          onToggleAgent={toggleAgent}
          selectedPriorities={selectedPriorities}
          onTogglePriority={togglePriority}
          onClearAll={clearAllFilters}
          onRemoveAgent={(id) => setSelectedAgents((prev) => prev.filter((a) => a !== id))}
          onRemovePriority={(p) => setSelectedPriorities((prev) => prev.filter((x) => x !== p))}
          hasActiveFilters={hasActiveFilters}
        />
      )}
      {showFilterEmpty && (
        <div data-testid="filter-empty-state" style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.875rem' }}>
          No tasks match filters
        </div>
      )}
      <div
        data-testid="kanban-board"
        style={{ display: (showEmpty || showFilterEmpty) ? 'none' : 'flex', gap: '1rem', padding: '1rem' }}
      >
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            data-testid={`kanban-column-${col.id}`}
            aria-dropeffect="move"
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.id)}
            style={{
              flex: 1,
              background: '#111827',
              borderRadius: 8,
              padding: '0.75rem',
              minWidth: 0,
              border: dragOverCol === col.id ? '2px solid #3b82f6' : '2px solid transparent',
              transition: 'border-color 0.15s',
            }}
          >
            <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: '#e5e7eb' }}>
              {col.label}
              {isLoaded && (
                <span style={{ marginLeft: '0.4rem', color: '#6b7280', fontWeight: 400 }}>
                  ({filteredTasks.filter((t) => t.status === col.id).length})
                </span>
              )}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {!isLoaded ? (
                <SkeletonCard variant="task" count={3} />
              ) : (
                filteredTasks
                  .filter((t) => t.status === col.id)
                  .map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      companyId={companyId}
                      onCardClick={setSelectedTask}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isGrabbed={grabbedTaskId === task.id}
                    />
                  ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* FE-005: Load More button for server-side pagination */}
      {isLoaded && hasMore && onLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 1rem 1rem' }}>
          <button
            data-testid="kanban-load-more-btn"
            onClick={onLoadMore}
            style={{
              padding: '0.45rem 1.5rem',
              background: '#1f2937',
              color: '#e5e7eb',
              border: '1px solid #374151',
              borderRadius: 6,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#374151')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#1f2937')}
          >
            Load more tasks
          </button>
        </div>
      )}

      {selectedTask && (
        <TaskDetailSidebar task={selectedTask} companyId={companyId} onClose={handleClose} />
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div
          data-testid="create-task-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Create Task"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false) }}
        >
          <div style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 380,
            border: '1px solid #374151',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem', fontWeight: 700 }}>New Task</h2>
            <input
              autoFocus
              data-testid="create-task-title-input"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
              placeholder="Task title"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '0.75rem',
                outline: 'none',
              }}
            />
            <textarea
              data-testid="create-task-desc-input"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
              placeholder="Description (optional)"
              rows={3}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical',
                outline: 'none', marginBottom: '0.75rem',
              }}
            />
            {/* SIRI-UX-048: Priority selector */}
            <select
              data-testid="create-task-priority-select"
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority | '')}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: newTaskPriority ? '#f8fafc' : '#6b7280',
                fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none',
              }}
            >
              <option value="">Priority (optional)</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ padding: '0.4rem 0.9rem', background: '#374151', color: '#f8fafc', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                data-testid="create-task-submit-btn"
                onClick={handleCreateTask}
                disabled={creating || !newTaskTitle.trim()}
                style={{ padding: '0.4rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
