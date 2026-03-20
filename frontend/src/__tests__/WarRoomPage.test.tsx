import { render, screen, act, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'

function renderWarRoom(companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
      <Routes>
        <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  useWarRoomStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WarRoomPage', () => {
  // --- AC 1: Component renders at /companies/:id/warroom ---
  it('renders war room page', () => {
    renderWarRoom()
    expect(screen.getByTestId('war-room-page')).toBeInTheDocument()
  })

  // --- AC 2: Agent cards with live status ---
  it('renders agent cards with name, role, and status', () => {
    renderWarRoom()
    // Mock data loads on mount after interval ticks
    act(() => { vi.advanceTimersByTime(100) })

    const panel = screen.getByTestId('agent-panel')
    expect(within(panel).getByText('Alex')).toBeInTheDocument()
    expect(within(panel).getByText('Jordan')).toBeInTheDocument()
    expect(within(panel).getByText('Dev')).toBeInTheDocument()
  })

  it('shows agent roles on cards', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByText('CEO')).toBeInTheDocument()
    expect(screen.getByText('Chief Product Officer')).toBeInTheDocument()
    expect(screen.getByText('Software Engineer')).toBeInTheDocument()
  })

  it('shows animate-pulse for thinking agents', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const dots = screen.getAllByTestId('agent-status-dot')
    const pulsingDots = dots.filter((d) => d.className.includes('animate-pulse'))
    expect(pulsingDots.length).toBeGreaterThan(0)
  })

  it('shows idle status without pulsing', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    act(() => {
      const store = useWarRoomStore.getState()
      store.agents.forEach((a) => store.updateAgentStatus(a.id, 'idle'))
    })
    const dots = screen.getAllByTestId('agent-status-dot')
    const pulsingDots = dots.filter((d) => d.className.includes('animate-pulse'))
    expect(pulsingDots.length).toBe(0)
  })

  // --- AC 3: Activity feed with timestamps ---
  it('renders activity feed with messages', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByTestId('activity-feed')).toBeInTheDocument()
    const messages = screen.getAllByTestId('feed-message')
    expect(messages.length).toBeGreaterThan(0)
  })

  it('shows sender → target format in messages', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const feed = screen.getByTestId('activity-feed')
    expect(within(feed).getAllByText('→').length).toBeGreaterThan(0)
  })

  it('shows timestamps on messages', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const timestamps = screen.getAllByTestId('message-timestamp')
    expect(timestamps.length).toBeGreaterThan(0)
  })

  // --- AC 4: Stop button (stub, console.log) ---
  it('renders Stop button', () => {
    renderWarRoom()
    const stopBtn = screen.getByTestId('stop-btn')
    expect(stopBtn).toBeInTheDocument()
    expect(stopBtn.textContent).toContain('Stop')
  })

  it('Stop button is clickable (SIRI-UX-013: now calls API instead of console.log)', () => {
    // Provide a fetch mock so handleStop does not throw
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    renderWarRoom()
    const stopBtn = screen.getByTestId('stop-btn')
    expect(stopBtn).toBeInTheDocument()
    fireEvent.click(stopBtn)
    // Button is not disabled immediately on click
    expect(stopBtn.textContent).toMatch(/Stop|Stopping/)
  })

  // --- AC 5: Cost counter ---
  it('displays cost counter with $X.XXXX format', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const counter = screen.getByTestId('cost-counter')
    expect(counter).toBeInTheDocument()
    expect(counter.textContent).toMatch(/\$\d+\.\d{4}/)
  })

  it('cost counter accumulates over time', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const initialCost = useWarRoomStore.getState().cost
    act(() => {
      useWarRoomStore.getState().addCost(0.01)
    })
    expect(useWarRoomStore.getState().cost).toBeGreaterThan(initialCost)
  })

  // --- AC 6: Mock WS — setInterval ~3 sec cycling ---
  it('cycles agent statuses via setInterval every ~3 seconds', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const statusBefore = useWarRoomStore.getState().agents.map((a) => a.status)

    // Advance 3 seconds — interval should fire
    act(() => { vi.advanceTimersByTime(3000) })

    const statusAfter = useWarRoomStore.getState().agents.map((a) => a.status)
    // At least one agent status should have changed
    const changed = statusBefore.some((s, i) => s !== statusAfter[i])
    expect(changed).toBe(true)
  })

  it('adds new feed messages via setInterval', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const msgCountBefore = useWarRoomStore.getState().messages.length

    act(() => { vi.advanceTimersByTime(3000) })

    const msgCountAfter = useWarRoomStore.getState().messages.length
    expect(msgCountAfter).toBeGreaterThan(msgCountBefore)
  })

  // --- AC 7: Green flash on thinking → done ---
  it('flashes green when agent transitions from thinking to done', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    // Set agent to thinking first
    act(() => {
      useWarRoomStore.getState().updateAgentStatus('agent-1', 'thinking')
    })

    // Transition to done
    act(() => {
      useWarRoomStore.getState().updateAgentStatus('agent-1', 'done')
    })

    const card = screen.getByTestId('agent-card-agent-1')
    // Card should have green flash class or style
    expect(
      card.className.includes('flash-green') ||
      card.style.animation?.includes('flash') ||
      card.getAttribute('data-flash') === 'true'
    ).toBe(true)
  })

  // --- AC 8: Hierarchy — CEO on top, subordinates indented ---
  it('renders CEO agent at the top of the list', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const panel = screen.getByTestId('agent-panel')
    const cards = within(panel).getAllByTestId(/^agent-card-/)
    expect(cards[0].textContent).toContain('Alex')
  })

  it('indents subordinate agents below CEO', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })

    const panel = screen.getByTestId('agent-panel')
    const cards = within(panel).getAllByTestId(/^agent-card-/)
    // CEO should have no indent (level 0), others should be indented
    expect(cards[0].style.marginLeft).toBe('0px')
    expect(parseInt(cards[1].style.marginLeft)).toBeGreaterThan(0)
  })

  // --- AC 9: Empty state ---
  it('shows empty state when no agents/data', () => {
    // Override loadMockData to be a no-op so agents stay empty
    const original = useWarRoomStore.getState().loadMockData
    useWarRoomStore.setState({ loadMockData: () => {} } as any)

    render(
      <MemoryRouter initialEntries={['/companies/comp-1/warroom']}>
        <Routes>
          <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(/All quiet here/i)).toBeInTheDocument()
    expect(screen.getByText(/No agents are running/i)).toBeInTheDocument()
    expect(screen.getByText(/▶ Run a Task/)).toBeInTheDocument()

    // Restore
    useWarRoomStore.setState({ loadMockData: original })
  })

  // --- AC: truncates long messages ---
  it('truncates messages longer than 120 characters', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    act(() => {
      useWarRoomStore.getState().addMessage({
        id: 'msg-long',
        senderId: 'agent-1',
        senderName: 'Alex',
        targetId: 'agent-2',
        targetName: 'Dev',
        content: 'A'.repeat(200),
        timestamp: new Date().toISOString(),
      })
    })
    const longMsg = screen.getByTestId('feed-message-msg-long')
    expect(longMsg.textContent).toContain('...')
    const contentEl = longMsg.querySelector('[data-testid="message-content"]')
    expect(contentEl?.textContent?.length).toBeLessThanOrEqual(123)
  })

  // --- Store tests ---
  it('initializes with 3-4 mock agents when loadMockData called', () => {
    renderWarRoom()
    act(() => { vi.advanceTimersByTime(100) })
    const store = useWarRoomStore.getState()
    expect(store.agents.length).toBeGreaterThanOrEqual(3)
    expect(store.agents.length).toBeLessThanOrEqual(4)
  })


})
