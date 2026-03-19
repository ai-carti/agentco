/**
 * SIRI-UX-011: Breadcrumb on root `/` should NOT show "Select company"
 * Root is Companies List — no company context needed in breadcrumb
 *
 * SIRI-UX-042 update: Breadcrumb no longer renders on /companies/:id at all.
 * CompanyHeader inside CompanyPage is the single nav context for company pages.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  useAgentStore.setState({ currentCompany: null })
})

function renderBreadcrumb(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Breadcrumb />
    </MemoryRouter>,
  )
}

describe('SIRI-UX-011: Breadcrumb root page fix', () => {
  it('does NOT show "Select company" on root / page', () => {
    renderBreadcrumb('/')
    expect(screen.queryByText('Select company')).not.toBeInTheDocument()
  })

  it('shows only "AgentCo" on root / page (no company block)', () => {
    renderBreadcrumb('/')
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
    // No separator ">" for company block
    const breadcrumb = screen.getByTestId('breadcrumb')
    expect(breadcrumb.textContent).not.toContain('Select company')
  })

  // SIRI-UX-042: Breadcrumb is hidden on /companies/:id — CompanyHeader owns that context
  it('does NOT render on /companies/:id when company not loaded', () => {
    renderBreadcrumb('/companies/c1')
    expect(screen.queryByTestId('breadcrumb')).not.toBeInTheDocument()
  })

  it('does NOT render on /companies/:id when company is loaded', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1')
    expect(screen.queryByTestId('breadcrumb')).not.toBeInTheDocument()
  })
})
