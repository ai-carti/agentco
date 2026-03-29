import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
        // SIRI-UX-355: catch receives `unknown` — guard with instanceof before accessing .name
        // DOMException is not instanceof Error in some environments (e.g. jsdom), so check both
        const errName = err instanceof Error || err instanceof DOMException ? err.name : ''
        if (errName !== 'AbortError') {
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

  // SIRI-UX-330: wrap in useCallback so handleRun is stable across renders
  // (prevents sidebar-run-btn from remounting on unrelated state changes)
  const handleRun = useCallback(async () => {
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
    } catch (err) {
      // SIRI-UX-401: removed console.error — error already shown via toast.error
      // AbortError is not a user-facing error
      if (err instanceof Error && err.name === 'AbortError') return
      if (!signal.aborted) {
        toast.error('Something went wrong...')
      }
    } finally {
      if (!signal.aborted) {
        setRunning(false)
      }
    }
  }, [companyId, task.id, task.title, setTasks, toast]) // SIRI-UX-330

  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.todo
  const assigneeName = task.assignee_name ?? 'Unassigned'
  const avatarColor = task.assignee_name ? getAvatarColor(task.assignee_name) : '#4b5563'
  // SIRI-UX-427: added 'error' — tasks stuck in error state should be retryable
  const canRun = task.status === 'todo' || task.status === 'backlog' || task.status === 'error'
  const priorityColor = task.priority ? PRIORITY_COLORS[task.priority] : null

  // SIRI-UX-343: memoize so new Date() is only called when due_date changes, not on every render
  const isDueDateOverdue = useMemo(
    () => (task.due_date ? new Date(task.due_date) < new Date() : false),
    [task.due_date]
  )

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
        className="fixed inset-0 bg-black/50 z-40 cursor-default"
      />

      {/* Sidebar panel */}
      {/* SIRI-UX-150: role="dialog" + aria-modal + focus trap for accessibility */}
      <div
        ref={trapRef}
        data-testid="task-detail-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className="fixed top-0 right-0 bottom-0 w-[400px] bg-slate-900 border-l border-white/10 z-50 flex flex-col animate-[slideInRight_250ms_ease-out]"
      >
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Header row */}
          <div className="flex justify-between items-start">
            <h2 className="text-[1.05rem] font-bold m-0 flex-1 leading-snug text-slate-100">
              {task.title}
            </h2>
            <button
              data-testid="sidebar-close-btn"
              onClick={onClose}
              aria-label="Close task details"
              className="bg-transparent border-none text-slate-500 cursor-pointer text-[1.4rem] ml-3 leading-none px-1 py-0"
            >
              ×
            </button>
          </div>

          {/* Status + Priority row */}
          <div className="flex gap-2 items-center flex-wrap">
            <span
              data-testid="sidebar-status-badge"
              className="text-[0.65rem] font-bold px-2 py-[0.2rem] rounded uppercase tracking-wide"
              style={{ background: statusColor.bg, color: statusColor.text }}
            >
              {task.status.replace('_', ' ')}
            </span>
            {priorityColor && (
              <span
                data-testid="sidebar-priority"
                className="text-[0.65rem] font-bold px-2 py-[0.2rem] rounded uppercase tracking-wide"
                style={{ background: priorityColor.bg, color: priorityColor.text }}
              >
                {task.priority}
              </span>
            )}
          </div>

          {/* Assignee */}
          <div>
            <div className="text-[0.65rem] text-slate-600 mb-1.5 uppercase tracking-wider">
              Assignee
            </div>
            <div className="flex items-center gap-2.5">
              <div
                data-testid="sidebar-assignee-avatar"
                // SIRI-UX-369: aria-label provides accessible name — initials alone are not self-descriptive
                aria-label={assigneeName}
                title={assigneeName}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[0.8rem] font-bold text-white shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {getInitials(assigneeName)}
              </div>
              <span className="text-sm text-slate-300">{assigneeName}</span>
            </div>
          </div>

          {/* Due date */}
          {task.due_date && (
            <div>
              <div className="text-[0.65rem] text-slate-600 mb-1 uppercase tracking-wider">
                Due Date
              </div>
              <span
                data-testid="sidebar-due-date"
                className={`text-sm ${isDueDateOverdue ? 'text-red-500' : 'text-slate-400'}`}
              >
                {formatDateLong(task.due_date)}
                {isDueDateOverdue && ' ⚠ Overdue'}
              </span>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div>
              <div className="text-[0.65rem] text-slate-600 mb-1.5 uppercase tracking-wider">
                Description
              </div>
              <p className="text-sm text-slate-300 leading-relaxed m-0">
                {task.description}
              </p>
            </div>
          )}

          {/* Execution Log */}
          <div>
            <div className="text-[0.65rem] text-slate-600 mb-2 uppercase tracking-wider font-semibold">
              Execution Log
            </div>
            {/* SIRI-UX-352: aria-live="polite" so screen readers announce new log entries
                as they stream in during active task execution */}
            <div
              data-testid="task-logs-container"
              aria-live="polite"
              aria-label="Execution log"
              className="bg-black/40 rounded-md p-3 font-mono text-xs text-slate-400 min-h-[80px] max-h-[200px] overflow-y-auto"
            >
              {logsLoading ? (
                <SkeletonCard variant="task" count={2} />
              ) : logsError ? (
                /* SIRI-UX-338: role="alert" so screen readers announce log load failure */
                <span data-testid="logs-error" role="alert" className="text-red-400">⚠ Failed to load logs</span>
              ) : logs.length === 0 ? (
                <span className="text-slate-600">No execution log yet</span>
              ) : (
                logs.map((entry, idx) => (
                  // SIRI-UX-217: use index in key to prevent duplicate-key collision when
                  // two log entries share identical timestamp + message strings
                  <div key={`${idx}-${entry.timestamp}-${entry.message}`} className="mb-1">
                    <span className="text-slate-500 mr-2">
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
            <div className="text-[0.65rem] text-slate-600 mb-2 uppercase tracking-wider font-semibold">
              Status History
            </div>
            {statusHistory.length === 0 ? (
              <span className="text-[0.8rem] text-slate-600">No status changes yet</span>
            ) : (
              <div className="flex flex-col gap-2 pl-2 border-l-2 border-slate-800">
                {statusHistory.map((entry, idx) => {
                  const sc = STATUS_COLORS[entry.status] ?? STATUS_COLORS.todo
                  return (
                    <div
                      // SIRI-UX-252: index prefix prevents key collision when same status appears
                      // multiple times (same root cause as SIRI-UX-217 for log entries)
                      key={`${idx}-${entry.status}-${entry.changed_at}`}
                      data-testid={`status-history-${entry.status}`}
                      className="flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full shrink-0 -ml-[5px]" style={{ backgroundColor: sc.text }} />
                      <span className="text-xs font-semibold uppercase" style={{ color: sc.text }}>
                        {entry.status.replace('_', ' ')}
                      </span>
                      <span className="text-[0.7rem] text-slate-600 ml-auto">
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
          <div className="px-6 py-4 border-t border-white/[0.08]">
            <button
              data-testid="sidebar-run-btn"
              aria-label={running ? 'Running task…' : 'Run task'}
              onClick={handleRun}
              disabled={running}
              className={`w-full px-4 py-2.5 text-white border-none rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 ${running ? 'bg-blue-700 cursor-not-allowed' : 'bg-emerald-600 cursor-pointer'}`}
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
