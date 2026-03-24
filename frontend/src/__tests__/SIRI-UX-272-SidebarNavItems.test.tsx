/**
 * SIRI-UX-272: Sidebar NAV_ITEMS should be module-level constant, not recreated on each render.
 * After the fix, static nav items (Companies, Library, Settings) are module-level;
 * War Room path is computed once via useMemo or inline in NavLink.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { useAgentStore } from '../store/agentStore'

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

describe('SIRI-UX-272: Sidebar nav items are stable across renders', () => {
  it('renders all 4 nav items', () => {
    useAgentStore.setState({ currentCompany: null })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('sidebar-nav-companies')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-warroom')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-library')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-settings')).toBeTruthy()
  })

  it('War Room nav item points to company route when company is set', () => {
    useAgentStore.setState({ currentCompany: { id: 'co-123', name: 'Test Co' } })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    const warRoomLink = screen.getByTestId('sidebar-nav-warroom')
    expect(warRoomLink.getAttribute('href')).toContain('co-123')
  })

  it('War Room nav item points to "/" when no company is set', () => {
    useAgentStore.setState({ currentCompany: null })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    const warRoomLink = screen.getByTestId('sidebar-nav-warroom')
    expect(warRoomLink.getAttribute('href')).toBe('/')
  })
})
