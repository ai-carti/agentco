import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

// SIRI-UX-007: AgentPage is now view-only; editing goes through AgentEditPage

// Default mock that handles all three parallel fetches (agent + tasks + memory)
function mockAllFetches(agentData = { id: 'a1', name: 'My Agent', role: 'Engineer', model: 'gpt-4o', system_prompt: 'Be helpful' }) {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/memory')) return Promise.resolve({ ok: true, json: async () => [] })
    if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
    return Promise.resolve({ ok: true, json: async () => agentData })
  })
}

// Helper: wait for all three fetches to settle (agent → name-display, tasks → empty history, memory → empty memories)
async function waitForAllFetches() {
  await waitFor(() => {
    expect(screen.getByTestId('agent-name-display')).toBeInTheDocument()
  })
  // Wait for tasks and memory fetches to also complete (empty state text appears after both settle)
  await waitFor(() => {
    expect(screen.getByText('No memories yet')).toBeInTheDocument()
    expect(screen.getByText('No completed tasks yet')).toBeInTheDocument()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

function renderAgentPage(agentId = 'agent-1', companyId = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}`]}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SIRI-UX-007: AgentPage view-only', () => {
  it('renders agent page', async () => {
    mockAllFetches()
    renderAgentPage()
    // Wait for all three parallel fetches (agent + tasks + memory) to resolve
    await waitForAllFetches()
    expect(screen.getByTestId('agent-page')).toBeInTheDocument()
  })

  it('shows read-only display fields (no editable inputs)', async () => {
    mockAllFetches({ id: 'a1', name: 'My Agent', role: 'Engineer', model: 'gpt-4o', system_prompt: 'Be helpful' })
    renderAgentPage()
    // Wait for all three parallel fetches (agent + tasks + memory) to settle
    await waitForAllFetches()
    expect(screen.getByTestId('agent-name-display')).toBeInTheDocument()
    expect(screen.getByTestId('agent-role-display')).toBeInTheDocument()
    expect(screen.getByTestId('agent-model-display')).toBeInTheDocument()
    expect(screen.getByTestId('agent-system-prompt-display')).toBeInTheDocument()
  })

  it('does NOT render editable AgentForm on the page', async () => {
    mockAllFetches()
    renderAgentPage()
    // Wait for all three parallel fetches to complete before asserting absence
    await waitForAllFetches()
    expect(screen.queryByTestId('agent-name-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agent-form-submit')).not.toBeInTheDocument()
  })

  it('renders Edit button', async () => {
    mockAllFetches({ id: 'a1', name: 'My Agent', role: 'Engineer', model: 'gpt-4o', system_prompt: '' })
    renderAgentPage()
    expect(screen.getByTestId('agent-edit-btn')).toBeInTheDocument()
    // Wait for all three parallel fetches (agent + tasks + memory) to complete
    await waitForAllFetches()
  })
})
