// SIRI-UX-049: shared utilities extracted from KanbanBoard.tsx and TaskDetailSidebar.tsx
// SIRI-UX-172: unified PRIORITY_COLORS (was duplicated in KanbanBoard and TaskDetailSidebar)
// SIRI-UX-239: agent status dot colors (moved from AgentCard.tsx local STATUS_COLORS to avoid naming collision)
export const AGENT_STATUS_DOT_COLORS: Record<string, string> = {
  idle:    '#6b7280',
  running: '#22c55e',
  done:    '#3b82f6',
  error:   '#ef4444',
}

export const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: '#7f1d1d', text: '#fca5a5', label: 'High' },
  medium: { bg: '#78350f', text: '#fcd34d', label: 'Medium' },
  low:    { bg: '#1f2937', text: '#9ca3af', label: 'Low' },
}

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  todo: { bg: '#374151', text: '#d1d5db' },
  backlog: { bg: '#292524', text: '#a8a29e' },
  in_progress: { bg: '#1d4ed8', text: '#bfdbfe' },
  done: { bg: '#065f46', text: '#a7f3d0' },
  failed: { bg: '#7f1d1d', text: '#fca5a5' },
  // SIRI-UX-400: backend can return status='error' (loop_detected, cost_limit_exceeded) —
  // without this entry STATUS_COLORS[task.status] returns undefined → fallback colors used
  // but explicit entry provides consistent styling with 'failed'
  error: { bg: '#7f1d1d', text: '#fca5a5' },
}

export const AVATAR_COLORS = [
  '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#9333ea', '#c2410c', '#0d9488',
]

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// SIRI-UX-238: formatTimeHMS (moved from WarRoomPage.tsx local formatTime)
// SIRI-UX-327: guard against invalid ISO string — return '--:--:--' as fallback (same pattern as formatDateLong)
export function formatTimeHMS(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '--:--:--'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// SIRI-UX-238: truncate (moved from WarRoomPage.tsx local truncate)
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '...'
}

// SIRI-UX-302: formatDateLong — full date display (Month Day, Year) shared across components
// Replaces local formatDate() in TaskDetailSidebar and raw toLocaleDateString() calls in AgentPage
export function formatDateLong(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

// SIRI-UX-268: formatDueDate extracted from KanbanBoard.tsx into shared taskUtils
// so any component (e.g. TaskDetailSidebar) can display due date without duplicating logic
export function formatDueDate(dateStr: string): { label: string; overdue: boolean } {
  const due = new Date(dateStr)
  const now = new Date()
  const overdue = due < now
  const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { label, overdue }
}

// SIRI-UX-196: shared relative-time formatter (eliminates timeAgo/relativeTime duplication)
// SIRI-UX-333: guard against invalid ISO — new Date(invalid).getTime() returns NaN, yielding "NaNs ago"
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (isNaN(diffMs)) return '?'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
