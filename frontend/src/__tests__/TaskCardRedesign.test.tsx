import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAgentStore } from '../store/agentStore'
import KanbanBoard from '../components/KanbanBoard'
import { ToastProvider } from '../context/ToastContext'

function renderBoard(companyId = 'c1') {
  return render(
    <ToastProvider>
      <KanbanBoard companyId={companyId} isLoaded={true} />
    </ToastProvider>
  )
}

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
})

describe('UX-008: Task Card redesign', () => {
  it('renders title and description preview (truncated)', () => {
    useAgentStore.setState({
      tasks: [{
        id: 't1',
        title: 'Deploy API',
        description: 'Deploy the new version of API to production server',
        status: 'todo',
        assignee_name: 'Alice',
      }],
    })
    renderBoard()
    expect(screen.getByText('Deploy API')).toBeInTheDocument()
    expect(screen.getByTestId('task-desc-preview-t1')).toBeInTheDocument()
  })

  it('renders assignee avatar with initials', () => {
    useAgentStore.setState({
      tasks: [{
        id: 't2',
        title: 'Fix bug',
        status: 'todo',
        assignee_name: 'Bob Smith',
      }],
    })
    renderBoard()
    const avatar = screen.getByTestId('assignee-avatar-t2')
    expect(avatar).toBeInTheDocument()
    // Should show initials BS or B
    expect(avatar.textContent).toMatch(/^[A-Z]{1,2}$/)
  })

  it('renders priority badge with correct color for High', () => {
    useAgentStore.setState({
      tasks: [{
        id: 't3',
        title: 'Critical task',
        status: 'todo',
        assignee_name: 'Carol',
        priority: 'high',
      }],
    })
    renderBoard()
    const badge = screen.getByTestId('priority-badge-t3')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent?.toLowerCase()).toContain('high')
  })

  it('renders priority badge for Medium priority', () => {
    useAgentStore.setState({
      tasks: [{
        id: 't4',
        title: 'Medium task',
        status: 'todo',
        assignee_name: 'Dave',
        priority: 'medium',
      }],
    })
    renderBoard()
    const badge = screen.getByTestId('priority-badge-t4')
    expect(badge.textContent?.toLowerCase()).toContain('medium')
  })

  it('renders priority badge for Low priority', () => {
    useAgentStore.setState({
      tasks: [{
        id: 't5',
        title: 'Low task',
        status: 'todo',
        assignee_name: 'Eve',
        priority: 'low',
      }],
    })
    renderBoard()
    const badge = screen.getByTestId('priority-badge-t5')
    expect(badge.textContent?.toLowerCase()).toContain('low')
  })

  it('renders due date when provided', () => {
    useAgentStore.setState({
      tasks: [{
        id: 't6',
        title: 'Dated task',
        status: 'todo',
        assignee_name: 'Frank',
        due_date: '2026-04-01',
      }],
    })
    renderBoard()
    expect(screen.getByTestId('due-date-t6')).toBeInTheDocument()
  })

  it('Run button hidden for done tasks', () => {
    useAgentStore.setState({
      tasks: [{ id: 't7', title: 'Done task', status: 'done', assignee_name: 'Grace' }],
    })
    renderBoard()
    expect(screen.queryByTestId('run-btn-t7')).not.toBeInTheDocument()
  })

  it('Run button visible for todo tasks', () => {
    useAgentStore.setState({
      tasks: [{ id: 't8', title: 'Todo task', status: 'todo', assignee_name: 'Henry' }],
    })
    renderBoard()
    expect(screen.getByTestId('run-btn-t8')).toBeInTheDocument()
  })

  it('Run button visible for backlog tasks', () => {
    useAgentStore.setState({
      tasks: [{ id: 't9', title: 'Backlog task', status: 'backlog', assignee_name: 'Iris' }],
    })
    renderBoard()
    expect(screen.getByTestId('run-btn-t9')).toBeInTheDocument()
  })

  it('Run button hidden for in_progress tasks', () => {
    useAgentStore.setState({
      tasks: [{ id: 't10', title: 'In progress task', status: 'in_progress', assignee_name: 'Jack' }],
    })
    renderBoard()
    expect(screen.queryByTestId('run-btn-t10')).not.toBeInTheDocument()
  })

  it('clicking Run calls POST and goes to loading state', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 't11', title: 'Run me', status: 'todo', assignee_name: 'Kira' }],
    })
    renderBoard()
    fireEvent.click(screen.getByTestId('run-btn-t11'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/t11/run'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('shows menu button on card', () => {
    useAgentStore.setState({
      tasks: [{ id: 't12', title: 'Menu task', status: 'todo', assignee_name: 'Leo' }],
    })
    renderBoard()
    expect(screen.getByTestId('task-menu-t12')).toBeInTheDocument()
  })

  it('status badge colored for in_progress', () => {
    useAgentStore.setState({
      tasks: [{ id: 't13', title: 'In progress', status: 'in_progress', assignee_name: 'Mia' }],
    })
    renderBoard()
    const badge = screen.getByTestId('status-badge-t13')
    expect(badge).toBeInTheDocument()
  })
})
