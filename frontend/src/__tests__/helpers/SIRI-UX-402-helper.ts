/**
 * SIRI-UX-402 helper — static source audit for FilterBar role="menu"
 * Returns true if KanbanBoard.tsx has at least 3 role="menu" occurrences
 * (1 task card menu + 2 filter dropdowns).
 * Uses Vite's ?raw import — no @types/node needed.
 */
const components = import.meta.glob('../../components/KanbanBoard.tsx', { query: '?raw', import: 'default', eager: true })
const src = components['../../components/KanbanBoard.tsx'] as string

export const KanbanBoard_FilterBar_hasMenuRole =
  (src.match(/role="menu"/g) ?? []).length >= 3
