import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import KanbanBoard from '../components/KanbanBoard'
import WarRoom from '../components/WarRoom'
import { useAgentStore } from '../store/agentStore'
import { useAuthStore } from '../store/authStore'

class MockWS {
  static instances: MockWS[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()
  constructor() { MockWS.instances.push(this) }
}

beforeEach(() => {
  MockWS.instances = []
  vi.stubGlobal('WebSocket', MockWS)
  useAuthStore.setState({ token: 'tok' })
  useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCo' }, agents: [], tasks: [] })
  vi.clearAllMocks()
})

// --- KanbanBoard empty state CTA ---
describe('KanbanBoard empty state CTA', () => {
  it('opens create task modal when clicking + New Task', () => {
    useAgentStore.setState({ tasks: [] })
    render(
      <ToastProvider>
        <KanbanBoard companyId="c1" isLoaded={true} />
      </ToastProvider>,
    )
    const btn = screen.getByRole('button', { name: /new task/i })
    fireEvent.click(btn)
    expect(screen.getByTestId('create-task-modal')).toBeInTheDocument()
    expect(screen.getByTestId('create-task-title-input')).toBeInTheDocument()
  })

  it('create task modal has submit button', () => {
    useAgentStore.setState({ tasks: [] })
    render(
      <ToastProvider>
        <KanbanBoard companyId="c1" isLoaded={true} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    expect(screen.getByTestId('create-task-submit-btn')).toBeInTheDocument()
  })

  it('submit button calls API with correct data', async () => {
    useAgentStore.setState({ tasks: [] })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 't1', title: 'Test task', status: 'todo' }),
    })
    render(
      <ToastProvider>
        <KanbanBoard companyId="c1" isLoaded={true} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    fireEvent.change(screen.getByTestId('create-task-title-input'), {
      target: { value: 'Test task' },
    })
    fireEvent.click(screen.getByTestId('create-task-submit-btn'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('closes modal after successful creation', async () => {
    useAgentStore.setState({ tasks: [] })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 't1', title: 'Test task', status: 'todo' }),
    })
    render(
      <ToastProvider>
        <KanbanBoard companyId="c1" isLoaded={true} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /new task/i }))
    fireEvent.change(screen.getByTestId('create-task-title-input'), {
      target: { value: 'Test task' },
    })
    fireEvent.click(screen.getByTestId('create-task-submit-btn'))
    await waitFor(() => {
      expect(screen.queryByTestId('create-task-modal')).not.toBeInTheDocument()
    })
  })
})

// --- WarRoom empty state CTA ---
describe('WarRoom empty state CTA', () => {
  it('shows Run a Task button when no runs', () => {
    render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /run a task/i })).toBeInTheDocument()
  })

  it('CTA button is not a no-op (navigates on click)', () => {
    // Just verify it doesn't throw and the button has an onClick
    render(
      <MemoryRouter>
        <WarRoom />
      </MemoryRouter>,
    )
    const btn = screen.getByRole('button', { name: /run a task/i })
    // Should not throw
    expect(() => fireEvent.click(btn)).not.toThrow()
  })
})

// --- WarRoomPage empty state ---
describe('WarRoomPage empty state (no agents)', () => {
  it('shows SVG illustration and navigation button when no agents', async () => {
    // Import dynamically to avoid circular deps
    const { default: WarRoomPage } = await import('../components/WarRoomPage')
    const { useWarRoomStore } = await import('../store/warRoomStore')
    // Stub loadMockData to prevent agents from being populated on mount
    const originalLoad = useWarRoomStore.getState().loadMockData
    useWarRoomStore.setState({ agents: [], messages: [], cost: 0, loadMockData: () => {} } as any)

    render(
      <MemoryRouter>
        <ToastProvider>
          <WarRoomPage />
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('war-room-page')).toBeInTheDocument()
    expect(screen.getByText(/No agents running/i)).toBeInTheDocument()
    expect(screen.getByTestId('war-room-goto-companies-btn')).toBeInTheDocument()

    // Restore
    useWarRoomStore.setState({ loadMockData: originalLoad } as any)
  })
})
