import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '../components/Sidebar'

beforeEach(() => {
  localStorage.clear()
  // Default: wide screen
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
})

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('Sidebar — UX-019', () => {
  it('renders sidebar element', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
  })

  it('starts expanded (240px) on wide screens', () => {
    renderSidebar()
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.style.width).toBe('240px')
  })

  it('toggle button collapses to 48px', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.style.width).toBe('48px')
  })

  it('toggle button expands back to 240px', () => {
    renderSidebar()
    const toggle = screen.getByTestId('sidebar-toggle')
    fireEvent.click(toggle) // collapse
    fireEvent.click(toggle) // expand
    expect(screen.getByTestId('sidebar').style.width).toBe('240px')
  })

  it('persists collapsed state to localStorage', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    expect(localStorage.getItem('sidebar:collapsed')).toBe('true')
  })

  it('restores collapsed state from localStorage', () => {
    localStorage.setItem('sidebar:collapsed', 'true')
    renderSidebar()
    expect(screen.getByTestId('sidebar').style.width).toBe('48px')
  })

  it('defaults to collapsed on screens < 1024px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 })
    renderSidebar()
    expect(screen.getByTestId('sidebar').style.width).toBe('48px')
  })

  it('shows only icons when collapsed (nav items have tooltip attribute)', () => {
    renderSidebar()
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    const navItems = screen.getAllByTestId(/^sidebar-nav-/)
    // Each collapsed item should have a title (tooltip)
    for (const item of navItems) {
      expect(item.getAttribute('title')).toBeTruthy()
    }
  })

  it('toggle button is always visible', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar-toggle')).toBeVisible()
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    expect(screen.getByTestId('sidebar-toggle')).toBeVisible()
  })

  it('on mobile (< 640px) renders overlay mode with backdrop', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 })
    renderSidebar()
    // Initially collapsed on mobile
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument()
  })

  it('has smooth transition style', () => {
    renderSidebar()
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.style.transition).toContain('width')
  })
})
