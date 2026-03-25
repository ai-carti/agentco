import { useState, useEffect, useCallback, useRef } from 'react'
import { type Task, useAgentStore } from '../store/agentStore'
import { getStoredToken, BASE_URL } from '../api/client'
import SkeletonCard from './SkeletonCard'
import { useToast } from '../context/ToastContext'
// SIRI-UX-049: shared utilities extracted to taskUtils (no local duplicates)
// SIRI-UX-172: PRIORITY_COLORS now imported from taskUtils (was duplicated)
// SIRI-UX-302: formatDateLong imported from taskUtils (replaces local formatDate)
import { STATUS_COLORS, PRIORITY_COLORS, getAvatarColor, getInitials, formatTimeHMS, formatDateLong } from '../utils/taskUtils'
// SIRI-UX-150: focus trap for accessibility
import { useFocusTrap } from '../hooks/useFocusTrap'


// SIRI-UX-172: PRIORITY_COLORS moved to taskUtils.ts

interface LogEntry {
  timestamp: string
  message: string
}

interface StatusHistoryEntry {
  status: string
  changed_at: string
}

// SIRI-UX-240: formatTimestamp wrapper removed — call formatTimeHMS directly
// SIRI-UX-302: local formatDate removed — use formatDateLong from taskUtils

interface TaskDetailSidebarProps {
  task: Task
  companyId: string
  onClose: () => void
}

export default function TaskDetailSidebar({ task, companyId, onClose }: TaskDetailSidebarProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState(false)
  const [running, setRunning] = useState(false)
  const toast = useToast()
  const setTasks = useAgentStore((s) => s.setTasks)
  // SIRI-UX-150: focus trap — keep focus within sidebar while open
  const trapRef = useFocusTrap(true)
  // SIRI-UX-190: AbortController ref to guard setState in finally on unmounted component
  const runAbortRef = useRef<AbortController | null>(null)
  // SIRI-UX-210: abort in-flight run request on unmount to prevent wasted network + setState on dead component
  useEffect(() => {
    return () => { runAbortRef.current?.abort() }
  }, [])

  // Fetch logs
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    const fetchLogs = async () => {
      // SIRI-UX-177: reset stale logs immediately so previous task logs don't flash
      setLogs([])
      setStatusHistory([])
      setLogsLoading(true)
      setLogsError(false)
      try {
        const token = getStoredToken()
        const res = await fetch(
          `${BASE_URL}/api/companies/${companyId}/tasks/${task.id}/logs`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal,
          }
        )
        if (res.ok) {
          const data = await res.json()
          setLogs(data.logs ?? [])
          setStatusHistory(data.status_history ?? [])
        } else {
          // SIRI-UX-109: distinguish API error from empty logs
          setLogsError(true)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // SIRI-UX-109: network error — show error state, not empty state
          setLogsError(true)
        }
      } finally {
        if (!signal.aborted) {
          setLogsLoading(false)
        }
      }
    }
    fetchLogs()
    return () => controller.abort()
  }, [task.id, companyId])

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleRun = async () => {
    runAbortRef.current?.abort()
    const controller = new AbortController()
    runAbortRef.current = controller
    const { signal } = controller
    setRunning(true)
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
      if (!signal.aborted) {
        if (res.ok) {
          // SIRI-UX-081: optimistic update — hide Run button, match KanbanBoard behavior
          setTasks(useAgentStore.getState().tasks.map((t) =>
            t.id === task.id ? { ...t, status: 'in_progress' as const } : t
          ))
          toast.success(`▶ Running: ${task.title}...`)
        } else {
          toast.error('Something went wrong...')
        }
      }
    } catch {
      if (!signal.aborted) {
        toast.error('Something went wrong...')
      }
    } finally {
      if (!signal.aborted) {
        setRunning(false)
      }
    }
  }

  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.todo
  const assigneeName = task.assignee_name ?? 'Unassigned'
  const avatarColor = task.assignee_name ? getAvatarColor(task.assignee_name) : '#4b5563'
  const canRun = task.status === 'todo' || task.status === 'backlog'
  const priorityColor = task.priority ? PRIORITY_COLORS[task.priority] : null

  const isDueDateOverdue = task.due_date ? new Date(task.due_date) < new Date() : false

  return (
    <>
      {/* Backdrop */}
      {/* SIRI-UX-311: role="button" + tabIndex + onKeyDown — keyboard users can close sidebar via backdrop */}
      <div
        data-testid="sidebar-backdrop"
        role="button"
        tabIndex={0}
        aria-label="Close task details"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 40,
          cursor: 'default',
        }}
      />

      {/* Sidebar panel */}
      {/* SIRI-UX-150: role="dialog" + aria-modal + focus trap for accessibility */}
      <div
        ref={trapRef}
        data-testid="task-detail-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          background: '#0f172a',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 250ms ease-out',
        }}
      >
        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, flex: 1, lineHeight: 1.4, color: '#f1f5f9' }}>
              {task.title}
            </h2>
            <button
              data-testid="sidebar-close-btn"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '1.4rem',
                marginLeft: '0.75rem',
                lineHeight: 1,
                padding: '0 0.25rem',
              }}
            >
              ×
            </button>
          </div>

          {/* Status + Priority row */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              data-testid="sidebar-status-badge"
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
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
            {priorityColor && (
              <span
                data-testid="sidebar-priority"
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: 4,
                  background: priorityColor.bg,
                  color: priorityColor.text,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {task.priority}
              </span>
            )}
          </div>

          {/* Assignee */}
          <div>
            <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Assignee
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                data-testid="sidebar-assignee-avatar"
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
                  flexShrink: 0,
                }}
              >
                {getInitials(assigneeName)}
              </div>
              <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>{assigneeName}</span>
            </div>
          </div>

          {/* Due date */}
          {task.due_date && (
            <div>
              <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Due Date
              </div>
              <span
                data-testid="sidebar-due-date"
                style={{ fontSize: '0.875rem', color: isDueDateOverdue ? '#ef4444' : '#94a3b8' }}
              >
                {formatDateLong(task.due_date)}
                {isDueDateOverdue && ' ⚠ Overdue'}
              </span>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div>
              <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Description
              </div>
              <p style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.7, margin: 0 }}>
                {task.description}
              </p>
            </div>
          )}

          {/* Execution Log */}
          <div>
            <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
              Execution Log
            </div>
            <div
              data-testid="task-logs-container"
              style={{
                background: 'rgba(0,0,0,0.4)',
                borderRadius: 6,
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#94a3b8',
                minHeight: 80,
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {logsLoading ? (
                <SkeletonCard variant="task" count={2} />
              ) : logsError ? (
                <span data-testid="logs-error" style={{ color: '#f87171' }}>⚠ Failed to load logs</span>
              ) : logs.length === 0 ? (
                <span style={{ color: '#475569' }}>No execution log yet</span>
              ) : (
                logs.map((entry, idx) => (
                  // SIRI-UX-217: use index in key to prevent duplicate-key collision when
                  // two log entries share identical timestamp + message strings
                  <div key={`${idx}-${entry.timestamp}-${entry.message}`} style={{ marginBottom: '0.25rem' }}>
                    <span style={{ color: '#64748b', marginRight: '0.5rem' }}>
                      [{formatTimeHMS(entry.timestamp)}]
                    </span>
                    {entry.message}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Status History */}
          <div>
            <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
              Status History
            </div>
            {statusHistory.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: '#475569' }}>No status changes yet</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid #1e293b' }}>
                {statusHistory.map((entry, idx) => {
                  const sc = STATUS_COLORS[entry.status] ?? STATUS_COLORS.todo
                  return (
                    <div
                      // SIRI-UX-252: index prefix prevents key collision when same status appears
                      // multiple times (same root cause as SIRI-UX-217 for log entries)
                      key={`${idx}-${entry.status}-${entry.changed_at}`}
                      data-testid={`status-history-${entry.status}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.text, flexShrink: 0, marginLeft: -5 }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: sc.text, textTransform: 'uppercase' }}>
                        {entry.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#475569', marginLeft: 'auto' }}>
                        {formatDateLong(entry.changed_at)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Fixed bottom actions */}
        {canRun && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              data-testid="sidebar-run-btn"
              aria-label={running ? 'Running task…' : 'Run task'}
              onClick={handleRun}
              disabled={running}
              style={{
                width: '100%',
                padding: '0.6rem 1rem',
                background: running ? '#1d4ed8' : '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: running ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              {running ? '⏳ Running…' : '▶ Run Task'}
            </button>
          </div>
        )}
      </div>

      {/* SIRI-UX-085: slideInRight moved to index.css */}
    </>
  )
}
