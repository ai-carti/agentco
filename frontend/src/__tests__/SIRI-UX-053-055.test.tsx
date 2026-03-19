/**
 * SIRI-UX-053: TypeScript null vs undefined in task test fixtures
 * SIRI-UX-054: act() warnings in AgentPage tests
 * SIRI-UX-055: KanbanBoard task menu items not keyboard-accessible
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import { useAgentStore } from '../store/agentStore'
import KanbanBoard from '../components/KanbanBoard'
import AgentPage from '../components/AgentPage'

function renderKanban(tasks = [{ id: 't1', title: 'Fix Bug', status: 'todo' as const, assignee_id: undefined, assignee_name: undefined }]) {
  useAgentStore.setState({ tasks, agents: [] })
  return render(
    <MemoryRouter initialEntries={['/companies/co1']}>
      <ToastProvider>
        <KanbanBoard companyId="co1" isLoaded />
      </ToastProvider>
    </MemoryRouter>
  )
}

// SIRI-UX-053: Task type should use string | undefined, not null
describe('SIRI-UX-053: Task type compatibility', () => {
  it('assigns tasks with undefined (not null) assignee fields without TS errors', () => {
    const tasks = [
      { id: 't1', title: 'Task', status: 'todo' as const, assignee_id: undefined, assignee_name: undefined },
    ]
    useAgentStore.setState({ tasks, agents: [] })
    const task = useAgentStore.getState().tasks[0]
    expect(task.assignee_id).toBeUndefined()
    expect(task.assignee_name).toBeUndefined()
  })

  it('renders task card without crashing when assignee_id is undefined', () => {
    renderKanban()
    expect(screen.getByTestId('task-card-t1')).toBeInTheDocument()
  })
})

// SIRI-UX-054: AgentPage fetch state updates should not produce act() warnings
describe('SIRI-UX-054: AgentPage act() compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderAgentPage() {
    return render(
      <MemoryRouter initialEntries={['/companies/co1/agents/a1']}>
        <Routes>
          <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('resolves all async state updates before assertions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'a1', name: 'Alice-Agent', role: 'Engineer', model: 'gpt-4o', system_prompt: 'Be helpful' }),
    })
    renderAgentPage()
    // Wait for all three parallel fetches to complete
    await waitFor(() => {
      expect(screen.getByTestId('agent-name-display')).toBeInTheDocument()
    })
    expect(screen.getByTestId('agent-name-display')).toHaveTextContent('Alice-Agent')
  })

  it('handles fetch error without leaving pending state updates', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    renderAgentPage()
    // After error, skeleton should be gone and the agent page is still mounted
    await waitFor(() => {
      expect(screen.getByTestId('agent-page')).toBeInTheDocument()
    })
  })
})

// SIRI-UX-055: KanbanBoard task menu items should be <button> elements for keyboard nav
describe('SIRI-UX-055: Task menu items keyboard accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('opens task context menu on click', () => {
    renderKanban()
    const menuBtn = screen.getByTestId('task-menu-t1')
    fireEvent.click(menuBtn)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Assign')).toBeInTheDocument()
  })

  it('menu action items are buttons (keyboard-focusable)', () => {
    renderKanban()
    const menuBtn = screen.getByTestId('task-menu-t1')
    fireEvent.click(menuBtn)
    // All three menu items must be <button> elements (role=menuitem) for keyboard access
    const editBtn = screen.getByRole('menuitem', { name: /edit/i })
    const deleteBtn = screen.getByRole('menuitem', { name: /delete/i })
    const assignBtn = screen.getByRole('menuitem', { name: /assign/i })
    expect(editBtn.tagName).toBe('BUTTON')
    expect(deleteBtn.tagName).toBe('BUTTON')
    expect(assignBtn.tagName).toBe('BUTTON')
  })

  it('Edit menu item opens edit modal via keyboard Enter', () => {
    renderKanban()
    const menuBtn = screen.getByTestId('task-menu-t1')
    fireEvent.click(menuBtn)
    const editBtn = screen.getByRole('menuitem', { name: /edit/i })
    fireEvent.keyDown(editBtn, { key: 'Enter', code: 'Enter' })
    // edit modal should open
    expect(screen.getByTestId('edit-task-modal')).toBeInTheDocument()
  })
})
