import { render, screen } from '@testing-library/react'
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
})

describe('BUG-084: KanbanBoard canRun includes error status', () => {
  it('shows Run button on task card with error status', () => {
    useAgentStore.setState({
      tasks: [
        { id: 't-err', title: 'Failing task', status: 'error', assignee_name: 'Siri' },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    expect(screen.getByTestId('run-btn-t-err')).toBeInTheDocument()
  })

  it('Run button is not disabled for error tasks', () => {
    useAgentStore.setState({
      tasks: [
        { id: 't-err2', title: 'Another failing task', status: 'error', assignee_name: 'Siri' },
      ],
    })
    renderWithToast(<KanbanBoard companyId="c1" />)
    const btn = screen.getByTestId('run-btn-t-err2')
    expect(btn).not.toBeDisabled()
  })
})
