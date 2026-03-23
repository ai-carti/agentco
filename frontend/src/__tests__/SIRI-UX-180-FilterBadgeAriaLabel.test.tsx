/**
 * SIRI-UX-180: FilterBar badge remove buttons must have descriptive aria-label
 * so screen readers announce "Remove agent X filter" / "Remove high priority filter"
 * instead of just "×".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../context/ToastContext'
import { MemoryRouter } from 'react-router-dom'
import KanbanBoard from '../components/KanbanBoard'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  useAgentStore.getState().setAgents([
    { id: 'a1', name: 'Alice', role: 'CEO', model: 'gpt-4', status: 'idle' },
  ])
  // Seed tasks directly into store so FilterBar is visible (requires tasks.length > 0)
  useAgentStore.getState().setTasks([
    { id: 't1', title: 'Test task', description: '', status: 'todo', priority: 'low' },
  ])

  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response('[]', { status: 200 }))
  ) as typeof globalThis.fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  useAgentStore.getState().setAgents([])
  useAgentStore.getState().setTasks([])
})

describe('SIRI-UX-180: FilterBar badge remove buttons have aria-label', () => {
  it('agent filter badge × button has descriptive aria-label', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <MemoryRouter>
          <KanbanBoard companyId="co1" />
        </MemoryRouter>
      </ToastProvider>
    )

    // Open agent filter dropdown via testid
    const agentFilterBtn = await screen.findByTestId('filter-agent-btn')
    await user.click(agentFilterBtn)

    // Select "Alice"
    const aliceOption = await screen.findByTestId('filter-agent-option-a1')
    await user.click(aliceOption)

    // Close dropdown by pressing Escape
    await user.keyboard('{Escape}')

    // Filter badge for Alice should appear — find the remove button
    const removeBadgeBtn = screen.getByTestId('filter-badge-remove-agent-a1')
    const ariaLabel = removeBadgeBtn.getAttribute('aria-label')
    expect(ariaLabel).toBeTruthy()
    expect(ariaLabel).not.toBe('×')
    expect(ariaLabel?.toLowerCase()).toContain('alice')
  })

  it('priority filter badge × button has descriptive aria-label', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <MemoryRouter>
          <KanbanBoard companyId="co1" />
        </MemoryRouter>
      </ToastProvider>
    )

    // Open priority filter dropdown via testid
    const priorityFilterBtn = await screen.findByTestId('filter-priority-btn')
    await user.click(priorityFilterBtn)

    // Select "high" priority option
    const highOption = await screen.findByTestId('filter-priority-option-high')
    await user.click(highOption)

    // Close dropdown
    await user.keyboard('{Escape}')

    // Priority badge should appear with remove button
    const removeBadgeBtn = screen.getByTestId('filter-badge-remove-priority-high')
    const ariaLabel = removeBadgeBtn.getAttribute('aria-label')
    expect(ariaLabel).toBeTruthy()
    expect(ariaLabel).not.toBe('×')
    expect(ariaLabel?.toLowerCase()).toContain('high')
  })
})
