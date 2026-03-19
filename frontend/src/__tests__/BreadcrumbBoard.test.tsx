import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  useAgentStore.setState({ currentCompany: null })
})

function renderBreadcrumb(route = '/', section?: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Breadcrumb activeSection={section} />
    </MemoryRouter>,
  )
}

describe('SIRI-UX-008: Breadcrumb board section', () => {
  // SIRI-UX-042: On /companies/:id the CompanyHeader inside CompanyPage owns navigation.
  // Breadcrumb renders null for that route — section labels live in CompanyHeader / tab UI.
  it('does NOT render on /companies/:id — CompanyHeader owns that context', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1', 'board')
    expect(screen.queryByTestId('breadcrumb')).not.toBeInTheDocument()
  })

  it('does NOT render on /companies/:id with any activeSection', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    for (const section of ['war-room', 'board', 'agents', undefined]) {
      const { unmount } = renderBreadcrumb('/companies/c1', section)
      expect(screen.queryByTestId('breadcrumb')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('shows "Agent" on agent sub-page', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1/agents/a1')
    expect(screen.getByText('Agent')).toBeInTheDocument()
  })

  it('shows company name on agent sub-page', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1/agents/a1')
    expect(screen.getByText('My Startup')).toBeInTheDocument()
  })
})
