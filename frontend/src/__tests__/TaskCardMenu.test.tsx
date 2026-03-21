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

const TASK = {
  id: 't1',
  title: 'Fix login bug',
  description: 'Users cannot login with email',
  status: 'todo' as const,
  assignee_name: 'Alice',
  assignee_id: 'a1',
  priority: 'high' as const,
}

beforeEach(() => {
  useAgentStore.setState({
    tasks: [TASK],
    agents: [
      { id: 'a1', name: 'Alice', status: 'idle' },
      { id: 'a2', name: 'Bob', status: 'idle' },
    ],
  })
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('BUG-019: TaskCard menu actions', () => {
  it('Edit opens edit modal with task title and description', () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByTestId('edit-task-modal')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Fix login bug')).toBeInTheDocument()
  })

  it('Edit modal saves changes on Save click', async () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Edit'))

    const titleInput = screen.getByDisplayValue('Fix login bug')
    fireEvent.change(titleInput, { target: { value: 'Updated title' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/t1'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('Edit modal closes on Cancel', () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByTestId('edit-task-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('edit-task-modal')).not.toBeInTheDocument()
  })

  it('Delete shows confirm dialog', () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByTestId('confirm-delete-dialog')).toBeInTheDocument()
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
  })

  it('Delete confirm dialog calls DELETE API and shows toast', async () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByTestId('confirm-delete-btn'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/t1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })
    // Toast should appear
    await waitFor(() => {
      expect(screen.getByTestId('toast-item')).toBeInTheDocument()
    })
  })

  it('Delete confirm dialog can be cancelled', () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByTestId('confirm-delete-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cancel-delete-btn'))
    expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument()
  })

  it('Assign shows agent dropdown with available agents', () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Assign'))
    expect(screen.getByTestId('assign-dropdown')).toBeInTheDocument()
    expect(screen.getByTestId('assign-agent-a1')).toBeInTheDocument()
    expect(screen.getByTestId('assign-agent-a2')).toBeInTheDocument()
  })

  it('Assign dropdown calls PATCH API on agent selection', async () => {
    renderBoard()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Assign'))
    fireEvent.click(screen.getByTestId('assign-agent-a2'))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/t1'),
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })
})

describe('SIRI-UX-120: Edit modal Cancel resets editTitle/editDesc', () => {
  it('Cancel resets edited values so re-opening shows original task values', () => {
    renderBoard()

    // Open edit modal
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Edit'))

    // Change title and description
    const titleInput = screen.getByDisplayValue('Fix login bug')
    fireEvent.change(titleInput, { target: { value: 'Unsaved changed title' } })

    // Cancel without saving
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('edit-task-modal')).not.toBeInTheDocument()

    // Re-open edit modal
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByText('Edit'))

    // Should show original values, not unsaved ones
    expect(screen.getByDisplayValue('Fix login bug')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Unsaved changed title')).not.toBeInTheDocument()
  })
})
