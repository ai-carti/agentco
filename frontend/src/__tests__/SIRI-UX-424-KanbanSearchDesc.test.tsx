/**
 * SIRI-UX-424: KanbanBoard search filter only matches task title, not description.
 * GlobalSearch searches both title + description, but KanbanBoard only checks title.
 * This inconsistency: user can find a task by description via GlobalSearch but not
 * via the Kanban filter bar.
 * Fix: extend the filter predicate in KanbanBoard to also check description.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAgentStore } from '../store/agentStore'
import KanbanBoard from '../components/KanbanBoard'

// Minimal router + context wrappers
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  useAgentStore.setState({
    tasks: [
      {
        id: 't1',
        title: 'Deploy backend',
        description: 'Push Docker image to Railway',
        status: 'todo',
      },
      {
        id: 't2',
        title: 'Write unit tests',
        description: 'Cover all utility functions',
        status: 'todo',
      },
    ],
    agents: [],
    currentCompany: { id: 'c1', name: 'AgentCo' },
  })
})

describe('SIRI-UX-424: KanbanBoard search matches description', () => {
  it('shows task when search query matches title (baseline — already works)', async () => {
    render(
      <Wrapper>
        <KanbanBoard companyId="c1" isLoaded />
      </Wrapper>
    )
    const input = screen.getByTestId('kanban-search-input')
    await act(async () => {
      await userEvent.type(input, 'Deploy')
      // wait for 150ms debounce
      await new Promise((r) => setTimeout(r, 200))
    })
    expect(screen.getByTestId('task-card-t1')).toBeInTheDocument()
    expect(screen.queryByTestId('task-card-t2')).not.toBeInTheDocument()
  })

  it('shows task when search query matches description', async () => {
    render(
      <Wrapper>
        <KanbanBoard companyId="c1" isLoaded />
      </Wrapper>
    )
    const input = screen.getByTestId('kanban-search-input')
    await act(async () => {
      await userEvent.type(input, 'Railway')
      await new Promise((r) => setTimeout(r, 200))
    })
    // "Railway" is in the description of t1, not the title
    expect(screen.getByTestId('task-card-t1')).toBeInTheDocument()
    expect(screen.queryByTestId('task-card-t2')).not.toBeInTheDocument()
  })

  it('shows both tasks when query matches descriptions of both', async () => {
    render(
      <Wrapper>
        <KanbanBoard companyId="c1" isLoaded />
      </Wrapper>
    )
    const input = screen.getByTestId('kanban-search-input')
    await act(async () => {
      // "unit" matches t2's description; "Docker" matches t1 description — use generic word
      await userEvent.type(input, 'Cover')
      await new Promise((r) => setTimeout(r, 200))
    })
    expect(screen.getByTestId('task-card-t2')).toBeInTheDocument()
    expect(screen.queryByTestId('task-card-t1')).not.toBeInTheDocument()
  })
})
