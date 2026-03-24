import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToastProvider } from '../context/ToastContext'
import { useAgentStore } from '../store/agentStore'
import { useAuthStore } from '../store/authStore'
import KanbanBoard from '../components/KanbanBoard'

beforeEach(() => {
  useAuthStore.setState({ token: 'tok' })
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
})

// SIRI-UX-250: KanbanBoard buttons use CSS classes for hover, not inline JS
describe('SIRI-UX-250: KanbanBoard buttons use CSS classes for hover', () => {
  it('New Task button has kanban-new-task-btn class', () => {
    useAgentStore.setState({
      tasks: [{ id: 't1', title: 'Existing', status: 'todo' }],
      agents: [],
      currentCompany: { id: 'c1', name: 'Co' },
    })
    render(
      <ToastProvider>
        <KanbanBoard companyId="c1" isLoaded={true} />
      </ToastProvider>
    )
    const newTaskBtn = screen.getByTestId('kanban-new-task-btn')
    expect(newTaskBtn.className).toContain('kanban-new-task-btn')
    // No inline JS background manipulation — style.background should be '' initially
    expect(newTaskBtn.style.background).toBe('')
  })
})
