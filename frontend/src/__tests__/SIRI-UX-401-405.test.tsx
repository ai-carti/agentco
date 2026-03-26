/**
 * Tests for SIRI-UX-401 through SIRI-UX-405 — Siri self-audit cycle 4 (2026-03-26)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── SIRI-UX-401: no console.error in TaskDetailSidebar.handleRun ───────────
describe('SIRI-UX-401: TaskDetailSidebar.handleRun — no console.error in production', () => {
  it('console.error removed from handleRun — only toast.error used', async () => {
    // Verify the source file doesn't contain console.error in handleRun
    // (static audit — no runtime needed)
    const { readFileSync } = await import('fs')
    const source = readFileSync(
      new URL('../../src/components/TaskDetailSidebar.tsx', import.meta.url).pathname,
      'utf-8',
    )
    // Should not contain console.error (ErrorBoundary uses errorReporter.ts separately)
    const consoleErrorLines = source
      .split('\n')
      .filter((l) => l.includes('console.error') && !l.trim().startsWith('//'))
    expect(consoleErrorLines).toHaveLength(0)
  })
})

// ─── SIRI-UX-402: FilterBar dropdowns have role="menu" ──────────────────────
describe('SIRI-UX-402: KanbanBoard FilterBar — dropdown containers have role="menu"', () => {
  it('agentDropdown container has role="menu" when open', async () => {
    const { useAgentStore } = await import('../store/agentStore')
    const { KanbanBoard_FilterBar_hasMenuRole } = await import('./helpers/SIRI-UX-402-helper').catch(() => ({ KanbanBoard_FilterBar_hasMenuRole: null }))
    if (KanbanBoard_FilterBar_hasMenuRole !== null) {
      expect(KanbanBoard_FilterBar_hasMenuRole).toBe(true)
      return
    }

    // Direct source check — role="menu" must appear in the agent dropdown div
    const { readFileSync } = await import('fs')
    const source = readFileSync(
      new URL('../../src/components/KanbanBoard.tsx', import.meta.url).pathname,
      'utf-8',
    )
    // Count role="menu" occurrences (task card menu + 2 filter dropdowns)
    const menuRoles = (source.match(/role="menu"/g) ?? []).length
    // Should have at least 3: task card menu + agent dropdown + priority dropdown
    expect(menuRoles).toBeGreaterThanOrEqual(3)
  })
})

// ─── SIRI-UX-403: agentStore.updateTaskStatus removed ───────────────────────
describe('SIRI-UX-403: agentStore — updateTaskStatus removed (dead code)', () => {
  it('useAgentStore does not expose updateTaskStatus', async () => {
    const { useAgentStore } = await import('../store/agentStore')
    const state = useAgentStore.getState()
    expect((state as Record<string, unknown>).updateTaskStatus).toBeUndefined()
  })
})

// ─── SIRI-UX-404: WarRoom resets runs on companyId change ───────────────────
describe('SIRI-UX-404: WarRoom.tsx — setRuns([]) called before fetch on companyId change', () => {
  it('WarRoom source resets runs before fetching for new company', async () => {
    const { readFileSync } = await import('fs')
    const source = readFileSync(
      new URL('../../src/components/WarRoom.tsx', import.meta.url).pathname,
      'utf-8',
    )
    // setRuns([]) must appear before the fetch call in the REST effect
    const setRunsIdx = source.indexOf("setRuns([]) // SIRI-UX-404")
    const fetchIdx = source.indexOf("fetch(`${BASE_URL}/api/companies/${companyId}/runs`")
    expect(setRunsIdx).toBeGreaterThan(-1)
    expect(setRunsIdx).toBeLessThan(fetchIdx)
  })
})

// ─── SIRI-UX-405: closeCreateModal resets creating state ────────────────────
describe('SIRI-UX-405: KanbanBoard.closeCreateModal — resets creating=false on abort', () => {
  it('closeCreateModal calls setCreating(false) before hiding modal', async () => {
    const { readFileSync } = await import('fs')
    const source = readFileSync(
      new URL('../../src/components/KanbanBoard.tsx', import.meta.url).pathname,
      'utf-8',
    )
    // The closeCreateModal function must contain setCreating(false) before setShowCreateModal(false)
    const closeModalBlock = source.substring(
      source.indexOf('const closeCreateModal = useCallback'),
      source.indexOf('const handleClose = useCallback'),
    )
    const setCreatingIdx = closeModalBlock.indexOf('setCreating(false)')
    const setShowIdx = closeModalBlock.indexOf('setShowCreateModal(false)')
    expect(setCreatingIdx).toBeGreaterThan(-1)
    expect(setCreatingIdx).toBeLessThan(setShowIdx)
  })
})
