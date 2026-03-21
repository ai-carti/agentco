import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

beforeEach(() => {
  useAgentStore.setState({
    tasks: [
      { id: 't1', title: 'Test Task', status: 'todo' as const, description: 'A task' },
    ],
    agents: [],
  })
  vi.clearAllMocks()
})

describe('SIRI-POST-006: Focus trap in dialogs', () => {
  it('trap: Tab key does not move focus outside the Create Task modal', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    // Open create modal
    fireEvent.click(screen.getByTestId('kanban-new-task-btn'))
    const modal = screen.getByTestId('create-task-modal')
    expect(modal).toBeInTheDocument()

    // Get all focusable elements inside modal
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    expect(focusable.length).toBeGreaterThan(0)

    // Focus last element, then Tab should wrap to first
    const last = focusable[focusable.length - 1]
    last.focus()

    fireEvent.keyDown(modal, { key: 'Tab', shiftKey: false })
    // After Tab from last element, focus should be on first element inside modal
    expect(document.activeElement).toBe(focusable[0])
  })

  it('trap: Shift+Tab from first element in modal wraps to last', () => {
    renderWithToast(<KanbanBoard companyId="c1" />)

    fireEvent.click(screen.getByTestId('kanban-new-task-btn'))
    const modal = screen.getByTestId('create-task-modal')

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    first.focus()

    fireEvent.keyDown(modal, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(focusable[focusable.length - 1])
  })
})
