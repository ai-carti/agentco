import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { useAgentStore } from '../store/agentStore'

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
  useAgentStore.setState({ currentCompany: null })
})

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('SIRI-UX-009: Sidebar War Room link', () => {
  it('links to / when no currentCompany', () => {
    useAgentStore.setState({ currentCompany: null })
    renderSidebar()
    const warRoomLink = screen.getByTestId('sidebar-nav-warroom')
    expect(warRoomLink).toHaveAttribute('href', '/')
  })

  it('links to /companies/:id when currentCompany is set', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'My Startup' } })
    renderSidebar()
    const warRoomLink = screen.getByTestId('sidebar-nav-warroom')
    expect(warRoomLink).toHaveAttribute('href', '/companies/c1')
  })

  it('does NOT link to /war-room (broken global route)', () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'Test Co' } })
    renderSidebar()
    const warRoomLink = screen.getByTestId('sidebar-nav-warroom')
    expect(warRoomLink).not.toHaveAttribute('href', '/war-room')
  })
})
