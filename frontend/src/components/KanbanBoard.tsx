import { useState, useCallback } from 'react'
import { useAgentStore, type Task, type TaskStatus } from '../store/agentStore'
import { getStoredToken } from '../api/client'
import TaskDetailSidebar from './TaskDetailSidebar'
import { useToast } from '../context/ToastContext'

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

interface TaskCardProps {
  task: Task
  companyId: string
  onCardClick: (task: Task) => void
}

function TaskCard({ task, companyId, onCardClick }: TaskCardProps) {
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const toast = useToast()

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
  const initial = assigneeName.charAt(0).toUpperCase()
  const avatarColor = task.assignee_name ? getAvatarColor(task.assignee_name) : '#4b5563'

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
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#6b7280')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#374151')}
    >
      {/* Title */}
      <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', lineHeight: 1.4 }}>
        {task.title}
      </div>

      {/* Assignee + status badge row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {/* Avatar */}
        <div
          data-testid={`assignee-avatar-${task.id}`}
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', flex: 1 }}>{assigneeName}</span>
        {/* Status badge */}
        <span
          data-testid={`status-badge-${task.id}`}
          style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            padding: '0.1rem 0.4rem',
            borderRadius: 4,
            background: statusColor.bg,
            color: statusColor.text,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {task.status.replace('_', ' ')}
        </span>
      </div>

      {/* Run button */}
      <button
        data-testid={`run-btn-${task.id}`}
        onClick={handleRun}
        disabled={running}
        style={{
          width: '100%',
          padding: '0.3rem 0.5rem',
          background: running ? '#1d4ed8' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 5,
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: running ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.25rem',
        }}
      >
        {running ? '⏳' : '▶'} {running ? 'Running…' : 'Run'}
      </button>

      {/* Error feedback */}
      {runError && (
        <p
          data-testid={`run-error-${task.id}`}
          style={{
            fontSize: '0.7rem',
            color: '#f87171',
            marginTop: '0.3rem',
            margin: '0.3rem 0 0',
          }}
        >
          ⚠ {runError}
        </p>
      )}
    </div>
  )
}

interface KanbanBoardProps {
  companyId: string
}

export default function KanbanBoard({ companyId }: KanbanBoardProps) {
  const tasks = useAgentStore((s) => s.tasks)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const handleClose = useCallback(() => setSelectedTask(null), [])

  return (
    <>
      <div
        data-testid="kanban-board"
        style={{ display: 'flex', gap: '1rem', padding: '1rem' }}
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
