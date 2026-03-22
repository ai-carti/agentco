import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// Reset store before each test
beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
})

describe('KanbanBoard', () => {
  it('renders without crash', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
  })

  it('shows default columns', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByText(/todo/i)).toBeInTheDocument()
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
    expect(screen.getAllByText(/done/i).length).toBeGreaterThan(0)
  })

  it('renders task title, assignee_name, and status badge', () => {
    useAgentStore.setState({
      tasks: [
        {
          id: 't1',
          title: 'Build login page',
          status: 'todo',
          assignee_id: 'a1',
          assignee_name: 'Alice',
        },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByText('Build login page')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    // status badge
    expect(screen.getByTestId('status-badge-t1')).toBeInTheDocument()
  })

  it('renders assignee avatar initial', () => {
    useAgentStore.setState({
      tasks: [
        {
          id: 't2',
          title: 'Deploy to prod',
          status: 'in_progress',
          assignee_id: 'a2',
          assignee_name: 'Bob',
        },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('assignee-avatar-t2')).toHaveTextContent('B')
  })

  it('renders Run button on each task card', () => {
    useAgentStore.setState({
      tasks: [
        { id: 't3', title: 'Task X', status: 'todo', assignee_name: 'Carol' },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('run-btn-t3')).toBeInTheDocument()
  })

  it('clicking Run button calls POST /api/companies/{id}/tasks/{id}/run', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 't4', title: 'Task Y', status: 'todo', assignee_name: 'Dave' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('run-btn-t4'))
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/c1/tasks/t4/run'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  // BUG-023: skeleton loading state
  it('renders skeleton cards when isLoaded=false', () => {
    renderWithToast(<KanbanBoard companyId="c1" isLoaded={false} />)
    const skeletons = screen.getAllByTestId('skeleton-task')
    // 4 columns × 3 skeletons = 12
    expect(skeletons.length).toBe(12)
  })

  it('does not render skeleton when isLoaded=true', () => {
    renderWithToast(<KanbanBoard companyId="c1" isLoaded={true} />)
    expect(screen.queryByTestId('skeleton-task')).not.toBeInTheDocument()
  })

  it('does not show empty state while loading (isLoaded=false)', () => {
    renderWithToast(<KanbanBoard companyId="c1" isLoaded={false} />)
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument()
  })

  it('clicking card (not Run button) opens side panel', () => {
    useAgentStore.setState({
      tasks: [
        {
          id: 't5',
          title: 'Task Z',
          description: 'Full description here',
          status: 'todo',
          assignee_name: 'Eve',
        },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('task-card-t5'))
    expect(screen.getByTestId('task-detail-sidebar')).toBeInTheDocument()
    // description appears in both card preview and sidebar — check at least one exists
    expect(screen.getAllByText('Full description here').length).toBeGreaterThanOrEqual(1)
  })

  it('side panel closes on Escape key', () => {
    useAgentStore.setState({
      tasks: [{ id: 't6', title: 'Task W', status: 'todo', assignee_name: 'Frank' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('task-card-t6'))
    expect(screen.getByTestId('task-detail-sidebar')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('task-detail-sidebar')).not.toBeInTheDocument()
  })

  it('side panel closes when clicking overlay', () => {
    useAgentStore.setState({
      tasks: [{ id: 't7', title: 'Task V', status: 'todo', assignee_name: 'Grace' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('task-card-t7'))
    expect(screen.getByTestId('task-detail-sidebar')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sidebar-backdrop'))
    expect(screen.queryByTestId('task-detail-sidebar')).not.toBeInTheDocument()
  })

  // BUG-050: Escape closes Edit Task modal in TaskCard
  it('Escape closes Edit Task modal in TaskCard', async () => {
    useAgentStore.setState({
      tasks: [{ id: 't8', title: 'Task Edit Escape', status: 'todo', assignee_name: 'Hank' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    // open menu
    fireEvent.click(screen.getByTestId('task-menu-t8'))
    // click Edit
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(screen.getByTestId('edit-task-modal')).toBeInTheDocument()
    // press Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('edit-task-modal')).not.toBeInTheDocument()
  })

  // BUG-050: Escape closes Delete confirm dialog in TaskCard
  it('Escape closes Delete confirm dialog in TaskCard', async () => {
    useAgentStore.setState({
      tasks: [{ id: 't9', title: 'Task Delete Escape', status: 'todo', assignee_name: 'Iris' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    // open menu
    fireEvent.click(screen.getByTestId('task-menu-t9'))
    // click Delete
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByTestId('confirm-delete-dialog')).toBeInTheDocument()
    // press Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument()
  })

  // SIRI-POST-005: storage event cross-tab sync
  it('SIRI-POST-005: updates task order when storage event fires from another tab', async () => {
    useAgentStore.setState({
      tasks: [
        { id: 'ta', title: 'Task A', status: 'todo', assignee_name: 'Alice' },
        { id: 'tb', title: 'Task B', status: 'todo', assignee_name: 'Bob' },
        { id: 'tc', title: 'Task C', status: 'todo', assignee_name: 'Carol' },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Simulate another tab writing a reordered key
    const newOrder = ['tc', 'ta', 'tb']
    const storageEvent = new StorageEvent('storage', {
      key: 'kanban-task-order-c1',
      newValue: JSON.stringify(newOrder),
      storageArea: window.localStorage,
    })

    await act(async () => {
      window.dispatchEvent(storageEvent)
    })

    // After sync, tasks in todo column should reflect new order: tc first, then ta, then tb
    const todoColumn = screen.getByTestId('kanban-column-todo')
    const cards = todoColumn.querySelectorAll('[data-testid^="task-card-"]')
    const ids = Array.from(cards).map((c) => c.getAttribute('data-testid')?.replace('task-card-', ''))
    expect(ids).toEqual(['tc', 'ta', 'tb'])
  })

  // --- SIRI-UX-130: filter buttons must use role="menuitemcheckbox" for aria-checked ---
  it('SIRI-UX-130: agent filter options have role=menuitemcheckbox', () => {
    useAgentStore.setState({
      agents: [{ id: 'a1', name: 'Alice', role: 'dev', status: 'idle', tasks: [] }],
      tasks: [],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const agentFilterBtn = screen.getByTestId('filter-agent-btn')
    fireEvent.click(agentFilterBtn)

    const agentOption = screen.getByTestId('filter-agent-option-a1')
    expect(agentOption).toHaveAttribute('role', 'menuitemcheckbox')
  })

  it('SIRI-UX-130: priority filter options have role=menuitemcheckbox', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Task', status: 'todo' }],
      agents: [],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const priorityFilterBtn = screen.getByTestId('filter-priority-btn')
    fireEvent.click(priorityFilterBtn)

    const priorityOption = screen.getByTestId('filter-priority-option-high')
    expect(priorityOption).toHaveAttribute('role', 'menuitemcheckbox')
  })
})
