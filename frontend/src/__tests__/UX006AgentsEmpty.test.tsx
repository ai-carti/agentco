import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import CompanyPage from '../components/CompanyPage'
import { useAgentStore } from '../store/agentStore'
import { useAuthStore } from '../store/authStore'

// Mock WarRoomPage to avoid WS complexity
vi.mock('../components/WarRoomPage', () => ({
  default: () => <div data-testid="war-room-page">War Room Content</div>,
}))

vi.mock('../components/KanbanBoard', () => ({
  default: () => <div data-testid="kanban-board">Kanban Content</div>,
}))

beforeEach(() => {
  useAuthStore.setState({ token: 'tok' })
  useAgentStore.setState({ currentCompany: null, agents: [], tasks: [] })
  vi.clearAllMocks()
})

function setup(agents: { id: string; name: string; role: string; model: string }[] = []) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/agents')) {
      return Promise.resolve({ ok: true, json: async () => agents })
    }
    if (url.includes('/tasks')) {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
    return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'TestCo' }) })
  })

  return render(
    <MemoryRouter initialEntries={['/companies/c1']}>
      <Routes>
        <Route
          path="/companies/:id"
          element={
            <ToastProvider>
              <CompanyPage />
            </ToastProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('UX-006: No agents in company empty state', () => {
  it('shows "Add your first agent" when company has no agents', async () => {
    setup([])
    await waitFor(() => {
      expect(screen.getByText(/Add your first agent/i)).toBeInTheDocument()
    })
  })

  it('shows a CTA button to add an agent', async () => {
    setup([])
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add agent/i })).toBeInTheDocument()
    })
  })

  it('does NOT show "Add your first agent" when agents exist', async () => {
    setup([{ id: 'a1', name: 'CEO', role: 'Chief Executive', model: 'gpt-4o' }])
    await waitFor(() => {
      // War Room content should show instead
      expect(screen.getByTestId('war-room-page')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Add your first agent/i)).not.toBeInTheDocument()
  })

  it('clicking Add Agent CTA opens agent form modal', async () => {
    setup([])
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add agent/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    expect(screen.getByTestId('agent-form-modal')).toBeInTheDocument()
  })
})
