import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TaskDetailSidebar from '../components/TaskDetailSidebar'
import { type Task } from '../store/agentStore'

const BASE_URL = 'http://localhost:8000'

const mockTask: Task = {
  id: 'task-1',
  title: 'Build login page',
  description: 'Create login form with email/password and JWT auth',
  status: 'todo',
  assignee_id: 'agent-1',
  assignee_name: 'Alice',
  due_date: '2026-04-01',
  priority: 'high',
}

const defaultProps = {
  task: mockTask,
  companyId: 'company-1',
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ logs: [], status_history: [] }),
  })
})

describe('TaskDetailSidebar — UX-010', () => {
  it('renders sidebar with title', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByTestId('task-detail-sidebar')).toBeInTheDocument()
    expect(screen.getByText('Build login page')).toBeInTheDocument()
  })

  it('renders full description', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByText('Create login form with email/password and JWT auth')).toBeInTheDocument()
  })

  it('renders assignee name and avatar', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-assignee-avatar')).toHaveTextContent('A')
  })

  it('renders status badge', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByTestId('sidebar-status-badge')).toBeInTheDocument()
  })

  it('renders due date', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByTestId('sidebar-due-date')).toBeInTheDocument()
  })

  it('renders priority badge', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByTestId('sidebar-priority')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-priority')).toHaveTextContent(/high/i)
  })

  it('renders backdrop overlay', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('sidebar-backdrop'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('sidebar-close-btn'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('shows Execution Log section', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByText(/execution log/i)).toBeInTheDocument()
  })

  it('shows Status History section', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByText(/status history/i)).toBeInTheDocument()
  })

  it('fetches logs from GET /api/companies/{id}/tasks/{id}/logs', async () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/company-1/tasks/task-1/logs'),
        expect.any(Object)
      )
    })
  })

  it('shows "No execution log yet" when logs are empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    })
    render(<TaskDetailSidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/no execution log yet/i)).toBeInTheDocument()
    })
  })

  it('renders log entries with timestamps when logs are returned', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logs: [
          { timestamp: '2026-03-16T10:00:00Z', message: 'Task started' },
          { timestamp: '2026-03-16T10:01:00Z', message: 'Processing data' },
        ],
        status_history: [],
      }),
    })
    render(<TaskDetailSidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Task started')).toBeInTheDocument()
      expect(screen.getByText('Processing data')).toBeInTheDocument()
    })
  })

  it('renders status history timeline entries', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logs: [],
        status_history: [
          { status: 'todo', changed_at: '2026-03-16T09:00:00Z' },
          { status: 'in_progress', changed_at: '2026-03-16T10:00:00Z' },
        ],
      }),
    })
    render(<TaskDetailSidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTestId('status-history-todo')).toBeInTheDocument()
      expect(screen.getByTestId('status-history-in_progress')).toBeInTheDocument()
    })
  })

  it('shows Run button for todo tasks', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    expect(screen.getByTestId('sidebar-run-btn')).toBeInTheDocument()
  })

  it('shows Run button for backlog tasks', () => {
    const backlogTask: Task = { ...mockTask, status: 'backlog' }
    render(<TaskDetailSidebar {...defaultProps} task={backlogTask} />)
    expect(screen.getByTestId('sidebar-run-btn')).toBeInTheDocument()
  })

  it('does NOT show Run button for done tasks', () => {
    const doneTask: Task = { ...mockTask, status: 'done' }
    render(<TaskDetailSidebar {...defaultProps} task={doneTask} />)
    expect(screen.queryByTestId('sidebar-run-btn')).not.toBeInTheDocument()
  })

  it('does NOT show Run button for in_progress tasks', () => {
    const inProgressTask: Task = { ...mockTask, status: 'in_progress' }
    render(<TaskDetailSidebar {...defaultProps} task={inProgressTask} />)
    expect(screen.queryByTestId('sidebar-run-btn')).not.toBeInTheDocument()
  })

  it('clicking Run button in sidebar calls POST run', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: [], status_history: [] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    render(<TaskDetailSidebar {...defaultProps} />)
    const runBtn = screen.getByTestId('sidebar-run-btn')
    fireEvent.click(runBtn)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/company-1/tasks/task-1/run'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
