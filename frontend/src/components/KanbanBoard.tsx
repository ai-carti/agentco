import { useState, useCallback } from 'react'
import { useAgentStore, type Task, type TaskStatus } from '../store/agentStore'
import { getStoredToken } from '../api/client'
import TaskDetailSidebar from './TaskDetailSidebar'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  todo: { bg: '#374151', text: '#d1d5db' },
  backlog: { bg: '#292524', text: '#a8a29e' },
  in_progress: { bg: '#1d4ed8', text: '#bfdbfe' },
  done: { bg: '#065f46', text: '#a7f3d0' },
  failed: { bg: '#7f1d1d', text: '#fca5a5' },
}

const AVATAR_COLORS = [
  '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#9333ea', '#c2410c', '#0d9488',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: '#7f1d1d', text: '#fca5a5', label: 'High' },
  medium: { bg: '#78350f', text: '#fcd34d', label: 'Medium' },
  low:    { bg: '#1f2937', text: '#9ca3af', label: 'Low' },
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

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
}

function TaskCard({ task, companyId, onCardClick }: TaskCardProps) {
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const toast = useToast()

  const canRun = task.status === 'todo' || task.status === 'backlog'

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

  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.todo
  const assigneeName = task.assignee_name ?? 'Unassigned'
  const initials = getInitials(assigneeName)
  const avatarColor = task.assignee_name ? getAvatarColor(task.assignee_name) : '#4b5563'
  const priorityStyle = task.priority ? PRIORITY_COLORS[task.priority] : null
  const dueDateInfo = task.due_date ? formatDueDate(task.due_date) : null

  return (
    <div
      data-testid={`task-card-${task.id}`}
      onClick={() => onCardClick(task)}
      style={{
        background: '#1f2937',
        borderRadius: 8,
        padding: '0.75rem',
        cursor: 'pointer',
        border: '1px solid #374151',
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
            style={{
              position: 'absolute', background: '#1f2937', border: '1px solid #374151',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              padding: '0.25rem 0', zIndex: 10, minWidth: 120, right: 0, top: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {['Edit', 'Delete', 'Assign'].map((item) => (
              <div
                key={item}
                style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#374151')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => setMenuOpen(false)}
              >
                {item}
              </div>
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
        <button
          data-testid={`run-btn-${task.id}`}
          onClick={handleRun}
          disabled={running}
          style={{
            width: '100%', padding: '0.3rem 0.5rem',
            background: running ? '#065f46' : '#059669',
            color: '#fff', border: 'none', borderRadius: 5,
            fontSize: '0.75rem', fontWeight: 600,
            cursor: running ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { if (!running) e.currentTarget.style.background = '#047857' }}
          onMouseLeave={(e) => { if (!running) e.currentTarget.style.background = '#059669' }}
        >
          {running ? '⏳' : '▶'} {running ? 'Running…' : 'Run'}
        </button>
      )}

      {runError && (
        <p
          data-testid={`run-error-${task.id}`}
          style={{ fontSize: '0.7rem', color: '#f87171', margin: '0.3rem 0 0' }}
        >
          ⚠ {runError}
        </p>
      )}
    </div>
  )
}

interface KanbanBoardProps {
  companyId: string
  isLoaded?: boolean
}

export default function KanbanBoard({ companyId, isLoaded = true }: KanbanBoardProps) {
  const tasks = useAgentStore((s) => s.tasks)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const handleClose = useCallback(() => setSelectedTask(null), [])

  const showEmpty = isLoaded && tasks.length === 0

  return (
    <>
      {showEmpty && (
        <EmptyState
          emoji="📋"
          title="No tasks yet"
          subtitle="Create your first task and assign it to an agent"
          ctaLabel="+ New Task"
          onCTA={() => {}}
        />
      )}
      <div
        data-testid="kanban-board"
        style={{ display: showEmpty ? 'none' : 'flex', gap: '1rem', padding: '1rem' }}
      >
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            style={{
              flex: 1,
              background: '#111827',
              borderRadius: 8,
              padding: '0.75rem',
              minWidth: 0,
            }}
          >
            <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: '#e5e7eb' }}>
              {col.label}
              <span style={{ marginLeft: '0.4rem', color: '#6b7280', fontWeight: 400 }}>
                ({tasks.filter((t) => t.status === col.id).length})
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tasks
                .filter((t) => t.status === col.id)
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    companyId={companyId}
                    onCardClick={setSelectedTask}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <TaskDetailSidebar task={selectedTask} companyId={companyId} onClose={handleClose} />
      )}
    </>
  )
}
