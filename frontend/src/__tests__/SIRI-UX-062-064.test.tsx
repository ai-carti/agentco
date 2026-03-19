/**
 * Tests for BUG-051: accessibility coverage for SIRI-UX-062/063/064
 *
 * AC:
 * - Escape закрывает Assign dropdown в TaskCard
 * - Все 4 модала (Edit, Delete, Assign, Create) имеют role="dialog" aria-modal="true"
 * - task menu button имеет aria-label, aria-expanded, aria-haspopup
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider } from '../context/ToastContext'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

const TASK = {
  id: 't1',
  title: 'Test Task',
  status: 'todo' as const,
  assignee_id: undefined as string | undefined,
  assignee_name: undefined as string | undefined,
}

const AGENT = { id: 'a1', name: 'Alice', role: 'Dev', model: 'gpt-4', system_prompt: '' }

function renderKanban() {
  return render(
    <ToastProvider>
      <KanbanBoard companyId="c1" isLoaded={true} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({ tasks: [TASK], agents: [AGENT] })
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  })
})

// =====================================================================
// SIRI-UX-063: task menu button aria attributes
// =====================================================================
describe('SIRI-UX-063: task menu button aria attributes', () => {
  it('has aria-label="Task options"', () => {
    renderKanban()
    const menuBtn = screen.getByTestId('task-menu-t1')
    expect(menuBtn).toHaveAttribute('aria-label', 'Task options')
  })

  it('has aria-haspopup="menu"', () => {
    renderKanban()
    const menuBtn = screen.getByTestId('task-menu-t1')
    expect(menuBtn).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('aria-expanded is false when menu closed', () => {
    renderKanban()
    const menuBtn = screen.getByTestId('task-menu-t1')
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('aria-expanded is true when menu open', () => {
    renderKanban()
    const menuBtn = screen.getByTestId('task-menu-t1')
    fireEvent.click(menuBtn)
    expect(menuBtn).toHaveAttribute('aria-expanded', 'true')
  })
})

// =====================================================================
// SIRI-UX-062: all 4 modals have role="dialog" aria-modal="true"
// =====================================================================
describe('SIRI-UX-062: modals have role=dialog aria-modal=true', () => {
  it('Edit modal has role=dialog and aria-modal=true', async () => {
    renderKanban()
    // Open menu and click Edit
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))

    await waitFor(() => {
      const modal = screen.getByTestId('edit-task-modal')
      expect(modal).toHaveAttribute('role', 'dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
    })
  })

  it('Delete modal has role=dialog and aria-modal=true', async () => {
    renderKanban()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await waitFor(() => {
      const modal = screen.getByTestId('confirm-delete-dialog')
      expect(modal).toHaveAttribute('role', 'dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
    })
  })

  it('Assign modal has role=dialog and aria-modal=true', async () => {
    renderKanban()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assign' }))

    await waitFor(() => {
      const modal = screen.getByTestId('assign-dropdown')
      expect(modal).toHaveAttribute('role', 'dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
    })
  })

  it('Create Task modal has role=dialog and aria-modal=true', async () => {
    renderKanban()
    fireEvent.click(screen.getByTestId('kanban-new-task-btn'))

    await waitFor(() => {
      const modal = screen.getByTestId('create-task-modal')
      expect(modal).toHaveAttribute('role', 'dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
    })
  })
})

// =====================================================================
// SIRI-UX-064: Escape закрывает Assign dropdown
// =====================================================================
describe('SIRI-UX-064: Escape closes Assign dropdown', () => {
  it('Assign modal closes on Escape key', async () => {
    renderKanban()

    // Open Assign via menu
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Assign' }))

    // Verify it opened
    await waitFor(() => {
      expect(screen.getByTestId('assign-dropdown')).toBeInTheDocument()
    })

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' })

    // Verify it closed
    await waitFor(() => {
      expect(screen.queryByTestId('assign-dropdown')).not.toBeInTheDocument()
    })
  })

  it('Escape also closes Edit modal', async () => {
    renderKanban()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))

    await waitFor(() => expect(screen.getByTestId('edit-task-modal')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('edit-task-modal')).not.toBeInTheDocument())
  })

  it('Escape also closes Delete modal', async () => {
    renderKanban()
    fireEvent.click(screen.getByTestId('task-menu-t1'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByTestId('confirm-delete-dialog')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('confirm-delete-dialog')).not.toBeInTheDocument())
  })
})
