import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

// Reset store before each test
beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
})

describe('KanbanBoard', () => {
  it('renders without crash', () => {
    render(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
  })

  it('shows default columns', () => {
    render(<KanbanBoard companyId="c1" />)
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
    render(<KanbanBoard companyId="c1" />)
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
    render(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('assignee-avatar-t2')).toHaveTextContent('B')
  })

  it('renders Run button on each task card', () => {
    useAgentStore.setState({
      tasks: [
        { id: 't3', title: 'Task X', status: 'todo', assignee_name: 'Carol' },
      ],
    })
    render(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('run-btn-t3')).toBeInTheDocument()
  })

  it('clicking Run button calls POST /api/companies/{id}/tasks/{id}/run', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 't4', title: 'Task Y', status: 'todo', assignee_name: 'Dave' }],
    })
    render(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('run-btn-t4'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/c1/tasks/t4/run'),
        expect.objectContaining({ method: 'POST' })
      )
    })
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
    render(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('task-card-t5'))
    expect(screen.getByTestId('task-side-panel')).toBeInTheDocument()
    expect(screen.getByText('Full description here')).toBeInTheDocument()
  })

  it('side panel closes on Escape key', () => {
    useAgentStore.setState({
      tasks: [{ id: 't6', title: 'Task W', status: 'todo', assignee_name: 'Frank' }],
    })
    render(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('task-card-t6'))
    expect(screen.getByTestId('task-side-panel')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('task-side-panel')).not.toBeInTheDocument()
  })

  it('side panel closes when clicking overlay', () => {
    useAgentStore.setState({
      tasks: [{ id: 't7', title: 'Task V', status: 'todo', assignee_name: 'Grace' }],
    })
    render(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('task-card-t7'))
    expect(screen.getByTestId('task-side-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('side-panel-overlay'))
    expect(screen.queryByTestId('task-side-panel')).not.toBeInTheDocument()
  })
})
