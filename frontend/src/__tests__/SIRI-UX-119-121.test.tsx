/**
 * SIRI-UX-119: KanbanBoard filters reset on companyId change
 * SIRI-UX-121: WarRoomPage Stop button disabled in idle state
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import KanbanBoard from '../components/KanbanBoard'
import WarRoomPage from '../components/WarRoomPage'
import { useAgentStore } from '../store/agentStore'
import { useWarRoomStore } from '../store/warRoomStore'
import { ToastProvider } from '../context/ToastContext'

// Mock useWarRoomSocket for WarRoomPage tests
vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: vi.fn(() => ({ isConnected: false, events: [], error: null })),
}))

vi.mock('../api/client', () => ({
  getStoredToken: vi.fn(() => 'test-token'),
  setStoredToken: vi.fn(),
  BASE_URL: 'http://localhost:8000',
}))

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

function renderWarRoom(companyId = 'test-company') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

const COMPANY_A_TASKS = [
  { id: 'ta1', title: 'Company A task alpha', status: 'todo' as const, assignee_id: 'a1', assignee_name: 'Alice', priority: 'high' as const },
  { id: 'ta2', title: 'Company A task beta', status: 'backlog' as const, assignee_id: 'a2', assignee_name: 'Bob', priority: 'low' as const },
]

const COMPANY_B_TASKS = [
  { id: 'tb1', title: 'Company B task gamma', status: 'todo' as const, assignee_id: 'b1', assignee_name: 'Carol', priority: 'medium' as const },
]

const AGENTS = [
  { id: 'a1', name: 'Alice', role: 'Developer', status: 'idle' as const },
  { id: 'a2', name: 'Bob', role: 'DevOps', status: 'running' as const },
]

beforeEach(() => {
  useAgentStore.setState({ tasks: COMPANY_A_TASKS, agents: AGENTS })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// SIRI-UX-119: Filters reset when companyId prop changes
// ─────────────────────────────────────────────────────────────────────────────
describe('SIRI-UX-119: KanbanBoard filters reset on companyId change', () => {
  it('clears search filter when companyId changes', async () => {
    const { rerender } = renderWithToast(<KanbanBoard companyId="company-a" />)

    // Apply search filter
    const input = screen.getByTestId('kanban-search-input')
    fireEvent.change(input, { target: { value: 'alpha' } })
    act(() => { vi.advanceTimersByTime(150) })

    // Only alpha visible
    expect(screen.getByText('Company A task alpha')).toBeInTheDocument()
    expect(screen.queryByText('Company A task beta')).not.toBeInTheDocument()

    // Switch to company B — load company B tasks
    useAgentStore.setState({ tasks: COMPANY_B_TASKS, agents: [] })
    rerender(<ToastProvider><KanbanBoard companyId="company-b" /></ToastProvider>)
    act(() => { vi.advanceTimersByTime(150) })

    // Search filter should be cleared — Company B task visible
    expect(screen.getByText('Company B task gamma')).toBeInTheDocument()
    // Search input should be empty
    expect((screen.getByTestId('kanban-search-input') as HTMLInputElement).value).toBe('')
  })

  it('clears priority filter when companyId changes', async () => {
    const { rerender } = renderWithToast(<KanbanBoard companyId="company-a" />)

    // Apply priority filter (high)
    fireEvent.click(screen.getByTestId('filter-priority-btn'))
    fireEvent.click(screen.getByTestId('filter-priority-option-high'))

    act(() => { vi.advanceTimersByTime(150) })
    // Only high priority task visible (alpha)
    expect(screen.getByText('Company A task alpha')).toBeInTheDocument()
    expect(screen.queryByText('Company A task beta')).not.toBeInTheDocument()

    // Switch company
    useAgentStore.setState({ tasks: COMPANY_B_TASKS, agents: [] })
    rerender(<ToastProvider><KanbanBoard companyId="company-b" /></ToastProvider>)
    act(() => { vi.advanceTimersByTime(150) })

    // Priority filter cleared — Company B medium task visible
    expect(screen.getByText('Company B task gamma')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SIRI-UX-121: Stop button disabled in idle state (no active run)
// ─────────────────────────────────────────────────────────────────────────────
describe('SIRI-UX-121: Stop button disabled when no active run', () => {
  beforeEach(() => {
    // Switch to real timers for these tests (no fake timers needed)
    vi.useRealTimers()
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()
  })

  it('Stop button is disabled in idle runStatus (initial load)', () => {
    useWarRoomStore.getState().setRunStatus('idle')
    renderWarRoom()

    const stopBtn = screen.getByTestId('stop-btn')
    expect(stopBtn).toBeDisabled()
  })

  it('Stop button is enabled when runStatus is active (set after mount)', () => {
    renderWarRoom()

    // WarRoomPage.useEffect calls loadMockData() on mount (idle), so set active after mount
    act(() => {
      useWarRoomStore.getState().setRunStatus('active')
    })

    const stopBtn = screen.getByTestId('stop-btn')
    expect(stopBtn).not.toBeDisabled()
  })

  it('Stop button is disabled when runStatus is done', () => {
    useWarRoomStore.getState().setRunStatus('done')
    renderWarRoom()

    const stopBtn = screen.getByTestId('stop-btn')
    expect(stopBtn).toBeDisabled()
  })

  it('loadMockData sets runStatus to idle (Stop button disabled)', () => {
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()
    renderWarRoom()

    const stopBtn = screen.getByTestId('stop-btn')
    // Mock mode: no active run — Stop should be disabled
    expect(stopBtn).toBeDisabled()
  })
})
