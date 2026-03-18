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
  it('shows "Board" when activeSection is "board"', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1', 'board')
    expect(screen.getByText('Board')).toBeInTheDocument()
    expect(screen.queryByText('War Room')).not.toBeInTheDocument()
  })

  it('shows "War Room" when activeSection is "war-room"', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1', 'war-room')
    expect(screen.getByText('War Room')).toBeInTheDocument()
    expect(screen.queryByText('Board')).not.toBeInTheDocument()
  })

  it('shows "War Room" as default when no activeSection on company page', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1')
    expect(screen.getByText('War Room')).toBeInTheDocument()
  })

  it('shows "Agents" when activeSection is "agents"', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderBreadcrumb('/companies/c1', 'agents')
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })
})
