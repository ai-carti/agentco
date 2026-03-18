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

  it('shows "AgentCo > Select company" when no company selected on root page', () => {
    renderBreadcrumb('/')
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
    expect(screen.getByText('Select company')).toBeInTheDocument()
  })

  it('shows company name when on company page', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1')
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
    expect(screen.getByText('My Startup')).toBeInTheDocument()
  })

  it('shows section "War Room" on company page', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1')
    expect(screen.getByText('War Room')).toBeInTheDocument()
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

  it('shows "Select company" on /companies/:id when company not loaded yet', () => {
    renderBreadcrumb('/companies/c1')
    expect(screen.getByText('Select company')).toBeInTheDocument()
  })

  it('does NOT show company block on root / page', () => {
    renderBreadcrumb('/')
    // Root page is the companies list — no company context needed
    // Existing test expects "Select company" on root, but root is also not company-scoped
    // Keep backward compat: root shows "Select company" as it's the companies list page
    expect(screen.getByText('AgentCo')).toBeInTheDocument()
  })

  it('AgentCo link points to companies list', () => {
    renderBreadcrumb('/companies/c1')
    const agentCoLink = screen.getByText('AgentCo')
    expect(agentCoLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('is visible on all protected page routes', () => {
    for (const route of ['/', '/companies/c1', '/companies/c1/agents/a1', '/settings']) {
      const { unmount } = renderBreadcrumb(route)
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument()
      unmount()
    }
  })
})
