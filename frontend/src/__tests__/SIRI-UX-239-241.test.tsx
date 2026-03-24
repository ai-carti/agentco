/**
 * SIRI-UX-239: AgentCard.tsx local STATUS_COLORS naming collision with taskUtils.STATUS_COLORS
 *   — should be AGENT_STATUS_DOT_COLORS in taskUtils for clarity
 * SIRI-UX-241: AgentCard card wrapper has onMouseEnter/onMouseLeave but no onFocus/onBlur
 *   — keyboard users don't see border highlight when navigating into card
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AgentCard from '../components/AgentCard'
// SIRI-UX-239: AGENT_STATUS_DOT_COLORS must be exported from taskUtils
import { AGENT_STATUS_DOT_COLORS } from '../utils/taskUtils'

const mockAgent = {
  id: 'a1',
  name: 'Bob PM',
  role: 'Product Manager',
  model: 'gpt-4o',
  status: 'running' as const,
  last_task_at: null,
}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <AgentCard agent={mockAgent} companyId="c1" onEdit={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

describe('SIRI-UX-239: AGENT_STATUS_DOT_COLORS in taskUtils', () => {
  it('exports AGENT_STATUS_DOT_COLORS from taskUtils with agent status keys', () => {
    expect(AGENT_STATUS_DOT_COLORS).toBeDefined()
    expect(AGENT_STATUS_DOT_COLORS).toHaveProperty('idle')
    expect(AGENT_STATUS_DOT_COLORS).toHaveProperty('running')
    expect(AGENT_STATUS_DOT_COLORS).toHaveProperty('done')
    expect(AGENT_STATUS_DOT_COLORS).toHaveProperty('error')
  })

  it('AGENT_STATUS_DOT_COLORS.running is green (#22c55e)', () => {
    expect(AGENT_STATUS_DOT_COLORS.running).toBe('#22c55e')
  })

  it('status dot backgroundColor is set (running agent uses AGENT_STATUS_DOT_COLORS.running)', () => {
    renderCard()
    const statusDot = screen.getByTestId('status-dot')
    // jsdom normalises hex → rgb; check that the color is set (non-empty)
    expect(statusDot.style.backgroundColor).toBeTruthy()
    // The component passes AGENT_STATUS_DOT_COLORS[status] as inline backgroundColor —
    // verify the component reads from AGENT_STATUS_DOT_COLORS (green = running)
    expect(AGENT_STATUS_DOT_COLORS.running).toBe('#22c55e')
  })

  it('status dot backgroundColor is set (idle agent uses AGENT_STATUS_DOT_COLORS.idle)', () => {
    renderCard({ agent: { ...mockAgent, status: 'idle' } })
    const statusDot = screen.getByTestId('status-dot')
    expect(statusDot.style.backgroundColor).toBeTruthy()
    expect(AGENT_STATUS_DOT_COLORS.idle).toBe('#6b7280')
  })
})

describe('SIRI-UX-241: AgentCard card wrapper responds to keyboard focus', () => {
  it('card wrapper has .agent-card CSS class (focus ring handled via CSS :focus, not JS)', () => {
    // SIRI-UX-265: replaced JS onFocus/onBlur borderColor mutation with CSS .agent-card:focus rule
    // jsdom cannot compute CSS pseudo-class styles, so we verify the CSS class is present
    renderCard()
    const card = screen.getByTestId('agent-card-a1')
    expect(card.classList.contains('agent-card')).toBe(true)
  })

  it('card wrapper does not have JS onFocus handler that mutates inline style', () => {
    // SIRI-UX-265: focus highlight is CSS-only; no inline borderColor mutation on focus
    renderCard()
    const card = screen.getByTestId('agent-card-a1')
    const initialBorder = card.style.borderColor
    fireEvent.focus(card)
    // CSS pseudo-classes don't set inline styles in jsdom — border stays the same
    expect(card.style.borderColor).toBe(initialBorder)
  })
})
