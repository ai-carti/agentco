/**
 * SIRI-UX-376: WarRoomPage — companyId undefined shows error state, no WS connection
 * SIRI-UX-377: KanbanBoard Create Task button — aria-disabled attribute
 * SIRI-UX-381: CompanyPage — tab panel IDs namespaced per companyId
 *
 * Uses import.meta.glob with ?raw to read source without Node.js fs/path APIs
 * (tsconfig targets browser, no @types/node available).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useWarRoomStore } from '../store/warRoomStore'
import CompanyPage from '../components/CompanyPage'

// Source files via ?raw imports (no Node.js fs/path needed)
const warRoomModules = import.meta.glob('../components/WarRoomPage.tsx', { query: '?raw', import: 'default', eager: true })
const warRoomSrc: string = warRoomModules['../components/WarRoomPage.tsx'] as string

const kanbanModules = import.meta.glob('../components/KanbanBoard.tsx', { query: '?raw', import: 'default', eager: true })
const kanbanSrc: string = kanbanModules['../components/KanbanBoard.tsx'] as string

const companyModules = import.meta.glob('../components/CompanyPage.tsx', { query: '?raw', import: 'default', eager: true })
const companySrc: string = companyModules['../components/CompanyPage.tsx'] as string

// Mocks needed for CompanyPage (must be top-level — vi.mock is hoisted)
vi.mock('../components/WarRoomPage', () => ({
  default: () => <div data-testid="war-room-page">War Room</div>,
}))
vi.mock('../components/KanbanBoard', () => ({
  default: () => <div data-testid="kanban-board">Board</div>,
}))
vi.mock('../components/AgentCard', () => ({
  default: ({ agent }: { agent: { id: string; name: string } }) => (
    <div data-testid={`agent-card-${agent.id}`}>{agent.name}</div>
  ),
}))
vi.mock('../components/AgentForm', () => ({
  default: ({ onSubmit }: { onSubmit: (d: unknown) => void }) => (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({}) }}>
      <button type="submit">Submit</button>
    </form>
  ),
}))
vi.mock('../components/EmptyState', () => ({
  default: ({ ctaLabel, onCTA }: { ctaLabel?: string; onCTA?: () => void }) => (
    <div data-testid="empty-state">
      {ctaLabel && <button onClick={onCTA}>{ctaLabel}</button>}
    </div>
  ),
}))
vi.mock('../api/client', () => ({
  getStoredToken: vi.fn(() => null),
  BASE_URL: 'http://localhost:8000',
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../store/agentStore', () => ({
  useAgentStore: vi.fn((selector: (s: unknown) => unknown) => {
    const store = {
      agents: [],
      tasks: [],
      currentCompany: { id: 'company-abc', name: 'Test Co' },
      setCurrentCompany: vi.fn(),
      setTasks: vi.fn(),
      setAgents: vi.fn(),
      setActiveCompanyTab: vi.fn(),
    }
    return selector(store)
  }),
}))

// ── SIRI-UX-376: WarRoomPage companyId guard ────────────────────────────────
describe('SIRI-UX-376: WarRoomPage — companyId guard', () => {
  it('WarRoomPage source no longer contains ?? mock-company fallback', () => {
    expect(warRoomSrc).not.toContain("?? 'mock-company'")
    expect(warRoomSrc).toContain("companyId ?? ''")
    expect(warRoomSrc).toContain('war-room-no-company')
    expect(warRoomSrc).toContain('Company not found')
  })

  it('useWarRoomSocket does not connect when called with empty string', async () => {
    const wsInstances: unknown[] = []
    const MockWebSocket = vi.fn().mockImplementation(() => {
      const inst = { onopen: null, onmessage: null, onerror: null, onclose: null, close: vi.fn() }
      wsInstances.push(inst)
      return inst
    })
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
    useWarRoomStore.getState().reset()

    const { renderHook, act } = await import('@testing-library/react')
    const { useWarRoomSocket } = await import('../hooks/useWarRoomSocket')

    await act(async () => {
      renderHook(() => useWarRoomSocket(''))
    })

    expect(wsInstances.length).toBe(0)
    vi.restoreAllMocks()
  })
})

// ── SIRI-UX-377: KanbanBoard Create Task button — aria-disabled ──────────────
describe('SIRI-UX-377: KanbanBoard — aria-disabled on create submit button', () => {
  it('KanbanBoard source contains aria-disabled on create submit button', () => {
    expect(kanbanSrc).toContain('aria-disabled={creating || !newTaskTitle.trim()}')
    expect(kanbanSrc).toContain('data-testid="create-task-submit-btn"')
  })
})

// ── SIRI-UX-381: CompanyPage tab IDs namespaced per companyId ──────────────
describe('SIRI-UX-381: CompanyPage — tab IDs contain companyId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'company-abc', name: 'Test Co' }),
    })
  })

  function renderWithCompany(companyId: string) {
    return render(
      <MemoryRouter initialEntries={[`/companies/${companyId}`]}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('tab button IDs include companyId', async () => {
    renderWithCompany('company-abc')

    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      expect(tabs.length).toBeGreaterThan(0)
      for (const tab of tabs) {
        expect(tab.getAttribute('id')).toContain('company-abc')
      }
    })
  })

  it('tabpanel aria-labelledby values include companyId', async () => {
    renderWithCompany('company-abc')

    await waitFor(() => {
      const tabpanels = screen.getAllByRole('tabpanel', { hidden: true })
      expect(tabpanels.length).toBeGreaterThan(0)
      for (const panel of tabpanels) {
        const labelledBy = panel.getAttribute('aria-labelledby')
        expect(labelledBy).toContain('company-abc')
      }
    })
  })

  it('tabpanel IDs include companyId', async () => {
    renderWithCompany('company-abc')

    await waitFor(() => {
      const tabpanels = screen.getAllByRole('tabpanel', { hidden: true })
      expect(tabpanels.length).toBeGreaterThan(0)
      for (const panel of tabpanels) {
        expect(panel.getAttribute('id')).toContain('company-abc')
      }
    })
  })

  it('CompanyPage source uses namespaced tab IDs', () => {
    expect(companySrc).toContain('id={`tab-${id}-${tab.id}`}')
    expect(companySrc).toContain('aria-controls={`tabpanel-${id}-${tab.id}`}')
    expect(companySrc).toContain('id={`tabpanel-${id}-war-room`}')
    expect(companySrc).toContain('aria-labelledby={`tab-${id}-war-room`}')
    expect(companySrc).not.toContain('id="tab-war-room"')
    expect(companySrc).not.toContain('aria-labelledby="tab-war-room"')
  })
})
