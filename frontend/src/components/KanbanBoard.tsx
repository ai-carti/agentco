import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useAgentStore, type Task, type TaskStatus, type TaskPriority } from '../store/agentStore'
import { getStoredToken, BASE_URL } from '../api/client'
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


// SIRI-UX-406: added 'failed' column — backend TaskStatus includes 'failed' (task FSM: in_progress → failed)
// Without this column, tasks with failed status are invisible in the Kanban view
const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
  // SIRI-UX-425: 'error' column — backend returns status='error' on loop_detected/cost_limit_exceeded
  { id: 'error', label: 'Error' },
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

// SIRI-UX-435: wrap TaskCard in React.memo to prevent re-renders when other columns change
const TaskCard = React.memo(function TaskCard({ task, companyId, onCardClick, onDragStart, onDragEnd, isGrabbed }: TaskCardProps) {
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
  // SIRI-UX-225: mutations use getState().tasks to avoid stale closure
  // SIRI-UX-307: removed orphan useAgentStore((s) => s.tasks) subscription from TaskCard.
  // Each TaskCard subscribed to the global tasks array, causing N re-renders on every task change.
  // TaskCard re-renders naturally via parent KanbanBoard when filteredTasks change.
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

  // SIRI-UX-365: sync editTitle/editDesc with latest task prop value so that
  // if the store updates (e.g. via WebSocket) before the user opens Edit,
  // the form shows the current data rather than the stale mount-time snapshot.
  useEffect(() => {
    setEditTitle(task.title)
    setEditDesc(task.description ?? '')
  }, [task])

  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement | null>(null)

  // SIRI-UX-350: close menu on mousedown outside the task card
  useEffect(() => {
    if (!menuOpen) return
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        menuBtnRef.current && !menuBtnRef.current.contains(target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  // BUG-084: added 'error' — match TaskDetailSidebar retry behavior (SIRI-UX-427)
  const canRun = task.status === 'todo' || task.status === 'backlog' || task.status === 'error'

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

  // SIRI-UX-354: wrap in useCallback to prevent new references on every render → avoid
  // unnecessary re-renders of children that receive these handlers as props/onClick.
  const handleRun = useCallback(async (e: React.MouseEvent) => {
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
  }, [companyId, task.id, task.title, setTasks, toast]) // SIRI-UX-354

  // SIRI-UX-354: wrap in useCallback
  const handleEdit = useCallback(async () => {
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
  }, [companyId, task.id, editTitle, editDesc, saving, setTasks, toast]) // SIRI-UX-354

  // SIRI-UX-354: wrap in useCallback
  const handleDelete = useCallback(async () => {
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
  }, [companyId, task.id, task.title, deleting, setTasks, toast]) // SIRI-UX-354

  // SIRI-UX-354: wrap in useCallback
  const handleAssign = useCallback(async (agentId: string, agentName: string) => {
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
  }, [companyId, task.id, assigning, setTasks, toast]) // SIRI-UX-354

  const handleMenuAction = (action: string) => {
    setMenuOpen(false)
    if (action === 'Edit') {
      // SIRI-UX-365: read fresh task from store to avoid stale prop values.
      // useState(task.title) captures value at mount; by the time user opens Edit,
      // the store may have been updated (e.g. drag-and-drop status change). Using
      // getState().tasks.find() guarantees we always pre-fill with current data.
      const freshTask = useAgentStore.getState().tasks.find((t) => t.id === task.id)
      setEditTitle(freshTask?.title ?? task.title)
      setEditDesc(freshTask?.description ?? task.description ?? '')
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
      // SIRI-UX-445: migrated inline styles → Tailwind classes
      className={`task-card input-focus-ring-blue bg-gray-800 rounded-lg p-3 cursor-pointer border border-gray-700 relative outline-none ${isGrabbed ? 'task-grabbed' : ''}`}
      onDragStart={(e) => onDragStart?.(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onCardClick(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onCardClick(task)
        }
      }}
    >
      {/* Header: title + menu */}
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm font-semibold leading-snug flex-1 mr-2">
          {task.title}
        </div>
        <button
          ref={menuBtnRef}
          data-testid={`task-menu-${task.id}`}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
          aria-label="Task options"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="bg-transparent border-none text-gray-400 cursor-pointer text-base px-[0.15rem] py-0 leading-none shrink-0"
          title="Task options"
        >
          ···
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1 z-10 min-w-[120px] right-0 top-6"
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
          className="text-xs text-gray-400 mb-2 overflow-hidden text-ellipsis whitespace-nowrap"
        >
          {task.description}
        </div>
      )}

      {/* Priority + due date row */}
      <div className="flex gap-[0.4rem] mb-2 flex-wrap">
        {priorityStyle && (
          <span
            data-testid={`priority-badge-${task.id}`}
            className="text-[0.6rem] font-bold px-[0.4rem] py-[0.1rem] rounded uppercase tracking-wide"
            style={{ background: priorityStyle.bg, color: priorityStyle.text }}
          >
            {priorityStyle.label}
          </span>
        )}
        {dueDateInfo && (
          <span
            data-testid={`due-date-${task.id}`}
            className={`text-[0.65rem] ${dueDateInfo.overdue ? 'text-red-400' : 'text-gray-400'}`}
          >
            📅 {dueDateInfo.label}
          </span>
        )}
      </div>

      {/* Assignee + status badge row */}
      <div className={`flex items-center gap-2 ${canRun ? 'mb-2' : ''}`}>
        <div
          data-testid={`assignee-avatar-${task.id}`}
          // SIRI-UX-356: aria-label provides accessible name — initials alone are not self-descriptive
          aria-label={assigneeName}
          title={assigneeName}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-bold text-white shrink-0"
          style={{ background: avatarColor }}
        >
          {initials}
        </div>
        <span className="text-xs text-gray-400 flex-1">{assigneeName}</span>
        <span
          data-testid={`status-badge-${task.id}`}
          className="text-[0.65rem] font-semibold px-[0.4rem] py-[0.1rem] rounded uppercase tracking-wide"
          style={{ background: statusColor.bg, color: statusColor.text }}
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
          className="w-full px-2 py-[0.3rem] text-xs gap-1"
        >
          {running ? '⏳' : '▶'} {running ? 'Running…' : 'Run'}
        </Button>
      )}

      {/* SIRI-UX-293: role="alert" so screen readers announce the error — same fix as SIRI-UX-283, SIRI-UX-289 */}
      {runError && (
        <p
          data-testid={`run-error-${task.id}`}
          role="alert"
          className="text-[0.7rem] text-red-400 mt-1"
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
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setEditOpen(false) }}
        >
          <div ref={editTrapRef} className="bg-gray-800 rounded-[10px] p-6 w-[360px] border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="m-0 mb-4 font-bold">Edit Task</h2>
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input-focus-ring-blue w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border mb-3 outline-none"
              placeholder="Task title"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="input-focus-ring-blue w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border resize-y outline-none"
              placeholder="Description"
              rows={3}
            />
            <div className="flex gap-2 justify-end mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  // SIRI-UX-365: reset to store values (not stale prop) on Cancel
                  const freshTask = useAgentStore.getState().tasks.find((t) => t.id === task.id)
                  setEditTitle(freshTask?.title ?? task.title)
                  setEditDesc(freshTask?.description ?? task.description ?? '')
                  setEditOpen(false)
                }}
                className="px-[0.9rem] py-[0.4rem]"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleEdit}
                disabled={!editTitle.trim() || saving}
                className="px-[0.9rem] py-[0.4rem]"
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
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false) }}
        >
          <div ref={deleteTrapRef} className="bg-gray-800 rounded-[10px] p-6 w-[360px] border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="m-0 mb-2 font-bold">Delete Task</h2>
            <p className="text-gray-400 text-sm m-0 mb-4">
              Are you sure you want to delete "{task.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                data-testid="cancel-delete-btn"
                variant="secondary"
                onClick={() => setDeleteOpen(false)}
                className="px-[0.9rem] py-[0.4rem]"
              >
                Cancel
              </Button>
              <Button
                data-testid="confirm-delete-btn"
                variant="danger"
                onClick={handleDelete}
                disabled={deleting}
                className="px-[0.9rem] py-[0.4rem]"
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
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setAssignOpen(false) }}
        >
          <div ref={assignTrapRef} className="bg-gray-800 rounded-[10px] p-4 w-[280px] border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-3 font-bold text-[0.9rem]">Assign to Agent</h3>
            {agents.length === 0 ? (
              <p className="text-gray-400 text-[0.8rem]">No agents available</p>
            ) : (
              <div className="flex flex-col gap-1">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    data-testid={`assign-agent-${agent.id}`}
                    onClick={() => handleAssign(agent.id, agent.name)}
                    disabled={assigning}
                    className={`kanban-assign-agent-btn ${assigning ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[0.6rem] font-bold text-white"
                      style={{ background: getAvatarColor(agent.name) }}
                    >
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
})

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

// SIRI-UX-441: React.memo — FilterBar receives stable callbacks (useCallback) from KanbanBoard
// but re-renders on every KanbanBoard state change (drag, task selection, modal open, etc.)
const FilterBar = React.memo(function FilterBar({
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
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node | null)) {
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
    <div ref={filterBarRef} className="px-4 pt-3 flex flex-col gap-2">
      <div className="flex gap-2 items-center flex-wrap">
        <input
          data-testid="kanban-search-input"
          type="text"
          placeholder="Search tasks..."
          aria-label="Search tasks"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="px-3 py-[0.4rem] bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-[0.8rem] min-w-[180px]"
        />

        {/* Agent dropdown */}
        <div className="relative">
          <button
            data-testid="filter-agent-btn"
            aria-expanded={agentDropdownOpen}
            aria-haspopup="menu"
            onClick={() => { setAgentDropdownOpen((v) => !v); setPriorityDropdownOpen(false) }}
            className={`px-3 py-[0.4rem] border border-gray-700 rounded-md text-gray-200 text-[0.8rem] cursor-pointer ${selectedAgents.length > 0 ? 'bg-[#1e3a5f]' : 'bg-gray-800'}`}
          >
            Agent {selectedAgents.length > 0 && `(${selectedAgents.length})`}
          </button>
          {agentDropdownOpen && (
            // SIRI-UX-402: role="menu" required — button trigger declares aria-haspopup="menu",
            // so the dropdown container must have role="menu" for correct ARIA ownership
            <div
              role="menu"
              className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md z-20 min-w-[160px] shadow-lg">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  data-testid={`filter-agent-option-${agent.id}`}
                  role="menuitemcheckbox"
                  aria-checked={selectedAgents.includes(agent.id)}
                  onClick={() => onToggleAgent(agent.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleAgent(agent.id) } }}
                  className={`flex items-center gap-2 px-3 py-[0.4rem] cursor-pointer text-[0.8rem] border-none w-full text-left text-gray-200 ${selectedAgents.includes(agent.id) ? 'bg-gray-700' : 'bg-transparent'}`}
                >
                  <span className="w-3.5 h-3.5 border border-gray-500 rounded-[3px] inline-flex items-center justify-center text-[0.6rem]">
                    {selectedAgents.includes(agent.id) ? '✓' : ''}
                  </span>
                  {agent.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority dropdown */}
        <div className="relative">
          <button
            data-testid="filter-priority-btn"
            aria-expanded={priorityDropdownOpen}
            aria-haspopup="menu"
            onClick={() => { setPriorityDropdownOpen((v) => !v); setAgentDropdownOpen(false) }}
            className={`px-3 py-[0.4rem] border border-gray-700 rounded-md text-gray-200 text-[0.8rem] cursor-pointer ${selectedPriorities.length > 0 ? 'bg-[#1e3a5f]' : 'bg-gray-800'}`}
          >
            Priority {selectedPriorities.length > 0 && `(${selectedPriorities.length})`}
          </button>
          {priorityDropdownOpen && (
            // SIRI-UX-402: role="menu" required — button trigger declares aria-haspopup="menu"
            <div
              role="menu"
              className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md z-20 min-w-[140px] shadow-lg">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  data-testid={`filter-priority-option-${p}`}
                  role="menuitemcheckbox"
                  aria-checked={selectedPriorities.includes(p)}
                  onClick={() => onTogglePriority(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTogglePriority(p) } }}
                  className={`flex items-center gap-2 px-3 py-[0.4rem] cursor-pointer text-[0.8rem] capitalize border-none w-full text-left text-gray-200 ${selectedPriorities.includes(p) ? 'bg-gray-700' : 'bg-transparent'}`}
                >
                  <span className="w-3.5 h-3.5 border border-gray-500 rounded-[3px] inline-flex items-center justify-center text-[0.6rem]">
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
            className="px-3 py-[0.4rem] bg-transparent border border-gray-700 rounded-md text-gray-400 text-xs cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex gap-[0.35rem] flex-wrap">
          {selectedAgents.map((agentId) => {
            const agent = agents.find((a) => a.id === agentId)
            return (
              <span
                key={agentId}
                data-testid={`filter-badge-agent-${agentId}`}
                className="inline-flex items-center gap-1 px-2 py-[0.15rem] bg-[#1e3a5f] rounded-xl text-[0.7rem] text-blue-300"
              >
                {agent?.name ?? agentId}
                <button
                  data-testid={`filter-badge-remove-agent-${agentId}`}
                  onClick={() => onRemoveAgent(agentId)}
                  // SIRI-UX-180: descriptive aria-label so screen reader doesn't just say "×"
                  aria-label={`Remove ${agent?.name ?? agentId} agent filter`}
                  className="bg-transparent border-none text-blue-300 cursor-pointer p-0 text-xs leading-none"
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
              className="inline-flex items-center gap-1 px-2 py-[0.15rem] bg-amber-900 rounded-xl text-[0.7rem] text-amber-300 capitalize"
            >
              {p}
              <button
                data-testid={`filter-badge-remove-priority-${p}`}
                onClick={() => onRemovePriority(p)}
                // SIRI-UX-180: descriptive aria-label so screen reader doesn't just say "×"
                aria-label={`Remove ${p} priority filter`}
                className="bg-transparent border-none text-amber-300 cursor-pointer p-0 text-xs leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

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

  // SIRI-UX-361: wrap in useCallback to prevent new reference on every render
  const handleCreateTask = useCallback(async () => {
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
  }, [companyId, newTaskTitle, newTaskDesc, newTaskPriority, setTasks, toast]) // SIRI-UX-361

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
      // SIRI-UX-424: match description too — GlobalSearch searches both title + description,
      // Kanban filter must be consistent so users can find tasks by description in both views
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const titleMatch = t.title.toLowerCase().includes(q)
        const descMatch = t.description ? t.description.toLowerCase().includes(q) : false
        if (!titleMatch && !descMatch) return false
      }
      if (selectedAgents.length > 0 && !selectedAgents.includes(t.assignee_id ?? '')) return false
      // SIRI-UX-213: guard null/undefined priority — unsafe cast replaced with explicit check
      if (selectedPriorities.length > 0 && (!t.priority || !selectedPriorities.includes(t.priority))) return false
      return true
    })
  }, [tasks, debouncedSearch, selectedAgents, selectedPriorities])

  // SIRI-UX-346: extracted to avoid duplicating 5 setState calls in Escape handler, backdrop, Cancel button
  // SIRI-UX-368: abort in-flight createTask POST when modal is closed mid-flight so the
  // completed response doesn't call setTasks/toast.success on a closed modal.
  // SIRI-UX-405: reset creating=false unconditionally — if AbortError fires, finally block
  // guards with !signal.aborted and skips setCreating(false), leaving modal stuck disabled on reopen.
  const closeCreateModal = useCallback(() => {
    createTaskAbortRef.current?.abort() // SIRI-UX-368: cancel any pending create request
    setCreating(false) // SIRI-UX-405: force reset so reopen doesn't find creating=true
    setShowCreateModal(false)
    setTitleTouched(false)
    setNewTaskTitle('')
    setNewTaskDesc('')
    setNewTaskPriority('')
  }, [])

  const handleClose = useCallback(() => setSelectedTaskId(null), [])
  // SIRI-UX-339: stable callback — avoids creating N new function refs per render inside filteredTasks.map
  const handleCardClick = useCallback((task: Task) => setSelectedTaskId(task.id), [])
  // SIRI-UX-388: stable callbacks for FilterBar's onRemoveAgent/onRemovePriority — inline
  // arrow functions in JSX would create new references on every render, causing FilterBar to re-render
  const removeAgent = useCallback((id: string) => setSelectedAgents((prev) => prev.filter((a) => a !== id)), [])
  const removePriority = useCallback((p: TaskPriority) => setSelectedPriorities((prev) => prev.filter((x) => x !== p)), [])

  // SIRI-UX-119: reset filters when company changes so stale filters don't persist
  useEffect(() => {
    clearAllFilters()
    setSelectedTaskId(null)
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // SIRI-UX-061 / SIRI-UX-100: close Create modal on Escape — gated on showCreateModal to avoid always-on listener
  useEffect(() => {
    if (!showCreateModal) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCreateModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showCreateModal, closeCreateModal])

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
    setGrabbedTaskId(taskId)
  }, [])

  // SIRI-UX-349: also clear dragOverCol on dragEnd — if drag is cancelled (Escape)
  // without triggering a drop, the column blue border stays forever.
  const handleDragEnd = useCallback(() => {
    setGrabbedTaskId(null)
    setDragOverCol(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, colId: string) => {
    e.preventDefault()
    setDragOverCol(colId)
  }, [])

  // SIRI-UX-299: check relatedTarget to avoid clearing dragOverCol when dragging
  // over a child element inside the same column. Without this check, the blue border
  // flickers every time the dragged card moves over a TaskCard div inside the column.
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as HTMLElement).contains(related)) return
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

    // SIRI-UX-428: block drop into 'error' column — error is a system-assigned status,
    // not something users should be able to set manually via drag-and-drop.
    if (newStatus === 'error') return

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

    // SIRI-UX-422: 'backlog' is a frontend-only status; backend TaskStatus does not include it.
    // Map 'backlog' → 'todo' before sending PATCH so the request passes Pydantic validation.
    const backendStatus = newStatus === 'backlog' ? 'todo' : newStatus

    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: backendStatus }),
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
        <div className="flex justify-end px-4 pt-2">
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
          onRemoveAgent={removeAgent}
          onRemovePriority={removePriority}
          hasActiveFilters={hasActiveFilters}
        />
      )}
      {showFilterEmpty && (
        <div data-testid="filter-empty-state" className="text-center p-8 text-gray-500 text-sm">
          No tasks match filters
        </div>
      )}
      <div
        data-testid="kanban-board"
        // SIRI-UX-452: overflow-x-auto so 6 columns scroll horizontally on narrow screens instead of squeezing
        className={`gap-4 p-4 overflow-x-auto ${(showEmpty || showFilterEmpty) ? 'hidden' : 'flex'}`}
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
            // SIRI-UX-452: min-w-[220px] so columns have readable width when scrolling horizontally
            className={`flex-1 bg-gray-900 rounded-lg p-3 min-w-[220px] border-2 transition-[border-color] duration-150 ${dragOverCol === col.id ? 'border-blue-500' : 'border-transparent'}`}
          >
            <h2 className="text-sm font-semibold mb-3 text-gray-200">
              {col.label}
              {isLoaded && (
                <span className="ml-[0.4rem] text-gray-500 font-normal">
                  ({filteredTasks.filter((t) => t.status === col.id).length})
                </span>
              )}
            </h2>
            <div className="flex flex-col gap-2">
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
                      onCardClick={handleCardClick}
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
        <div className="flex justify-center px-4 pt-2 pb-4">
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
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) closeCreateModal() }}
        >
          <div ref={createModalTrapRef} className="bg-gray-800 rounded-[10px] p-6 w-[380px] border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="m-0 mb-4 font-bold">New Task</h2>
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
              className={`input-focus-ring-blue w-full px-3 py-2 bg-gray-900 rounded-md text-gray-50 text-sm box-border outline-none border ${titleTouched && !newTaskTitle.trim() ? 'border-red-500 mb-1' : 'border-gray-700 mb-3'}`}
              placeholder="Task title"
            />
            {/* SIRI-UX-317: role="alert" so screen reader announces validation error dynamically */}
            {titleTouched && !newTaskTitle.trim() && (
              <p id="title-error" role="alert" className="text-red-500 text-xs m-0 mb-3">
                Title is required
              </p>
            )}
            <textarea
              data-testid="create-task-desc-input"
              // SIRI-UX-221: aria-label for screen readers — placeholder is not a substitute for accessible name
              aria-label="Task description"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              className="input-focus-ring-blue w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border resize-y outline-none mb-3"
              placeholder="Description (optional)"
              rows={3}
            />
            {/* SIRI-UX-048: Priority selector */}
            {/* SIRI-UX-204: aria-label for screen readers */}
            {/* SIRI-UX-342: add input-focus-ring-blue for consistent keyboard focus ring */}
            <select
              data-testid="create-task-priority-select"
              aria-label="Task priority"
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority | '')}
              className={`input-focus-ring-blue w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm box-border outline-none ${newTaskPriority ? 'text-gray-50' : 'text-gray-500'}`}
            >
              <option value="">Priority (optional)</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            {/* SIRI-UX-341: use <Button> component for Cancel/Submit — matches Edit/Delete modal pattern */}
            <div className="flex gap-2 justify-end mt-4">
              {/* SIRI-UX-276: data-testid for consistent testability — matches cancel-delete-btn pattern */}
              <Button
                data-testid="create-task-cancel-btn"
                variant="secondary"
                onClick={closeCreateModal}
                className="px-[0.9rem] py-[0.4rem]"
              >
                Cancel
              </Button>
              {/* SIRI-UX-377: aria-disabled mirrors disabled so AT users know why button is inactive */}
              <Button
                data-testid="create-task-submit-btn"
                variant="primary"
                onClick={handleCreateTask}
                disabled={creating || !newTaskTitle.trim()}
                aria-disabled={creating || !newTaskTitle.trim()}
                className="px-[0.9rem] py-[0.4rem]"
              >
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
