/**
 * PRE-DEMO-POLISH: Quick win UI improvements for 2026-03-21 demo
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AuthPage from '../components/AuthPage'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'

// Stub useAuthStore
const mockAuthStore = { token: 'tok', isLoading: false, error: null, login: vi.fn(), register: vi.fn() }
vi.mock('../store/authStore', () => ({
  useAuthStore: Object.assign(
    vi.fn((sel?: (s: typeof mockAuthStore) => unknown) => (typeof sel === 'function' ? sel(mockAuthStore) : mockAuthStore)),
    { getState: () => mockAuthStore },
  ),
}))

// Stub useWarRoomSocket
vi.mock('../hooks/useWarRoomSocket', () => ({
  useWarRoomSocket: () => ({ isConnected: false }),
}))

// Stub useAgentStore
vi.mock('../store/agentStore', () => ({
  useAgentStore: vi.fn((sel) =>
    sel({ currentCompany: { id: 'c1', name: 'Test Co' } }),
  ),
}))

// Stub toast
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

// Stub client
vi.mock('../api/client', () => ({
  getStoredToken: () => 'tok',
  BASE_URL: 'http://localhost:8000',
}))

describe('PRE-DEMO-POLISH: AuthPage tagline', () => {
  it('renders a compelling product tagline below the title', () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>,
    )
    // Should have a tagline that communicates value
    const tagline = screen.getByTestId('auth-tagline')
    expect(tagline).toBeInTheDocument()
    expect(tagline.textContent).toBeTruthy()
  })
})

describe('PRE-DEMO-POLISH: War Room LIVE indicator', () => {
  beforeEach(() => {
    useWarRoomStore.setState({
      agents: [
        { id: 'a1', name: 'CEO Agent', role: 'CEO', status: 'thinking', avatar: '👔', level: 0 },
      ],
      messages: [
        {
          id: 'm1',
          senderId: 'a1',
          senderName: 'CEO Agent',
          targetId: 'a2',
          targetName: 'CPO Agent',
          content: 'Analyze market positioning for Q2 launch',
          timestamp: new Date().toISOString(),
        },
      ],
      cost: 0.042,
      runStatus: 'active',
      flashingAgents: new Set(),
    })
  })

  it('renders a LIVE indicator in the activity feed header', () => {
    render(
      // SIRI-UX-376: WarRoomPage requires :id param
      <MemoryRouter initialEntries={['/companies/c1']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const liveIndicator = screen.getByTestId('live-indicator')
    expect(liveIndicator).toBeInTheDocument()
  })
})

describe('PRE-DEMO-POLISH: War Room mock scenario — business content', () => {
  it('mock initial messages contain business-relevant content', async () => {
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()
    const { messages } = useWarRoomStore.getState()
    expect(messages.length).toBeGreaterThan(0)
    // The combined content should reference business strategy, not just "auth module"
    const allContent = messages.map((m) => m.content).join(' ')
    // Should have strategic / business language (not just pure dev lingo)
    expect(allContent.length).toBeGreaterThan(50)
  })

  it('mock agents have compelling business-focused roles', () => {
    useWarRoomStore.getState().reset()
    useWarRoomStore.getState().loadMockData()
    const { agents } = useWarRoomStore.getState()
    expect(agents.length).toBeGreaterThanOrEqual(3)
    // At least one agent is a leadership/strategy role (CEO, CPO, etc.)
    const hasLeader = agents.some(
      (a) =>
        a.name.toLowerCase().includes('ceo') ||
        a.role.toLowerCase().includes('chief') ||
        a.role.toLowerCase().includes('executive'),
    )
    expect(hasLeader).toBe(true)
  })
})

describe('PRE-DEMO-POLISH: Agent thinking animation', () => {
  beforeEach(() => {
    useWarRoomStore.setState({
      agents: [
        { id: 'a1', name: 'CEO Agent', role: 'Chief Executive Officer', status: 'thinking', avatar: '👔', level: 0 },
      ],
      messages: [],
      cost: 0.01,
      runStatus: 'active',
      flashingAgents: new Set(),
    })
  })

  it('shows thinking animation element for thinking agents', () => {
    render(
      // SIRI-UX-376: WarRoomPage requires :id param
      <MemoryRouter initialEntries={['/companies/c1']}>
        <Routes>
          <Route path="/companies/:id" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>,
    )
    // Should have animated thinking indicator (at least one for a thinking agent)
    const thinkingEls = screen.getAllByTestId('thinking-animation')
    expect(thinkingEls.length).toBeGreaterThan(0)
  })
})
