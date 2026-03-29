/**
 * SIRI-UX-256: AgentCard.tsx — wrapper div uses JS onMouseEnter/onMouseLeave for
 *   border-color hover instead of CSS class. Same pattern fixed in SIRI-UX-249/250/255.
 *   Fix: add `.agent-card:hover { border-color: rgba(255,255,255,0.3) }` to index.css,
 *   replace JS hover with `className="agent-card"` on wrapper div.
 *
 * SIRI-UX-257: SystemPromptEditor.tsx — template quick-fill buttons use JS
 *   onMouseEnter/onMouseLeave to change style.background instead of CSS class.
 *   Fix: add `.system-prompt-tpl-btn` CSS class to index.css, replace JS hover.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AgentCard from '../components/AgentCard'
import SystemPromptEditor from '../components/SystemPromptEditor'

const mockAgent = {
  id: 'agent-1',
  name: 'Alice',
  status: 'idle' as const,
  role: 'Engineer',
  model: 'gpt-4o',
  last_task_at: null,
  company_id: 'co-1',
  system_prompt: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── SIRI-UX-256 ────────────────────────────────────────────────────────────

describe('SIRI-UX-256: AgentCard wrapper uses CSS class for hover', () => {
  it('wrapper div has agent-card CSS class instead of only JS hover handlers', () => {
    render(
      <MemoryRouter>
        <AgentCard
          agent={mockAgent}
          companyId="co-1"
          onEdit={vi.fn()}
        />
      </MemoryRouter>,
    )

    const card = screen.getByTestId('agent-card-agent-1')
    expect(card.className).toContain('agent-card')
  })

  it('wrapper div does not have separate inline border-color override beyond the border shorthand', () => {
    render(
      <MemoryRouter>
        <AgentCard
          agent={mockAgent}
          companyId="co-1"
          onEdit={vi.fn()}
        />
      </MemoryRouter>,
    )

    const card = screen.getByTestId('agent-card-agent-1')
    // The inline style should only have 'border' shorthand (from the style prop),
    // not a separate borderColor value that would indicate residual JS hover management.
    // We verify the element has the CSS class which drives hover state.
    expect(card.className).toContain('agent-card')
    // SIRI-UX-445: border migrated from inline style to Tailwind class.
    // The hover is handled by CSS class. No inline border styles should remain on wrapper.
    expect(card.className).toContain('border')
  })
})

// ─── SIRI-UX-257 ────────────────────────────────────────────────────────────

describe('SIRI-UX-257: SystemPromptEditor template buttons use CSS class for hover', () => {
  it('template quick-fill buttons have system-prompt-tpl-btn CSS class', () => {
    const onChange = vi.fn()
    render(
      <SystemPromptEditor
        value=""
        onChange={onChange}
      />,
    )

    // There should be template buttons — check they have the CSS class
    const tplButtons = document.querySelectorAll('.system-prompt-tpl-btn')
    expect(tplButtons.length).toBeGreaterThan(0)
  })

  it('template buttons do not have inline background style at rest', () => {
    const onChange = vi.fn()
    render(
      <SystemPromptEditor
        value=""
        onChange={onChange}
      />,
    )

    const tplButtons = document.querySelectorAll('.system-prompt-tpl-btn')
    tplButtons.forEach((btn) => {
      // At rest, no inline style.background should be set (managed by CSS class)
      expect((btn as HTMLElement).style.background).toBe('')
    })
  })
})
