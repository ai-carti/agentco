/**
 * SIRI-UX-450 — Sidebar inline style for width/position replaced with Tailwind classes
 * AC: Sidebar.tsx has no inline `style` for width/minHeight/position/top/left/bottom/zIndex
 */
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('SIRI-UX-450 — Sidebar uses Tailwind classes instead of inline styles', () => {
  it('sidebar has no inline style for width on desktop (expanded)', () => {
    renderSidebar()
    const sidebar = screen.getByTestId('sidebar')
    // Should NOT have inline width style — width is now via Tailwind class
    expect(sidebar.style.width).toBe('')
    // Should have the expanded Tailwind class
    expect(sidebar.className).toContain('w-60')
  })

  it('sidebar has no inline style for width on desktop (collapsed)', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.style.width).toBe('')
    expect(sidebar.className).toContain('w-12')
  })

  it('sidebar has no inline style for minHeight', () => {
    renderSidebar()
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.style.minHeight).toBe('')
    expect(sidebar.className).toContain('min-h-full')
  })

  it('sidebar has no inline style for position on desktop', () => {
    renderSidebar()
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.style.position).toBe('')
    expect(sidebar.className).toContain('relative')
  })

  it('sidebar has no inline style for position/top/left/bottom/zIndex on mobile', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 })
    renderSidebar()
    // Expand sidebar on mobile
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.style.position).toBe('')
    expect(sidebar.style.top).toBe('')
    expect(sidebar.style.left).toBe('')
    expect(sidebar.style.bottom).toBe('')
    expect(sidebar.style.zIndex).toBe('')
    // Should have Tailwind fixed positioning classes
    expect(sidebar.className).toContain('fixed')
    expect(sidebar.className).toContain('top-0')
    expect(sidebar.className).toContain('left-0')
    expect(sidebar.className).toContain('bottom-0')
    expect(sidebar.className).toContain('z-[40]')
  })
})
