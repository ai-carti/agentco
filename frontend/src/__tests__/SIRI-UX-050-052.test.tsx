import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false }),
}))

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const LONG_MESSAGE = 'This is a very long message that definitely exceeds one hundred and twenty characters and should be truncated by default but expandable'

type MockAgent = { id: string; name: string; role: string; avatar: string; level: number; status: 'idle' | 'thinking' | 'running' | 'done' }
type MockMessage = { id: string; senderName: string; targetName: string; content: string; timestamp: string }

const mockAgents: MockAgent[] = [
  { id: 'a1', name: 'CEO', role: 'Chief Executive Officer', avatar: '🤖', level: 0, status: 'running' },
]

let _storeMessages: MockMessage[] = []

vi.mock('../store/warRoomStore', () => ({
  useWarRoomStore: vi.fn((sel: (s: object) => unknown) => {
    const state = {
      agents: mockAgents,
      messages: _storeMessages,
      cost: 0,
      flashingAgents: new Set<string>(),
      loadMockData: vi.fn(),
      addMessage: vi.fn(),
      updateAgentStatus: vi.fn(),
      addCost: vi.fn(),
      clearFlash: vi.fn(),
      reset: vi.fn(),
    }
    return sel(state)
  }),
  getNextMockEvent: vi.fn(() => ({
    message: { id: 'm2', senderName: 'CEO', targetName: 'CPO', content: 'Update', timestamp: new Date().toISOString() },
    statusUpdate: null,
  })),
}))

import WarRoomPage from '../components/WarRoomPage'

// SIRI-UX-050: Activity feed messages expand/collapse on click
describe('SIRI-UX-050: Activity feed expand/collapse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('long messages are truncated by default (≤123 chars visible)', async () => {
    _storeMessages = [{ id: 'msg-long', senderName: 'CEO', targetName: 'CPO', content: LONG_MESSAGE, timestamp: new Date().toISOString() }]
    render(
      <MemoryRouter initialEntries={['/companies/co1']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => screen.getAllByTestId('message-content').length > 0)
    const content = screen.getAllByTestId('message-content')[0]
    expect(content.textContent?.length).toBeLessThanOrEqual(124)
    expect(content.textContent).not.toContain('expandable')
  })

  it('clicking a long message reveals full text', async () => {
    _storeMessages = [{ id: 'msg-long2', senderName: 'CEO', targetName: 'CPO', content: LONG_MESSAGE, timestamp: new Date().toISOString() }]
    render(
      <MemoryRouter initialEntries={['/companies/co1']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => screen.getAllByTestId('feed-message').length > 0)
    fireEvent.click(screen.getAllByTestId('feed-message')[0])
    await waitFor(() => {
      const allContents = screen.getAllByTestId('message-content')
      expect(allContents[0].textContent).toContain('expandable')
    })
  })
})

// SIRI-UX-052: /war-room route redirects to / when no company context
describe('SIRI-UX-052: /war-room route redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
  })

  it('Sidebar War Room link points to / when no company is active', async () => {
    const { useAgentStore } = await import('../store/agentStore')
    useAgentStore.setState({ currentCompany: null, activeCompanyTab: null })
    const { default: Sidebar } = await import('../components/Sidebar')
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    const warRoomLink = screen.getByTestId('sidebar-nav-warroom')
    expect(warRoomLink.getAttribute('href')).toBe('/')
  })

  it('Sidebar War Room link points to company page when company is active', async () => {
    const { useAgentStore } = await import('../store/agentStore')
    useAgentStore.setState({ currentCompany: { id: 'co-123', name: 'Test Co' }, activeCompanyTab: null })
    const { default: Sidebar } = await import('../components/Sidebar')
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    const warRoomLink = screen.getByTestId('sidebar-nav-warroom')
    expect(warRoomLink.getAttribute('href')).toBe('/companies/co-123')
  })
})
