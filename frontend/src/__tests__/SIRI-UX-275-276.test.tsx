/**
 * SIRI-UX-275: GlobalSearch Escape handler fires setOpen(false) even when dialog is closed
 * SIRI-UX-276: KanbanBoard Create Task modal Cancel button missing data-testid
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GlobalSearch from '../components/GlobalSearch'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

// --- Mocks ---
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('../context/ToastContext', () => ({
  useToast: () => mockToast,
}))

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [], currentCompany: null })
})

// SIRI-UX-276: Cancel button in Create Task modal must have data-testid
describe('SIRI-UX-276: Create Task modal Cancel button has data-testid', () => {
  it('Cancel button is findable by data-testid when modal is open', async () => {
    render(
      <MemoryRouter>
        <KanbanBoard companyId="test-co" isLoaded />
      </MemoryRouter>
    )

    // Open the create modal (empty state has CTA button)
    const newTaskBtn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(newTaskBtn)

    // Cancel button should have data-testid
    const cancelBtn = screen.getByTestId('create-task-cancel-btn')
    expect(cancelBtn).toBeTruthy()
    expect(cancelBtn.textContent).toBe('Cancel')
  })
})

// SIRI-UX-275: Escape when GlobalSearch is closed should not call setOpen / not throw
describe('SIRI-UX-275: GlobalSearch Escape listener guarded by open state', () => {
  it('renders trigger button when closed (dialog not visible)', () => {
    render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )
    // When closed, only the trigger button is visible
    expect(screen.getByTestId('global-search-trigger')).toBeTruthy()
    expect(screen.queryByTestId('global-search-overlay')).toBeNull()
  })

  it('Escape does not open the dialog when it is already closed', () => {
    render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )

    // Fire Escape while dialog is closed
    fireEvent.keyDown(document, { key: 'Escape' })

    // Dialog should still be closed — trigger still visible, overlay absent
    expect(screen.getByTestId('global-search-trigger')).toBeTruthy()
    expect(screen.queryByTestId('global-search-overlay')).toBeNull()
  })
})
