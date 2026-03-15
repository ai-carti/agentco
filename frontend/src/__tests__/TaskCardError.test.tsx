import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

// BUG-018: TaskCard.handleRun error handling tests

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [] })
  vi.clearAllMocks()
})

describe('BUG-018: TaskCard.handleRun error handling', () => {
  it('shows error state when POST /run returns 4xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 })
    useAgentStore.setState({
      tasks: [{ id: 'err1', title: 'Error Task', status: 'todo', assignee_name: 'Alice' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('run-btn-err1'))
    await waitFor(() => {
      expect(screen.getByTestId('run-error-err1')).toBeInTheDocument()
    })
  })

  it('shows error state when POST /run returns 5xx', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    useAgentStore.setState({
      tasks: [{ id: 'err2', title: 'Server Error Task', status: 'todo', assignee_name: 'Bob' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('run-btn-err2'))
    await waitFor(() => {
      expect(screen.getByTestId('run-error-err2')).toBeInTheDocument()
    })
  })

  it('does NOT show error when POST /run succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 'ok1', title: 'OK Task', status: 'todo', assignee_name: 'Carol' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    fireEvent.click(screen.getByTestId('run-btn-ok1'))
    await waitFor(() => {
      expect(screen.queryByTestId('run-error-ok1')).not.toBeInTheDocument()
    })
  })

  it('clears error state on second successful run', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    useAgentStore.setState({
      tasks: [{ id: 'retry1', title: 'Retry Task', status: 'todo', assignee_name: 'Dave' }],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    // First click — error
    fireEvent.click(screen.getByTestId('run-btn-retry1'))
    await waitFor(() => {
      expect(screen.getByTestId('run-error-retry1')).toBeInTheDocument()
    })
    // Second click — success, error should clear
    fireEvent.click(screen.getByTestId('run-btn-retry1'))
    await waitFor(() => {
      expect(screen.queryByTestId('run-error-retry1')).not.toBeInTheDocument()
    })
  })
})
