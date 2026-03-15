import { useState, useEffect, useCallback } from 'react'
import { useAgentStore, type Task, type TaskStatus } from '../store/agentStore'
import { getStoredToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

const STATUS_COLORS: Record<TaskStatus, { bg: string; text: string }> = {
  todo: { bg: '#374151', text: '#d1d5db' },
  in_progress: { bg: '#1d4ed8', text: '#bfdbfe' },
  done: { bg: '#065f46', text: '#a7f3d0' },
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

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRunning(true)
    try {
      const token = getStoredToken()
      await fetch(`${BASE_URL}/api/companies/${companyId}/tasks/${task.id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
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
    </div>
  )
}

interface SidePanelProps {
  task: Task
  onClose: () => void
}

function SidePanel({ task, onClose }: SidePanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.todo
  const assigneeName = task.assignee_name ?? 'Unassigned'
  const avatarColor = task.assignee_name ? getAvatarColor(task.assignee_name) : '#4b5563'

  return (
    <>
      {/* Overlay */}
      <div
        data-testid="side-panel-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
        }}
      />
      {/* Panel */}
      <div
        data-testid="task-side-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          background: '#111827',
          borderLeft: '1px solid #1f2937',
          padding: '1.5rem',
          zIndex: 50,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, flex: 1, lineHeight: 1.4 }}>
            {task.title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '1.25rem',
              marginLeft: '0.5rem',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Status badge */}
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '0.2rem 0.5rem',
            borderRadius: 4,
            background: statusColor.bg,
            color: statusColor.text,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {task.status.replace('_', ' ')}
        </span>

        {/* Assignee */}
        <div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Assignee
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: avatarColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {assigneeName.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: '0.875rem' }}>{assigneeName}</span>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Description
            </div>
            <p style={{ fontSize: '0.875rem', color: '#d1d5db', lineHeight: 1.6, margin: 0 }}>
              {task.description}
            </p>
          </div>
        )}

        {/* IDs */}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #1f2937' }}>
          <div style={{ fontSize: '0.7rem', color: '#4b5563' }}>Task ID: {task.id}</div>
          {task.assignee_id && (
            <div style={{ fontSize: '0.7rem', color: '#4b5563' }}>Assignee ID: {task.assignee_id}</div>
          )}
        </div>
      </div>
    </>
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
        <SidePanel task={selectedTask} onClose={handleClose} />
      )}
    </>
  )
}
