// SIRI-UX-049: shared utilities extracted from KanbanBoard.tsx and TaskDetailSidebar.tsx
// SIRI-UX-172: unified PRIORITY_COLORS (was duplicated in KanbanBoard and TaskDetailSidebar)
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
