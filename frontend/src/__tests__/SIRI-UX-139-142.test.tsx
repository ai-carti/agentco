/**
 * SIRI-UX-139: warRoomStore.addMessage caps messages at MAX_MESSAGES (300)
 * SIRI-UX-140: App Suspense fallback shows spinner (checked via App snapshot, not runtime)
 * SIRI-UX-141: Navbar has aria-label="Main navigation", Sidebar nav has aria-label="Sidebar navigation"
 * SIRI-UX-142: GlobalSearch results have role="listbox" / role="option" / aria-selected
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useWarRoomStore } from '../store/warRoomStore'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import GlobalSearch from '../components/GlobalSearch'
import { useAuthStore } from '../store/authStore'
import { useAgentStore } from '../store/agentStore'
import { ToastProvider } from '../context/ToastContext'

// ---- SIRI-UX-139: messages cap ----
describe('SIRI-UX-139: warRoomStore messages cap at MAX_MESSAGES=300', () => {
  beforeEach(() => {
    useWarRoomStore.getState().reset()
  })

  it('caps messages array at 300 entries', () => {
    const store = useWarRoomStore.getState()
    // Add 350 messages
    for (let i = 0; i < 350; i++) {
      store.addMessage({
        id: `msg-${i}`,
        senderName: 'Agent',
        targetName: 'Agent',
        content: `Message ${i}`,
        timestamp: new Date().toISOString(),
      })
    }
    expect(useWarRoomStore.getState().messages.length).toBe(300)
  })

  it('keeps the most recent messages (slices from the front)', () => {
    const store = useWarRoomStore.getState()
    for (let i = 0; i < 350; i++) {
      store.addMessage({
        id: `msg-${i}`,
        senderName: 'Agent',
        targetName: 'Agent',
        content: `Message ${i}`,
        timestamp: new Date().toISOString(),
      })
    }
    const msgs = useWarRoomStore.getState().messages
    // Last message should be msg-349
    expect(msgs[msgs.length - 1].id).toBe('msg-349')
    // First message should be msg-50 (350 - 300 = 50 trimmed)
    expect(msgs[0].id).toBe('msg-50')
  })

  it('does not cap when under limit', () => {
    const store = useWarRoomStore.getState()
    for (let i = 0; i < 100; i++) {
      store.addMessage({
        id: `msg-${i}`,
        senderName: 'Agent',
        targetName: 'Agent',
        content: `Message ${i}`,
        timestamp: new Date().toISOString(),
      })
    }
    expect(useWarRoomStore.getState().messages.length).toBe(100)
  })
})

// ---- SIRI-UX-141: Navbar aria-label ----
describe('SIRI-UX-141: Navbar has aria-label="Main navigation"', () => {
  it('Navbar nav element has aria-label="Main navigation"', () => {
    useAuthStore.setState({ user: { email: 'test@test.com', id: '1' }, token: 'tok' })
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav).toBeInTheDocument()
  })
})

describe('SIRI-UX-141: Sidebar nav has aria-label="Sidebar navigation"', () => {
  it('Sidebar nav element has aria-label="Sidebar navigation"', () => {
    useAgentStore.setState({ currentCompany: null })
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Sidebar navigation' })
    expect(nav).toBeInTheDocument()
  })
})

// ---- SIRI-UX-142: GlobalSearch ARIA ----
describe('SIRI-UX-142: GlobalSearch ARIA roles', () => {
  beforeEach(() => {
    useAgentStore.setState({
      currentCompany: { id: 'c1', name: 'Acme Corp' },
      agents: [{ id: 'a1', name: 'CEO Agent', role: 'Executive', status: 'idle', companyId: 'c1' }],
      tasks: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('search results container has role="listbox"', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <GlobalSearch />
        </ToastProvider>
      </MemoryRouter>,
    )
    // Open search
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    // Type query that will match
    fireEvent.change(screen.getByTestId('global-search-input'), { target: { value: 'ceo' } })
    await waitFor(() => {
      expect(screen.queryByTestId('search-results')).toBeInTheDocument()
    })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('each result item has role="option"', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <GlobalSearch />
        </ToastProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    fireEvent.change(screen.getByTestId('global-search-input'), { target: { value: 'ceo' } })
    await waitFor(() => {
      const options = screen.queryAllByRole('option')
      expect(options.length).toBeGreaterThan(0)
    })
  })

  it('active result has aria-selected=true', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <GlobalSearch />
        </ToastProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    fireEvent.change(screen.getByTestId('global-search-input'), { target: { value: 'ceo' } })
    await waitFor(() => {
      expect(screen.queryAllByRole('option').length).toBeGreaterThan(0)
    })
    // Press ArrowDown to activate first result
    fireEvent.keyDown(screen.getByTestId('global-search-input'), { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('search input has role="combobox"', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <GlobalSearch />
        </ToastProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('global-search-trigger'))
    const input = screen.getByTestId('global-search-input')
    expect(input).toHaveAttribute('role', 'combobox')
  })
})
