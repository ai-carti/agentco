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
// SIRI-UX-172: PRIORITY_COLORS now imported from taskUtils (was duplicated)
// SIRI-UX-268: formatDueDate moved to taskUtils to enable reuse
import { STATUS_COLORS, PRIORITY_COLORS, getAvatarColor, getInitials as _getInitials, formatDueDate } from '../utils/taskUtils'
// SIRI-POST-006: focus trap hook for modals
import { useFocusTrap } from '../hooks/useFocusTrap'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

// SIRI-UX-049: getInitials imported from taskUtils (alias to avoid breaking existing usages)
const getInitials = _getInitials

interface TaskCardProps {
  task: Task
  companyId: string
  onCardClick: (task: Task) => void
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  onDragEnd?: () => void
  isGrabbed?: boolean
}

function TaskCard({ task, companyId, onCardClick, onDragStart, onDragEnd, isGrabbed }: TaskCardProps) {
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDesc, setEditDesc] = useState(task.description ?? '')
  // SIRI-UX-171: loading states for mutations to prevent duplicate requests
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const toast = useToast()
  const agents = useAgentStore((s) => s.agents)
  const setTasks = useAgentStore((s) => s.setTasks)
  // SIRI-UX-225: tasks removed from destructure in TaskCard — all mutations now use getState().tasks
  // to avoid stale closure overwriting concurrent store updates (like handleRun already does)
  // tasks still used for reading in render — keep subscription to trigger re-renders
  // SIRI-UX-225: subscribe to tasks for re-renders; mutations use getState().tasks to avoid stale closure
  useAgentStore((s) => s.tasks)
  // SIRI-POST-006: focus trap refs for each modal
  const editTrapRef = useFocusTrap(editOpen)
  const deleteTrapRef = useFocusTrap(deleteOpen)
  const assignTrapRef = useFocusTrap(assignOpen)
  // SIRI-UX-188: AbortController refs to guard setState in finally on unmounted component
  const runAbortRef = useRef<AbortController | null>(null)
  const editAbortRef = useRef<AbortController | null>(null)
  const deleteAbortRef = useRef<AbortController | null>(null)
  const assignAbortRef = useRef<AbortController | null>(null)

  // SIRI-UX-206: abort all in-flight requests on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      runAbortRef.current?.abort()
      editAbortRef.current?.abort()
      deleteAbortRef.current?.abort()
      assignAbortRef.current?.abort()
    }
  }, [])

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
    runAbortRef.current?.abort()
    const controller = new AbortController()
    runAbortRef.current = controller
    const { signal } = controller
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
        signal,
      })
      if (!res.ok) {
        const msg = `Failed to run task (${res.status})`
        if (!signal.aborted) {
          setRunError(msg)
          toast.error(msg)
        }
      } else {
        // SIRI-UX-047: update local status so Run button hides, preventing double-run
        if (!signal.aborted) {
          setTasks(useAgentStore.getState().tasks.map((t) =>
            t.id === task.id ? { ...t, status: 'in_progress' as const } : t
          ))
          toast.success(`▶ Running: ${task.title}`)
        }
      }
    } catch {
      if (!signal.aborted) {
        const msg = 'Network error — could not run task'
        setRunError(msg)
        toast.error(msg)
      }
    } finally {
      if (!signal.aborted) {
        setRunning(false)
      }
    }
  }

  const handleEdit = async () => {
    if (saving) return
    editAbortRef.current?.abort()
    const controller = new AbortController()
    editAbortRef.current = controller
    const { signal } = controller
    setSaving(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: editTitle, description: editDesc }),
        signal,
      })
      if (!signal.aborted) {
        if (res.ok) {
          // SIRI-UX-225: use getState().tasks to avoid stale closure — same pattern as handleRun
          setTasks(useAgentStore.getState().tasks.map((t) => t.id === task.id ? { ...t, title: editTitle, description: editDesc } : t))
          toast.success(`Task updated`)
          setEditOpen(false)
        } else {
          toast.error('Something went wrong. Try again.')
        }
      }
    } catch {
      if (!signal.aborted) {
        toast.error('Something went wrong. Try again.')
      }
    } finally {
      if (!signal.aborted) {
        setSaving(false)
      }
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    deleteAbortRef.current?.abort()
    const controller = new AbortController()
    deleteAbortRef.current = controller
    const { signal } = controller
    setDeleting(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      })
      if (!signal.aborted) {
        if (res.ok) {
          // SIRI-UX-225: use getState().tasks to avoid stale closure
          setTasks(useAgentStore.getState().tasks.filter((t) => t.id !== task.id))
          toast.success(`Task "${task.title}" deleted`)
          setDeleteOpen(false)
        } else {
          toast.error('Something went wrong. Try again.')
        }
      }
    } catch {
      if (!signal.aborted) {
        toast.error('Something went wrong. Try again.')
      }
    } finally {
      if (!signal.aborted) {
        setDeleting(false)
      }
    }
  }

  const handleAssign = async (agentId: string, agentName: string) => {
    if (assigning) return
    assignAbortRef.current?.abort()
    const controller = new AbortController()
    assignAbortRef.current = controller
    const { signal } = controller
    setAssigning(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ assignee_id: agentId }),
        signal,
      })
      if (!signal.aborted) {
        if (res.ok) {
          // SIRI-UX-225: use getState().tasks to avoid stale closure
          setTasks(useAgentStore.getState().tasks.map((t) => t.id === task.id ? { ...t, assignee_id: agentId, assignee_name: agentName } : t))
          toast.success(`Task assigned to ${agentName}`)
          setAssignOpen(false)
        } else {
          toast.error('Something went wrong. Try again.')
        }
      }
    } catch {
      if (!signal.aborted) {
        toast.error('Something went wrong. Try again.')
      }
    } finally {
      if (!signal.aborted) {
        setAssigning(false)
      }
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
      // SIRI-UX-182: keyboard accessibility — role=button + tabIndex + onKeyDown
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.title}`}
      // SIRI-UX-246: apply task-grabbed CSS class while dragging for visual feedback
      // SIRI-UX-262: use task-card CSS class for hover (no JS onMouseEnter/onMouseLeave)
      // SIRI-UX-265: input-focus-ring-blue for focus ring via CSS
      className={isGrabbed ? 'task-card task-grabbed input-focus-ring-blue' : 'task-card input-focus-ring-blue'}
      onDragStart={(e) => onDragStart?.(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onCardClick(task)
        }
      }}
      style={{
        background: '#1f2937',
        borderRadius: 8,
        padding: '0.75rem',
        cursor: 'pointer',
        border: '1px solid #374151',
        position: 'relative',
        outline: 'none',
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
                className="kanban-menu-item-btn"
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
          <div ref={editTrapRef} style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 360,
            border: '1px solid #374151',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Edit Task</h2>
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input-focus-ring-blue"
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
              className="input-focus-ring-blue"
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
                onClick={() => {
                  setEditTitle(task.title)
                  setEditDesc(task.description ?? '')
                  setEditOpen(false)
                }}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleEdit}
                disabled={!editTitle.trim() || saving}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                {saving ? 'Saving…' : 'Save'}
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
          <div ref={deleteTrapRef} style={{
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
                disabled={deleting}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
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
          <div ref={assignTrapRef} style={{
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
                    disabled={assigning}
                    className="kanban-assign-agent-btn"
                    style={{ cursor: assigning ? 'not-allowed' : 'pointer' }}
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

  // SIRI-UX-178: close dropdowns on Escape key
  useEffect(() => {
    if (!agentDropdownOpen && !priorityDropdownOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAgentDropdownOpen(false)
        setPriorityDropdownOpen(false)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [agentDropdownOpen, priorityDropdownOpen])

  return (
    <div ref={filterBarRef} style={{ padding: '0.75rem 1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          data-testid="kanban-search-input"
          type="text"
          placeholder="Search tasks..."
          aria-label="Search tasks"
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
            aria-expanded={agentDropdownOpen}
            aria-haspopup="menu"
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
                  role="menuitemcheckbox"
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
            aria-expanded={priorityDropdownOpen}
            aria-haspopup="menu"
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
                  role="menuitemcheckbox"
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
                  // SIRI-UX-180: descriptive aria-label so screen reader doesn't just say "×"
                  aria-label={`Remove ${agent?.name ?? agentId} agent filter`}
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
                // SIRI-UX-180: descriptive aria-label so screen reader doesn't just say "×"
                aria-label={`Remove ${p} priority filter`}
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
  // SIRI-UX-097: store only selectedTaskId — derive task from store to avoid stale snapshot
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [grabbedTaskId, setGrabbedTaskId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority | ''>('')
  const [creating, setCreating] = useState(false)
  // SIRI-UX-111: track attempted submit with empty title for validation feedback
  const [titleTouched, setTitleTouched] = useState(false)
  const toast = useToast()
  // SIRI-POST-006: focus trap for Create Task modal
  const createModalTrapRef = useFocusTrap(showCreateModal)
  // SIRI-UX-185: abort controller for handleCreateTask POST
  const createTaskAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { createTaskAbortRef.current?.abort() }
  }, [])
  // SIRI-UX-207: abort controller for handleDrop PATCH to prevent setState on unmount
  const dropAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { dropAbortRef.current?.abort() }
  }, [])

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) {
      // SIRI-UX-111: show validation error when submitting empty title
      setTitleTouched(true)
      return
    }
    // SIRI-UX-185: abort any previous in-flight request
    createTaskAbortRef.current?.abort()
    const controller = new AbortController()
    createTaskAbortRef.current = controller
    const { signal } = controller
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
        signal,
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Failed to create task. Try again.')
    } finally {
      if (!signal.aborted) {
        setCreating(false)
        createTaskAbortRef.current = null
      }
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
      // SIRI-UX-213: guard null/undefined priority — unsafe cast replaced with explicit check
      if (selectedPriorities.length > 0 && (!t.priority || !selectedPriorities.includes(t.priority))) return false
      return true
    })
  }, [tasks, debouncedSearch, selectedAgents, selectedPriorities])

  const handleClose = useCallback(() => setSelectedTaskId(null), [])

  // SIRI-UX-119: reset filters when company changes so stale filters don't persist
  useEffect(() => {
    clearAllFilters()
    setSelectedTaskId(null)
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // SIRI-UX-061 / SIRI-UX-100: close Create modal on Escape — gated on showCreateModal to avoid always-on listener
  useEffect(() => {
    if (!showCreateModal) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false)
        setTitleTouched(false)
        setNewTaskTitle('')
        setNewTaskDesc('')
        setNewTaskPriority('')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showCreateModal])

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

  // SIRI-POST-005: sync task order from another tab via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== `kanban-task-order-${companyId}`) return
      if (!e.newValue) return
      try {
        const order: string[] = JSON.parse(e.newValue)
        const currentTasks = useAgentStore.getState().tasks
        const sorted = [...currentTasks].sort((a, b) => {
          const ai = order.indexOf(a.id)
          const bi = order.indexOf(b.id)
          if (ai === -1) return 1
          if (bi === -1) return -1
          return ai - bi
        })
        setTasks(sorted)
      } catch {
        // malformed data — ignore
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [companyId, setTasks])

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

    // SIRI-UX-207: abort any previous drop PATCH; new AbortController for this request
    dropAbortRef.current?.abort()
    const controller = new AbortController()
    dropAbortRef.current = controller
    const { signal } = controller

    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
        signal,
      })
      if (!signal.aborted) {
        if (!res.ok) {
          // Rollback
          const rollbackTasks = useAgentStore.getState().tasks
          setTasks(rollbackTasks.map((t) => t.id === taskId ? { ...t, status: oldStatus } : t))
          toast.error('Failed to move task')
        } else {
          // Persist order to localStorage on success
          persistTaskOrder(optimisticTasks)
        }
      }
    } catch (err) {
      // SIRI-UX-207: ignore AbortError (component unmounted mid-drop)
      if (err instanceof Error && err.name === 'AbortError') return
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
            className="kanban-new-task-btn"
            onClick={() => setShowCreateModal(true)}
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
            // SIRI-UX-271: region landmark + aria-label so screen readers can navigate by column
            role="region"
            aria-label={col.label}
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
                      onCardClick={(task) => setSelectedTaskId(task.id)}
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
            className="kanban-load-more-btn"
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
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateModal(false); setTitleTouched(false); setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskPriority('') } }}
        >
          <div ref={createModalTrapRef} style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 380,
            border: '1px solid #374151',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem', fontWeight: 700 }}>New Task</h2>
            {/* SIRI-UX-111: aria-invalid + describedby for empty-submit validation */}
            <input
              autoFocus
              data-testid="create-task-title-input"
              aria-label="Task title"
              aria-invalid={titleTouched && !newTaskTitle.trim() ? 'true' : 'false'}
              aria-describedby={titleTouched && !newTaskTitle.trim() ? 'title-error' : undefined}
              value={newTaskTitle}
              onChange={(e) => { setNewTaskTitle(e.target.value); if (titleTouched) setTitleTouched(false) }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
              className="input-focus-ring-blue"
              placeholder="Task title"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: `1px solid ${titleTouched && !newTaskTitle.trim() ? '#ef4444' : '#374151'}`,
                borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: titleTouched && !newTaskTitle.trim() ? '0.25rem' : '0.75rem',
                outline: 'none',
              }}
            />
            {titleTouched && !newTaskTitle.trim() && (
              <p id="title-error" style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0 0 0.75rem' }}>
                Title is required
              </p>
            )}
            <textarea
              data-testid="create-task-desc-input"
              // SIRI-UX-221: aria-label for screen readers — placeholder is not a substitute for accessible name
              aria-label="Task description"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              className="input-focus-ring-blue"
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
            {/* SIRI-UX-204: aria-label for screen readers */}
            <select
              data-testid="create-task-priority-select"
              aria-label="Task priority"
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
              {/* SIRI-UX-276: data-testid for consistent testability — matches cancel-delete-btn pattern */}
              <button
                data-testid="create-task-cancel-btn"
                onClick={() => { setShowCreateModal(false); setTitleTouched(false); setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskPriority('') }}
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
