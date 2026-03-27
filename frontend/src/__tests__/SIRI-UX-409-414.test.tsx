/**
 * Tests for SIRI-UX-409 through SIRI-UX-414 — Siri self-audit cycle 5 (2026-03-26)
 *
 * Uses import.meta.glob with ?raw to read source as strings (Vite-native, no @types/node needed).
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import TaskDetailSidebar from '../components/TaskDetailSidebar'
import { useAgentStore } from '../store/agentStore'
import type { Task } from '../store/agentStore'

// Load source files as raw strings via Vite's ?raw import
const components = import.meta.glob('../components/*.tsx', { query: '?raw', import: 'default', eager: true })
const hooks = import.meta.glob('../hooks/*.ts', { query: '?raw', import: 'default', eager: true })

const companiesSrc = components['../components/CompaniesPage.tsx'] as string
const agentPageSrc = components['../components/AgentPage.tsx'] as string
const taskDetailSrc = components['../components/TaskDetailSidebar.tsx'] as string
const warRoomPageSrc = components['../components/WarRoomPage.tsx'] as string
const warRoomSocketSrc = hooks['../hooks/useWarRoomSocket.ts'] as string

// ─── SIRI-UX-409: CompaniesPage New Company modal Cancel uses <Button> ────────
describe('SIRI-UX-409: CompaniesPage modal Cancel uses Button component', () => {
  it('Cancel button in New Company modal uses Button variant="secondary"', () => {
    // Should NOT use raw <button> for the Cancel action in the modal
    // Old pattern: <button onClick={() => { setShowNewModal(false); setNewName('') }}
    // New pattern: <Button variant="secondary" ...>Cancel</Button>
    const lines = companiesSrc.split('\n')
    // Look for Button component usage in modal context (after line with showNewModal)
    const modalLines = lines.slice(lines.findIndex((l) => l.includes('showNewModal')))
    // The cancel action inside the modal should use <Button variant="secondary"
    const hasCancelButton = modalLines.some((l) =>
      l.includes('Button') && l.includes('variant="secondary"') && !l.trim().startsWith('//')
    )
    expect(hasCancelButton).toBe(true)
  })

  it('Create button in New Company modal has aria-disabled matching disabled prop', () => {
    // Button should have aria-disabled for AT users to know the button is inactive when disabled
    // Search for new-company-create-btn context
    const createBtnIndex = companiesSrc.indexOf('new-company-create-btn')
    const createBtnContext = companiesSrc.slice(createBtnIndex, createBtnIndex + 300)
    expect(createBtnContext).toContain('aria-disabled')
  })
})

// ─── SIRI-UX-410: AgentPage.handleSaveToLibrary guards undefined agentId ──────
describe('SIRI-UX-410: AgentPage handleSaveToLibrary — guards undefined agentId', () => {
  it('handleSaveToLibrary has early return guard when agentId is falsy', () => {
    // Find handleSaveToLibrary in source and check for agentId guard
    const fnIndex = agentPageSrc.indexOf('handleSaveToLibrary')
    const fnBody = agentPageSrc.slice(fnIndex, fnIndex + 500)
    // Should have: if (!agentId) return  OR  if (!agentId || !companyId) return
    const hasGuard = fnBody.includes('!agentId')
    expect(hasGuard).toBe(true)
  })
})

// ─── SIRI-UX-411: TaskDetailSidebar close button aria-label is descriptive ────
describe('SIRI-UX-411: TaskDetailSidebar sidebar-close-btn — descriptive aria-label', () => {
  it('sidebar-close-btn source has descriptive aria-label (not just "Close")', () => {
    // The close button aria-label should be "Close task details" not just "Close"
    const closeBtnIndex = taskDetailSrc.indexOf('sidebar-close-btn')
    const closeBtnContext = taskDetailSrc.slice(closeBtnIndex, closeBtnIndex + 200)
    // Should have a descriptive label, not generic "Close"
    expect(closeBtnContext).toContain('aria-label="Close task details"')
    expect(closeBtnContext).not.toContain('aria-label="Close"')
  })

  it('sidebar-close-btn renders with descriptive aria-label in DOM', () => {
    const mockTask: Task = {
      id: 'task-1',
      title: 'Test task',
      status: 'todo',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    }))
    useAgentStore.setState({ tasks: [mockTask] })
    render(
      <TaskDetailSidebar task={mockTask} companyId="co-1" onClose={vi.fn()} />,
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> }
    )
    const closeBtn = screen.getByTestId('sidebar-close-btn')
    expect(closeBtn).toHaveAttribute('aria-label', 'Close task details')
    vi.unstubAllGlobals()
  })
})

// ─── SIRI-UX-412: useWarRoomSocket INITIAL_BACKOFF_MS constant ───────────────
describe('SIRI-UX-412: useWarRoomSocket — INITIAL_BACKOFF_MS named constant', () => {
  it('useWarRoomSocket.ts defines INITIAL_BACKOFF_MS as module-level constant', () => {
    // Magic number 1000 for initial backoff should be a named constant
    expect(warRoomSocketSrc).toContain('INITIAL_BACKOFF_MS')
  })

  it('retryDelayRef is initialized with INITIAL_BACKOFF_MS (not raw 1000)', () => {
    // retryDelayRef.current = <number> should use INITIAL_BACKOFF_MS
    const retryInitIndex = warRoomSocketSrc.indexOf('retryDelayRef')
    const retryContext = warRoomSocketSrc.slice(retryInitIndex, retryInitIndex + 100)
    // Should reference INITIAL_BACKOFF_MS, not hardcode 1000
    expect(retryContext).toContain('INITIAL_BACKOFF_MS')
  })

  it('backoff reset in ws.onopen uses INITIAL_BACKOFF_MS (not raw 1000)', () => {
    // ws.onopen resets retryDelayRef.current = 1000 → should use INITIAL_BACKOFF_MS
    const onopenIndex = warRoomSocketSrc.indexOf('ws.onopen')
    const onopenBody = warRoomSocketSrc.slice(onopenIndex, onopenIndex + 500)
    expect(onopenBody).toContain('INITIAL_BACKOFF_MS')
    // Verify raw 1000 is not used inside onopen as a reset value
    // (INITIAL_BACKOFF_MS const definition itself has 1000 but that's fine)
    const hasBareThousand = onopenBody.includes('= 1000') || onopenBody.includes('= 1_000')
    expect(hasBareThousand).toBe(false)
  })
})

// ─── SIRI-UX-413: WarRoomPage mock interval uses store.addMessage, store.updateAgentStatus ──
describe('SIRI-UX-413: WarRoomPage mock interval — uses getState() not subscription closure', () => {
  it('mock interval callback calls store.addMessage (via getState()) not closure addMessage', () => {
    // Find the setInterval callback block
    const intervalIdx = warRoomPageSrc.indexOf('setInterval(')
    const intervalBody = warRoomPageSrc.slice(intervalIdx, intervalIdx + 600)
    // Should use store.addMessage, not standalone addMessage(
    // After fix: store = useWarRoomStore.getState(); store.addMessage(...)
    expect(intervalBody).toContain('store.addMessage')
  })

  it('mock interval callback calls store.updateAgentStatus (via getState()) not closure', () => {
    const intervalIdx = warRoomPageSrc.indexOf('setInterval(')
    const intervalBody = warRoomPageSrc.slice(intervalIdx, intervalIdx + 600)
    expect(intervalBody).toContain('store.updateAgentStatus')
  })

  it('mock interval effect does not require eslint-disable for exhaustive-deps', () => {
    // After fix, addMessage/updateAgentStatus are no longer in closure
    // so the eslint-disable comment should be removed from that effect
    // Find the interval effect
    const intervalEffectIdx = warRoomPageSrc.indexOf('agents.length === 0') 
    const effectBlock = warRoomPageSrc.slice(intervalEffectIdx, intervalEffectIdx + 800)
    // The effect deps array [agents.length, isConnected] should not need eslint-disable
    expect(effectBlock).not.toContain('eslint-disable-line react-hooks/exhaustive-deps')
  })
})

// ─── SIRI-UX-414: WarRoomPage activity-feed region has direct aria-label ─────
describe('SIRI-UX-414: WarRoomPage activity-feed region — aria-label instead of aria-labelledby', () => {
  it('activity-feed region uses aria-label="Activity Feed" directly (not aria-labelledby)', () => {
    // The region previously used aria-labelledby pointing to a div that also contained
    // the LIVE badge, causing the computed label to be "Activity Feed LIVE" when running.
    // Fix: use aria-label="Activity Feed" directly on the region div.
    const feedRegionIdx = warRoomPageSrc.indexOf('activity-feed')
    const feedRegionCtx = warRoomPageSrc.slice(feedRegionIdx, feedRegionIdx + 400)
    expect(feedRegionCtx).toContain('aria-label="Activity Feed"')
  })

  it('activity-feed region does NOT use aria-labelledby (which included LIVE badge text)', () => {
    // Find the activity-feed testid context
    const feedRegionIdx = warRoomPageSrc.indexOf('"activity-feed"')
    const feedRegionCtx = warRoomPageSrc.slice(feedRegionIdx, feedRegionIdx + 400)
    // Should not have aria-labelledby on the region now
    expect(feedRegionCtx).not.toContain('aria-labelledby="activity-feed-heading"')
  })
})
