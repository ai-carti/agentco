/**
 * SIRI-UX-359: KanbanBoard TaskCard — assignee avatar missing aria-label
 * The assignee avatar div shows initials (e.g. "JD") but has no accessible name.
 * Screen readers announce "JD" without context — users can't tell it's an assignee.
 * Fix: add `aria-label={assigneeName}` and `title={assigneeName}` to the avatar div.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useAgentStore } from '../store/agentStore'
import KanbanBoard from '../components/KanbanBoard'

function renderBoard() {
  return render(
    <MemoryRouter>
      <KanbanBoard companyId="co-1" isLoaded />
    </MemoryRouter>
  )
}

describe('SIRI-UX-359: KanbanBoard assignee avatar has aria-label', () => {
  it('assigned task avatar has aria-label with assignee name', () => {
    useAgentStore.setState({
      tasks: [
        {
          id: 'task-1',
          title: 'Test Task',
          status: 'todo',
          assignee_id: 'agent-1',
          assignee_name: 'Jane Doe',
        },
      ],
      agents: [],
      currentCompany: null,
    })

    renderBoard()

    // Avatar should have aria-label matching the assignee name
    const avatar = screen.getByTestId('assignee-avatar-task-1')
    expect(avatar).toHaveAttribute('aria-label', 'Jane Doe')
    expect(avatar).toHaveAttribute('title', 'Jane Doe')
  })

  it('unassigned task avatar has aria-label "Unassigned"', () => {
    useAgentStore.setState({
      tasks: [
        {
          id: 'task-2',
          title: 'Unassigned Task',
          status: 'backlog',
        },
      ],
      agents: [],
      currentCompany: null,
    })

    renderBoard()

    const avatar = screen.getByTestId('assignee-avatar-task-2')
    expect(avatar).toHaveAttribute('aria-label', 'Unassigned')
    expect(avatar).toHaveAttribute('title', 'Unassigned')
  })
})
