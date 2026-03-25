/**
 * SIRI-UX-297: WarRoomPage — merge multiple useWarRoomStore subscriptions into one useShallow
 * Tests that state (agents, messages, cost, runStatus, flashingAgents) still drives
 * the UI correctly after the refactor to a single combined selector.
 */
import { render, screen, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WarRoomPage from '../components/WarRoomPage'
import { useWarRoomStore } from '../store/warRoomStore'
import type { WarRoomAgent, FeedMessage } from '../store/warRoomStore'

function renderWarRoom(companyId = 'comp-1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/warroom`]}>
      <Routes>
        <Route path="/companies/:id/warroom" element={<WarRoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const MOCK_AGENTS: WarRoomAgent[] = [
  { id: 'agent-1', name: 'CEO Alex', role: 'CEO', status: 'thinking', avatar: '👔', level: 0 },
  { id: 'agent-2', name: 'Dev Bob', role: 'Engineer', status: 'idle', avatar: '💻', level: 1 },
]

const MOCK_MESSAGE: FeedMessage = {
  id: 'msg-1',
  senderName: 'CEO Alex',
  targetName: 'Dev Bob',
  content: 'Build the feature',
  timestamp: new Date().toISOString(),
}

beforeEach(() => {
  vi.useFakeTimers()
  useWarRoomStore.getState().reset()
  vi.stubEnv('VITE_MOCK_WAR_ROOM', 'false')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('SIRI-UX-297 — consolidated useShallow store selector', () => {
  it('renders agent cards when agents are set in store', () => {
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setAgents(MOCK_AGENTS)
    })
    const panel = screen.getByTestId('agent-panel')
    expect(within(panel).getByText('CEO Alex')).toBeInTheDocument()
    expect(within(panel).getByText('Dev Bob')).toBeInTheDocument()
  })

  it('renders messages in activity feed', () => {
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setAgents(MOCK_AGENTS)
      useWarRoomStore.getState().addMessage(MOCK_MESSAGE)
    })
    expect(screen.getByText('Build the feature')).toBeInTheDocument()
  })

  it('displays cost counter from store', () => {
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setAgents(MOCK_AGENTS)
      useWarRoomStore.getState().addCost(0.0042)
    })
    expect(screen.getByTestId('cost-counter')).toHaveTextContent('$0.0042')
  })

  it('shows run-status banner when runStatus is "done"', () => {
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setAgents(MOCK_AGENTS)
      useWarRoomStore.getState().setRunStatus('done')
    })
    expect(screen.getByTestId('run-status-banner')).toBeInTheDocument()
    expect(screen.getByTestId('run-status-banner')).toHaveTextContent('Run completed')
  })

  it('shows run-status banner when runStatus is "failed"', () => {
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setAgents(MOCK_AGENTS)
      useWarRoomStore.getState().setRunStatus('failed')
    })
    expect(screen.getByTestId('run-status-banner')).toHaveTextContent('Run failed')
  })

  it('shows flash class on agent card when flashingAgents contains agent id', () => {
    renderWarRoom()
    act(() => {
      // agent-2 starts as 'thinking' — transition to 'done' triggers flash
      useWarRoomStore.getState().setAgents([
        { ...MOCK_AGENTS[0] },
        { ...MOCK_AGENTS[1], status: 'thinking' },
      ])
    })
    act(() => {
      // thinking → done triggers flash
      useWarRoomStore.getState().updateAgentStatus('agent-2', 'done')
    })
    const card = screen.getByTestId('agent-card-agent-2')
    expect(card.getAttribute('data-flash')).toBe('true')
  })

  it('stop button is disabled when runStatus is "idle"', () => {
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setAgents(MOCK_AGENTS)
      useWarRoomStore.getState().setRunStatus('idle')
    })
    expect(screen.getByTestId('stop-btn')).toBeDisabled()
  })

  it('stop button is enabled when runStatus is "active"', () => {
    renderWarRoom()
    act(() => {
      useWarRoomStore.getState().setAgents(MOCK_AGENTS)
      useWarRoomStore.getState().setRunStatus('active')
    })
    expect(screen.getByTestId('stop-btn')).not.toBeDisabled()
  })
})
