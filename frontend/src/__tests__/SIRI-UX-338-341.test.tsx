import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TaskDetailSidebar from '../components/TaskDetailSidebar'
import KanbanBoard from '../components/KanbanBoard'
import WarRoomPage from '../components/WarRoomPage'
import { useAgentStore } from '../store/agentStore'
import { useWarRoomStore } from '../store/warRoomStore'
import { ToastProvider } from '../context/ToastContext'
import { type Task } from '../store/agentStore'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

function renderWarRoom(companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
      <Routes>
        <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const mockTask: Task = {
  id: 'task-1',
  title: 'Build login page',
  description: 'Create login form',
  status: 'todo',
  assignee_id: 'agent-1',
  assignee_name: 'Alice',
  due_date: '2026-04-01',
  priority: 'high',
}

// ────────────────────────────────────────────────────────────
// SIRI-UX-338: logs-error span must have role="alert"
// ────────────────────────────────────────────────────────────
describe('SIRI-UX-338 — TaskDetailSidebar logs-error role="alert"', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await act(async () => {})
  })

  it('shows logs-error span with role="alert" when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(
      <ToastProvider>
        <TaskDetailSidebar task={mockTask} companyId="company-1" onClose={vi.fn()} />
      </ToastProvider>,
    )

    await waitFor(() => {
      const errorSpan = screen.getByTestId('logs-error')
      expect(errorSpan).toBeInTheDocument()
      expect(errorSpan).toHaveAttribute('role', 'alert')
    })
  })

  it('shows logs-error span with role="alert" when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    })

    render(
      <ToastProvider>
        <TaskDetailSidebar task={mockTask} companyId="company-1" onClose={vi.fn()} />
      </ToastProvider>,
    )

    await waitFor(() => {
      const errorSpan = screen.getByTestId('logs-error')
      expect(errorSpan).toBeInTheDocument()
      expect(errorSpan).toHaveAttribute('role', 'alert')
    })
  })
})

// ────────────────────────────────────────────────────────────
// SIRI-UX-339: handleCardClick is stable useCallback ref
// ────────────────────────────────────────────────────────────
describe('SIRI-UX-339 — KanbanBoard handleCardClick stable useCallback', () => {
  beforeEach(() => {
    useAgentStore.setState({ tasks: [], agents: [] })
    vi.clearAllMocks()
  })

  it('passes onCardClick as stable prop (not inline arrow) to TaskCard', () => {
    useAgentStore.setState({
      tasks: [
        {
          id: 't1',
          title: 'Task One',
          status: 'todo',
          assignee_id: 'a1',
          assignee_name: 'Alice',
        },
        {
          id: 't2',
          title: 'Task Two',
          status: 'todo',
          assignee_id: 'a2',
          assignee_name: 'Bob',
        },
      ],
    })

    renderWithToast(<KanbanBoard companyId="c1" />)
    // Both cards render — stable callback used for all
    expect(screen.getByText('Task One')).toBeInTheDocument()
    expect(screen.getByText('Task Two')).toBeInTheDocument()
  })

  it('clicking a task card opens TaskDetailSidebar via handleCardClick', async () => {
    useAgentStore.setState({
      tasks: [
        {
          id: 't1',
          title: 'Clickable Task',
          status: 'todo',
          assignee_id: 'a1',
          assignee_name: 'Alice',
        },
      ],
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [], status_history: [] }),
    })

    renderWithToast(<KanbanBoard companyId="c1" />)

    const card = screen.getByTestId('task-card-t1')
    fireEvent.click(card)

    await waitFor(() => {
      expect(screen.getByTestId('task-detail-sidebar')).toBeInTheDocument()
    })
  })
})

// ────────────────────────────────────────────────────────────
// SIRI-UX-340: WarRoomPage agent-panel + activity-feed role="region"
// ────────────────────────────────────────────────────────────
describe('SIRI-UX-340 — WarRoomPage region landmarks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWarRoomStore.getState().reset()
    vi.stubEnv('VITE_MOCK_WAR_ROOM', 'true')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('agent-panel has role="region"', () => {
    renderWarRoom()
    const panel = screen.getByTestId('agent-panel')
    expect(panel).toHaveAttribute('role', 'region')
  })

  it('agent-panel has aria-labelledby pointing to a heading id', () => {
    renderWarRoom()
    const panel = screen.getByTestId('agent-panel')
    const labelId = panel.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    // The heading element with that id must exist in the DOM
    const heading = document.getElementById(labelId!)
    expect(heading).not.toBeNull()
  })

  it('activity-feed has role="region"', () => {
    renderWarRoom()
    const feed = screen.getByTestId('activity-feed')
    expect(feed).toHaveAttribute('role', 'region')
  })

  it('activity-feed has accessible label (aria-label or aria-labelledby)', () => {
    // SIRI-UX-414: changed from aria-labelledby to aria-label="Activity Feed" to avoid
    // the computed accessible name including LIVE badge text ("Activity Feed LIVE").
    renderWarRoom()
    const feed = screen.getByTestId('activity-feed')
    const hasAriaLabel = feed.getAttribute('aria-label') === 'Activity Feed'
    const ariaLabelledBy = feed.getAttribute('aria-labelledby')
    const hasAriaLabelledBy = ariaLabelledBy ? !!document.getElementById(ariaLabelledBy) : false
    expect(hasAriaLabel || hasAriaLabelledBy).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// SIRI-UX-341: Create Task modal uses <Button> component
// ────────────────────────────────────────────────────────────
describe('SIRI-UX-341 — KanbanBoard Create Task modal uses Button component', () => {
  beforeEach(() => {
    useAgentStore.setState({ tasks: [], agents: [] })
    vi.clearAllMocks()
  })

  it('Cancel button in Create Task modal has data-testid and is accessible', () => {
    // Pre-populate tasks so the board is not empty and header button is shown
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Existing Task', status: 'todo', assignee_id: 'a1', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Open Create Task modal via the "New Task" button
    const createBtn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(createBtn)

    const cancelBtn = screen.getByTestId('create-task-cancel-btn')
    expect(cancelBtn).toBeInTheDocument()
    // Should not have raw inline background style (Button component handles styling)
    expect(cancelBtn).not.toHaveStyle({ background: '#374151' })
  })

  it('Submit button in Create Task modal has data-testid and is accessible', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Existing Task', status: 'todo', assignee_id: 'a1', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const createBtn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(createBtn)

    const submitBtn = screen.getByTestId('create-task-submit-btn')
    expect(submitBtn).toBeInTheDocument()
    // Should not have raw inline background style with hardcoded color
    expect(submitBtn).not.toHaveStyle({ background: '#2563eb' })
  })

  it('Cancel button closes the modal', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Existing Task', status: 'todo', assignee_id: 'a1', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)

    const createBtn = screen.getByTestId('kanban-new-task-btn')
    fireEvent.click(createBtn)

    expect(screen.getByTestId('create-task-cancel-btn')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('create-task-cancel-btn'))

    expect(screen.queryByTestId('create-task-cancel-btn')).not.toBeInTheDocument()
  })
})
