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
  localStorage.clear()
})

describe('FE-004: KanbanBoard a11y + rollback + localStorage persist', () => {
  it('drag handle has aria-grabbed attribute', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Task One', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    const card = screen.getByTestId('task-card-t1')
    expect(card).toHaveAttribute('aria-grabbed')
  })

  it('kanban column has aria-dropeffect attribute', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Task One', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    const col = screen.getByTestId('kanban-column-in_progress')
    expect(col).toHaveAttribute('aria-dropeffect')
  })

  it('rollback: drag + API 500 → task returns to original column', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Task One', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const card = screen.getByTestId('task-card-t1')
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => 't1' } })

    await waitFor(() => {
      const store = useAgentStore.getState()
      expect(store.tasks.find((t) => t.id === 't1')?.status).toBe('todo')
    })

    // Toast error should appear
    await waitFor(() => {
      expect(screen.getByText(/failed to move task/i)).toBeInTheDocument()
    })
  })

  it('saves task order to localStorage on drag drop (success)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [
        { id: 't1', title: 'Task One', status: 'todo', assignee_name: 'Alice' },
        { id: 't2', title: 'Task Two', status: 'todo', assignee_name: 'Bob' },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const card = screen.getByTestId('task-card-t1')
    const inProgressCol = screen.getByTestId('kanban-column-in_progress')

    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    fireEvent.drop(inProgressCol, { dataTransfer: { getData: () => 't1' } })

    await waitFor(() => {
      const stored = localStorage.getItem('kanban-task-order-c1')
      expect(stored).not.toBeNull()
      const order = JSON.parse(stored!)
      expect(Array.isArray(order)).toBe(true)
    })
  })

  it('aria-grabbed becomes true during drag', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Task One', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    const card = screen.getByTestId('task-card-t1')
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn(), getData: () => 't1' } })
    expect(card).toHaveAttribute('aria-grabbed', 'true')
  })
})
