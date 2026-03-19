import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'
import { ToastProvider } from '../context/ToastContext'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({ tasks: [], agents: [] })
})

// =====================================================================
// SIRI-UX-059: AgentPage — error state when agent fetch fails
// =====================================================================
describe('SIRI-UX-059: AgentPage shows error state on 404/fetch failure', () => {
  function renderAgentPage(agentId = 'bad-agent', companyId = 'c1') {
    return render(
      <ToastProvider>
        <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}`]}>
          <Routes>
            <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    )
  }

  it('shows error/not-found state when agent returns 404', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/memory')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
      // Main agent fetch returns 404
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ detail: 'Not found' }) })
    })

    renderAgentPage()

    await waitFor(() => {
      expect(screen.getByTestId('agent-not-found')).toBeInTheDocument()
    })
  })

  it('shows error state when agent fetch throws network error', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/memory')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
      return Promise.reject(new Error('Network error'))
    })

    renderAgentPage()

    await waitFor(() => {
      expect(screen.getByTestId('agent-not-found')).toBeInTheDocument()
    })
  })
})

// =====================================================================
// SIRI-UX-061: KanbanBoard modals close on Escape key
// =====================================================================
describe('SIRI-UX-061: KanbanBoard modals close on Escape key', () => {
  function renderKanban() {
    return render(
      <ToastProvider>
        <KanbanBoard companyId="c1" isLoaded={true} />
      </ToastProvider>,
    )
  }

  it('closes Create Task modal on Escape key', async () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Task 1', status: 'todo', assignee_id: undefined, assignee_name: undefined }],
      agents: [],
    })
    renderKanban()

    // Open create modal
    const newTaskBtn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(newTaskBtn)

    // Modal should be open
    await waitFor(() => {
      expect(screen.getByTestId('create-task-modal')).toBeInTheDocument()
    })

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' })

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByTestId('create-task-modal')).not.toBeInTheDocument()
    })
  })
})
