/**
 * Tests for SIRI-UX-042 through SIRI-UX-046
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

// ─── SIRI-UX-043: AgentCard "View Agent" label ───────────────────────────────
import AgentCard from '../components/AgentCard'
import type { Agent } from '../store/agentStore'

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'Test Agent',
  role: 'Engineer',
  model: 'gpt-4o',
  status: 'idle',
}

describe('SIRI-UX-043: AgentCard action button label', () => {
  it('shows "View Agent" instead of "View History" on agent card', () => {
    render(
      <MemoryRouter>
        <AgentCard agent={mockAgent} companyId="comp-1" onEdit={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('View Agent')).toBeInTheDocument()
    expect(screen.queryByText('View History')).not.toBeInTheDocument()
  })
})

// ─── SIRI-UX-045: KanbanBoard always shows "+ New Task" button ────────────────
import { useAgentStore } from '../store/agentStore'
import KanbanBoard from '../components/KanbanBoard'

vi.mock('../api/client', () => ({
  getStoredToken: () => 'test-token',
  BASE_URL: 'http://localhost:8000',
}))

// Toast mock
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function renderKanban(tasks: ReturnType<typeof useAgentStore.getState>['tasks'] = []) {
  useAgentStore.setState({ tasks, agents: [] })
  return render(
    <MemoryRouter>
      <KanbanBoard companyId="comp-1" isLoaded={true} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAgentStore.setState({ tasks: [], agents: [], currentCompany: null })
})

describe('SIRI-UX-045: KanbanBoard always has New Task button', () => {
  it('shows "+ New Task" button when no tasks (via empty state CTA)', () => {
    renderKanban([])
    expect(screen.getByTestId('kanban-new-task-btn')).toBeInTheDocument()
  })

  it('shows "+ New Task" button when tasks exist', () => {
    renderKanban([
      { id: 't1', title: 'Task 1', status: 'todo', priority: 'medium' },
    ])
    expect(screen.getByTestId('kanban-new-task-btn')).toBeInTheDocument()
  })

  it('opens create modal when clicking "+ New Task" button with tasks', async () => {
    const user = userEvent.setup()
    renderKanban([
      { id: 't1', title: 'Task 1', status: 'todo', priority: 'medium' },
    ])
    await user.click(screen.getByTestId('kanban-new-task-btn'))
    expect(screen.getByTestId('create-task-modal')).toBeInTheDocument()
  })
})
