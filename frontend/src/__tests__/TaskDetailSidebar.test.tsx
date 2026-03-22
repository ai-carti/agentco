import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import TaskDetailSidebar from '../components/TaskDetailSidebar'
import { type Task } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// BASE_URL removed - unused

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
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ logs: [], status_history: [] }),
  })
})

// Flush pending microtasks (async fetch state updates) after each test
// to prevent "act(...)" warnings in synchronous tests
afterEach(async () => {
  await act(async () => {})
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
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/company-1/tasks/task-1/logs'),
        expect.any(Object)
      )
    })
  })

  it('shows "No execution log yet" when logs are empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    })
    render(<TaskDetailSidebar {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/no execution log yet/i)).toBeInTheDocument()
    })
  })

  it('renders log entries with timestamps when logs are returned', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
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
    globalThis.fetch = vi.fn().mockResolvedValue({
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

  // BUG-054: aria-label on sidebar-run-btn
  it('sidebar-run-btn has aria-label="Run task" in idle state', () => {
    render(<TaskDetailSidebar {...defaultProps} />)
    const runBtn = screen.getByTestId('sidebar-run-btn')
    expect(runBtn).toHaveAttribute('aria-label', 'Run task')
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
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logs: [], status_history: [] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    render(<TaskDetailSidebar {...defaultProps} />)
    const runBtn = screen.getByTestId('sidebar-run-btn')
    fireEvent.click(runBtn)
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/companies/company-1/tasks/task-1/run'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})

describe('TaskDetailSidebar — BUG-025 toast on run', () => {
  it('shows success toast when run succeeds', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logs: [], status_history: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    renderWithToast(<TaskDetailSidebar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('sidebar-run-btn'))
    await waitFor(() => {
      expect(screen.getAllByTestId('toast-item').length).toBeGreaterThan(0)
    })
    const toastItems = screen.getAllByTestId('toast-item')
    const successToast = toastItems.find(
      (el) => el.getAttribute('data-type') === 'success'
    )
    expect(successToast).toBeTruthy()
    expect(successToast!.textContent).toContain('Build login page')
  })

  it('shows error toast when run returns !ok', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logs: [], status_history: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })

    renderWithToast(<TaskDetailSidebar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('sidebar-run-btn'))
    await waitFor(() => {
      expect(screen.getAllByTestId('toast-item').length).toBeGreaterThan(0)
    })
    const toastItems = screen.getAllByTestId('toast-item')
    const errorToast = toastItems.find((el) => el.getAttribute('data-type') === 'error')
    expect(errorToast).toBeTruthy()
    expect(errorToast!.textContent).toContain('Something went wrong')
  })
})

// ─── BUG-061: Stable React keys in logs and status history ───────────────────

describe('BUG-061: stable keys in logs and status history', () => {
  it('renders logs with same timestamp (duplicate key test) without React key warnings', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Two entries with the SAME timestamp — with `-${i}` keys they'd be unique,
    // but after removing index they'd collide. The fix should use timestamp+message.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logs: [
          { timestamp: '2026-03-16T10:00:00Z', message: 'First event' },
          { timestamp: '2026-03-16T10:00:00Z', message: 'Second event at same time' },
          { timestamp: '2026-03-16T10:00:00Z', message: 'Third event at same time' },
        ],
        status_history: [],
      }),
    })

    render(<TaskDetailSidebar {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('First event')).toBeInTheDocument()
      expect(screen.getByText('Second event at same time')).toBeInTheDocument()
    })

    // No React key duplicate warnings
    const keyWarnings = consoleError.mock.calls.filter((args) =>
      typeof args[0] === 'string' && args[0].toLowerCase().includes('key')
    )
    expect(keyWarnings).toHaveLength(0)

    consoleError.mockRestore()
  })

  it('renders status history without React key warnings', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        logs: [],
        status_history: [
          { status: 'todo', changed_at: '2026-03-16T10:00:00Z' },
          { status: 'in_progress', changed_at: '2026-03-16T10:01:00Z' },
          { status: 'done', changed_at: '2026-03-16T10:02:00Z' },
        ],
      }),
    })

    render(<TaskDetailSidebar {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('status-history-done')).toBeInTheDocument()
    })

    const keyWarnings = consoleError.mock.calls.filter((args) =>
      typeof args[0] === 'string' && args[0].toLowerCase().includes('key')
    )
    expect(keyWarnings).toHaveLength(0)

    consoleError.mockRestore()
  })
})
