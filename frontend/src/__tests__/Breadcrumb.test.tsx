import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import { useAgentStore } from '../store/agentStore'

describe('Breadcrumb', () => {
  beforeEach(() => {
    useAgentStore.setState({ currentCompany: null })
  })

  function renderBreadcrumb(route = '/') {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <Breadcrumb />
      </MemoryRouter>,
    )
  }

  it('renders breadcrumb container', () => {
    renderBreadcrumb()
    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument()
  })

  it('shows only "AgentCo" on root page (no "Select company" — root is companies list)', () => {
    renderBreadcrumb('/')
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
    // SIRI-UX-011: Root is companies list, no company context needed
    expect(screen.queryByText('Select company')).not.toBeInTheDocument()
  })

  // SIRI-UX-042: Breadcrumb is hidden on /companies/:id — CompanyHeader in CompanyPage owns that context
  it('does NOT render on company overview page /companies/:id', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1')
    expect(screen.queryByTestId('breadcrumb')).not.toBeInTheDocument()
  })

  it('shows section "Agent" on agent detail page', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1/agents/a1')
    expect(screen.getByText('Agent')).toBeInTheDocument()
  })

  it('shows "Settings" section on settings page', () => {
    renderBreadcrumb('/settings')
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  // BUG-022: /settings should NOT show company block
  it('does NOT show "Select company" on /settings page', () => {
    renderBreadcrumb('/settings')
    expect(screen.queryByText('Select company')).not.toBeInTheDocument()
    // Should be "AgentCo > Settings" only
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows "Select company" on agent sub-page when company not loaded yet', () => {
    renderBreadcrumb('/companies/c1/agents/a1')
    expect(screen.getByText('Select company')).toBeInTheDocument()
  })

  it('does NOT show company block on root / page', () => {
    renderBreadcrumb('/')
    // Root page is the companies list — no company context needed
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
  })

  it('AgentCo link points to companies list', () => {
    renderBreadcrumb('/companies/c1/agents/a1')
    const agentCoLink = screen.getByText('AgentCo')
    expect(agentCoLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('is visible on all protected page routes except company overview', () => {
    const visibleRoutes = ['/', '/companies/c1/agents/a1', '/settings']
    for (const route of visibleRoutes) {
      const { unmount } = renderBreadcrumb(route)
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument()
      unmount()
    }
    // Company overview hides breadcrumb — CompanyHeader takes over
    renderBreadcrumb('/companies/c1')
    expect(screen.queryByTestId('breadcrumb')).not.toBeInTheDocument()
  })
})
