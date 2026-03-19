import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import { useAgentStore } from '../store/agentStore'
import KanbanBoard from '../components/KanbanBoard'
import AgentPage from '../components/AgentPage'

function renderWithProviders(ui: React.ReactElement, path = '/companies/co1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </MemoryRouter>
  )
}

function renderAgentPage(companyId = 'co1', agentId = 'agent-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  )
}

// SIRI-UX-047: Run button should update task status to in_progress after successful run
describe('SIRI-UX-047: Run button updates task status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAgentStore.setState({
      tasks: [
        { id: 'task-1', title: 'Test Task', status: 'todo', assignee_id: undefined, assignee_name: undefined },
      ],
      agents: [],
    })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('updates task status to in_progress after successful run', async () => {
    renderWithProviders(<KanbanBoard companyId="co1" isLoaded />)
    const runBtn = screen.getByTestId('run-btn-task-1')
    fireEvent.click(runBtn)
    await waitFor(() => {
      const tasks = useAgentStore.getState().tasks
      expect(tasks[0].status).toBe('in_progress')
    })
  })

  it('hides Run button after task status becomes in_progress', async () => {
    renderWithProviders(<KanbanBoard companyId="co1" isLoaded />)
    const runBtn = screen.getByTestId('run-btn-task-1')
    fireEvent.click(runBtn)
    await waitFor(() => {
      expect(screen.queryByTestId('run-btn-task-1')).not.toBeInTheDocument()
    })
  })
})

// SIRI-UX-048: Create Task modal should have priority selector
describe('SIRI-UX-048: Create task with priority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAgentStore.setState({ tasks: [], agents: [] })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-task', title: 'New Task', status: 'todo', priority: 'high' }),
    })
  })

  it('shows priority selector in Create Task modal', async () => {
    renderWithProviders(<KanbanBoard companyId="co1" isLoaded />)
    const btn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByTestId('create-task-modal')).toBeInTheDocument()
      expect(screen.getByTestId('create-task-priority-select')).toBeInTheDocument()
    })
  })

  it('includes priority in POST body when creating task', async () => {
    renderWithProviders(<KanbanBoard companyId="co1" isLoaded />)
    fireEvent.click(screen.getByTestId('kanban-new-task-btn'))
    await waitFor(() => screen.getByTestId('create-task-modal'))

    fireEvent.change(screen.getByTestId('create-task-title-input'), { target: { value: 'My Task' } })
    fireEvent.change(screen.getByTestId('create-task-priority-select'), { target: { value: 'high' } })
    fireEvent.click(screen.getByTestId('create-task-submit-btn'))

    await waitFor(() => {
      const callBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(callBody.priority).toBe('high')
    })
  })
})

// SIRI-UX-051: Save to Library button should be disabled after saving
describe('SIRI-UX-051: Save to Library disabled after save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/memory')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/library')) return Promise.resolve({ ok: true, json: async () => ({}) })
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'agent-1', name: 'CEO', role: 'Chief Executive Officer', model: 'gpt-4o' }),
      })
    })
  })

  it('disables Save to Library button after successful save', async () => {
    renderAgentPage()

    const saveBtn = await screen.findByTestId('save-to-library-btn')
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(screen.getByTestId('save-to-library-success')).toBeInTheDocument()
    })
    const btnAfter = screen.getByTestId('save-to-library-btn') as HTMLButtonElement
    expect(btnAfter.disabled).toBe(true)
  })
})
