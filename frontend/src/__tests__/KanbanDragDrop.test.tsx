import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
})

describe('UX-005: Kanban drag & drop', () => {
  it('task cards are draggable', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Drag me', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    const card = screen.getByTestId('task-card-t1')
    expect(card.getAttribute('draggable')).toBe('true')
  })

  it('columns show drop-zone indicator on drag over', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Drag me', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')
    fireEvent.dragOver(inProgressCol)
    // Should have visual indicator (border or background change)
    expect(inProgressCol.style.borderColor || inProgressCol.style.background).toBeTruthy()
  })

  it('dropping a task in another column sends PATCH to update status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Drag me', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const card = screen.getByTestId('task-card-t1')
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    fireEvent.dragOver(inProgressCol)
    fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => 't1' } })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/c1/tasks/t1'),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"in_progress"'),
        }),
      )
    })
  })

  it('optimistically updates UI on drop (task moves immediately)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Drag me', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const card = screen.getByTestId('task-card-t1')
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => 't1' } })

    // Task should immediately appear in new column (optimistic update)
    const store = useAgentStore.getState()
    expect(store.tasks.find((t) => t.id === 't1')?.status).toBe('in_progress')
  })

  it('rolls back on API error and shows error toast', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Drag me', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const card = screen.getByTestId('task-card-t1')
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => 't1' } })

    await waitFor(() => {
      // After rollback, task should be back in original column
      const store = useAgentStore.getState()
      expect(store.tasks.find((t) => t.id === 't1')?.status).toBe('todo')
    })

    // Error toast should appear
    await waitFor(() => {
      expect(screen.getByText(/failed to move task/i)).toBeInTheDocument()
    })
  })

  it('drop zone indicator disappears on drag leave', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Drag me', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    fireEvent.dragOver(inProgressCol)
    fireEvent.dragLeave(inProgressCol)

    // Border should be reset
    expect(inProgressCol.style.borderColor).not.toBe('#3b82f6')
  })
})
