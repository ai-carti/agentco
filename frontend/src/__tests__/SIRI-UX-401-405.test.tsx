/**
 * Tests for SIRI-UX-401 through SIRI-UX-405 — Siri self-audit cycle 4 (2026-03-26)
 *
 * Uses import.meta.glob with ?raw to read source as strings (Vite-native, no @types/node needed).
 */
import { describe, it, expect } from 'vitest'

// Load source files as raw strings via Vite's ?raw import
const components = import.meta.glob('../components/*.tsx', { query: '?raw', import: 'default', eager: true })
const storeModules = import.meta.glob('../store/*.ts', { query: '?raw', import: 'default', eager: true })

const taskDetailSrc = components['../components/TaskDetailSidebar.tsx'] as string
const kanbanSrc = components['../components/KanbanBoard.tsx'] as string
const warRoomSrc = components['../components/WarRoom.tsx'] as string
const agentStoreSrc = storeModules['../store/agentStore.ts'] as string

// ─── SIRI-UX-401: no console.error in TaskDetailSidebar.handleRun ───────────
describe('SIRI-UX-401: TaskDetailSidebar.handleRun — no console.error in production', () => {
  it('console.error removed from handleRun — only toast.error used', () => {
    const consoleErrorLines = taskDetailSrc
      .split('\n')
      .filter((l: string) => l.includes('console.error') && !l.trim().startsWith('//'))
    expect(consoleErrorLines).toHaveLength(0)
  })
})

// ─── SIRI-UX-402: FilterBar dropdowns have role="menu" ──────────────────────
describe('SIRI-UX-402: KanbanBoard FilterBar — dropdown containers have role="menu"', () => {
  it('agentDropdown and priorityDropdown containers have role="menu"', () => {
    // Count role="menu" occurrences (task card menu + 2 filter dropdowns)
    const menuRoles = (kanbanSrc.match(/role="menu"/g) ?? []).length
    // Should have at least 3: task card menu + agent dropdown + priority dropdown
    expect(menuRoles).toBeGreaterThanOrEqual(3)
  })
})

// ─── SIRI-UX-403: agentStore.updateTaskStatus removed ───────────────────────
describe('SIRI-UX-403: agentStore — updateTaskStatus removed (dead code)', () => {
  it('useAgentStore does not expose updateTaskStatus', async () => {
    const { useAgentStore } = await import('../store/agentStore')
    const state = useAgentStore.getState() as unknown as Record<string, unknown>
    expect(state.updateTaskStatus).toBeUndefined()
  })

  it('agentStore source does not define updateTaskStatus', () => {
    expect(agentStoreSrc).not.toMatch(/updateTaskStatus\s*[:(]/)
  })
})

// ─── SIRI-UX-404: WarRoom resets runs on companyId change ───────────────────
describe('SIRI-UX-404: WarRoom.tsx — setRuns([]) called before fetch on companyId change', () => {
  it('WarRoom source resets runs before fetching for new company', () => {
    // setRuns([]) must appear before the fetch call in the REST effect
    const setRunsIdx = warRoomSrc.indexOf("setRuns([]) // SIRI-UX-404")
    const fetchIdx = warRoomSrc.indexOf("fetch(`${BASE_URL}/api/companies/${companyId}/runs`")
    expect(setRunsIdx).toBeGreaterThan(-1)
    expect(setRunsIdx).toBeLessThan(fetchIdx)
  })
})

// ─── SIRI-UX-405: closeCreateModal resets creating state ────────────────────
describe('SIRI-UX-405: KanbanBoard.closeCreateModal — resets creating=false on abort', () => {
  it('closeCreateModal calls setCreating(false) before hiding modal', () => {
    // The closeCreateModal function must contain setCreating(false) before setShowCreateModal(false)
    const closeModalBlock = kanbanSrc.substring(
      kanbanSrc.indexOf('const closeCreateModal = useCallback'),
      kanbanSrc.indexOf('const handleClose = useCallback'),
    )
    const setCreatingIdx = closeModalBlock.indexOf('setCreating(false)')
    const setShowIdx = closeModalBlock.indexOf('setShowCreateModal(false)')
    expect(setCreatingIdx).toBeGreaterThan(-1)
    expect(setCreatingIdx).toBeLessThan(setShowIdx)
  })
})
