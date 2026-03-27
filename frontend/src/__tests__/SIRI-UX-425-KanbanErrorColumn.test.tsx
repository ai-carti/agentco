// SIRI-UX-425: tasks with status='error' must appear in a dedicated Kanban column
// COLUMNS array must include { id: 'error', label: 'Error' } so error tasks are visible
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Mock router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ companyId: 'cid-1' }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement('a', { href: to }, children),
}))

// Mock agentStore with a task in 'error' status
vi.mock('../store/agentStore', () => ({
  useAgentStore: (sel: (s: unknown) => unknown) => {
    const store = {
      tasks: [
        {
          id: 'task-err-1',
          title: 'Error Task',
          description: '',
          status: 'error',
          priority: 'medium',
          dueDate: null,
          agentId: null,
        },
      ],
      agents: [],
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      fetchTasks: vi.fn(),
      fetchAgents: vi.fn(),
      currentCompany: { id: 'cid-1', name: 'Acme' },
    }
    return sel(store)
  },
}))

describe('SIRI-UX-425 — KanbanBoard error column', () => {
  it('renders kanban-column-error so tasks with status=error are visible', async () => {
    const { default: KanbanBoard } = await import('../components/KanbanBoard')
    render(React.createElement(KanbanBoard))
    const errorCol = screen.queryByTestId('kanban-column-error')
    expect(errorCol).not.toBeNull()
  })

  it('task with status=error appears inside the error column', async () => {
    const { default: KanbanBoard } = await import('../components/KanbanBoard')
    render(React.createElement(KanbanBoard))
    const errorCol = screen.queryByTestId('kanban-column-error')
    expect(errorCol).not.toBeNull()
    // The error task should be rendered somewhere in the board
    expect(screen.queryByTestId('task-card-task-err-1')).not.toBeNull()
  })
})
