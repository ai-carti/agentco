/**
 * SIRI-UX-011: Breadcrumb on root `/` should NOT show "Select company"
 * Root is Companies List — no company context needed in breadcrumb
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

  it('still shows "Select company" on /companies/:id when company not loaded', () => {
    renderBreadcrumb('/companies/c1')
    expect(screen.getByText('Select company')).toBeInTheDocument()
  })

  it('still shows company name on /companies/:id when loaded', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1')
    expect(screen.getByText('My Startup')).toBeInTheDocument()
  })
})
