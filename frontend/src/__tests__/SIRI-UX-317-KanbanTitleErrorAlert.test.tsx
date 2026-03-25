/**
 * SIRI-UX-317: KanbanBoard "New Task" modal — #title-error <p> missing role="alert"
 * When user submits empty title, a validation error appears dynamically.
 * The <p id="title-error"> paragraph has aria-describedby from the input,
 * but without role="alert" the screen reader won't auto-announce it when it appears.
 * Same pattern fixed in SIRI-UX-300/301/304/306/315.
 * Fix: add role="alert" to #title-error paragraph in KanbanBoard.tsx.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ToastProvider } from '../context/ToastContext'
import userEvent from '@testing-library/user-event'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  useAgentStore.getState().setTasks([])
  useAgentStore.getState().setAgents([])
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as typeof fetch
})

describe('SIRI-UX-317: KanbanBoard title error role="alert"', () => {
  it('#title-error paragraph has role="alert" when empty title is submitted', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ToastProvider>
          <KanbanBoard companyId="co-1" />
        </ToastProvider>
      </MemoryRouter>
    )

    // Open "New Task" modal via EmptyState CTA (tasks list is empty)
    const newTaskBtn = await screen.findByTestId('kanban-new-task-btn')
    await user.click(newTaskBtn)

    // Submit with Enter key without filling title — triggers validation error
    // (button is disabled when empty, but Enter on the input calls handleCreateTask which sets titleTouched)
    const titleInput = screen.getByTestId('create-task-title-input')
    await user.type(titleInput, '{Enter}')

    // Error paragraph should now have role="alert"
    const titleError = await screen.findByRole('alert')
    expect(titleError.id).toBe('title-error')
    expect(titleError.textContent).toMatch(/title is required/i)
  })
})
