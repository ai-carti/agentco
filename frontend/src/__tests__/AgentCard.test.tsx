import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AgentCard from '../components/AgentCard'

const mockAgent = {
  id: 'agent-1',
  name: 'Alice CEO',
  role: 'Chief Executive Officer',
  model: 'gpt-4o',
  status: 'idle' as const,
  last_task_at: null,
}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <AgentCard
        agent={mockAgent}
        companyId="c1"
        onEdit={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UX-009: Agent Card redesign', () => {
  it('renders agent name', () => {
    renderCard()
    expect(screen.getByText('Alice CEO')).toBeInTheDocument()
  })

  it('renders role subtitle', () => {
    renderCard()
    expect(screen.getByText('Chief Executive Officer')).toBeInTheDocument()
  })

  it('renders model badge', () => {
    renderCard()
    expect(screen.getByTestId('model-badge')).toBeInTheDocument()
    expect(screen.getByTestId('model-badge').textContent).toContain('gpt-4o')
  })

  it('renders avatar with initials', () => {
    renderCard()
    const avatar = screen.getByTestId('agent-avatar')
    expect(avatar).toBeInTheDocument()
    // Should contain initials "AC" or "A"
    expect(avatar.textContent).toMatch(/^[A-Z]{1,2}$/)
  })

  it('avatar color is stable and generated from name hash', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AgentCard agent={mockAgent} companyId="c1" onEdit={vi.fn()} />
      </MemoryRouter>
    )
    const firstColor = screen.getByTestId('agent-avatar').style.backgroundColor
    rerender(
      <MemoryRouter>
        <AgentCard agent={mockAgent} companyId="c1" onEdit={vi.fn()} />
      </MemoryRouter>
    )
    expect(screen.getByTestId('agent-avatar').style.backgroundColor).toBe(firstColor)
  })

  it('shows status idle (no pulse)', () => {
    renderCard({ agent: { ...mockAgent, status: 'idle' } })
    const statusDot = screen.getByTestId('status-dot')
    expect(statusDot).toBeInTheDocument()
    // idle should not have 'pulse' animation
    expect(statusDot.className).not.toContain('animate-pulse')
  })

  it('shows status running with pulse animation', () => {
    renderCard({ agent: { ...mockAgent, status: 'running' } })
    const statusDot = screen.getByTestId('status-dot')
    expect(statusDot.className).toContain('animate-pulse')
  })

  it('shows "No tasks yet" when last_task_at is null', () => {
    renderCard({ agent: { ...mockAgent, last_task_at: null } })
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument()
  })

  it('shows "Last task: X min ago" when last_task_at is set', () => {
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    renderCard({ agent: { ...mockAgent, last_task_at: recentTime } })
    expect(screen.getByTestId('last-task-time')).toBeInTheDocument()
  })

  it('Edit button calls onEdit callback', () => {
    const onEdit = vi.fn()
    renderCard({ onEdit })
    const editBtn = screen.getByTestId('agent-edit-btn')
    fireEvent.click(editBtn)
    expect(onEdit).toHaveBeenCalledWith(mockAgent)
  })

  it('View Agent button links to agent page', () => {
    renderCard()
    const historyLink = screen.getByTestId('agent-history-btn')
    expect(historyLink).toBeInTheDocument()
    expect(historyLink.getAttribute('href')).toContain('/agents/agent-1')
  })
})
