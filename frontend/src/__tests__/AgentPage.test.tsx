import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

// SIRI-UX-007: AgentPage is now view-only; editing goes through AgentEditPage

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
  it('renders agent page', () => {
    renderAgentPage()
    expect(screen.getByTestId('agent-page')).toBeInTheDocument()
  })

  it('shows read-only display fields (no editable inputs)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'a1', name: 'My Agent', role: 'Engineer', model: 'gpt-4o', system_prompt: 'Be helpful' }),
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-name-display')).toBeInTheDocument()
    })
    expect(screen.getByTestId('agent-role-display')).toBeInTheDocument()
    expect(screen.getByTestId('agent-model-display')).toBeInTheDocument()
    expect(screen.getByTestId('agent-system-prompt-display')).toBeInTheDocument()
  })

  it('does NOT render editable AgentForm on the page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    renderAgentPage()
    // Wait briefly for any async operations
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('agent-name-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agent-form-submit')).not.toBeInTheDocument()
  })

  it('renders Edit button', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'a1', name: 'My Agent' }),
    })
    renderAgentPage()
    expect(screen.getByTestId('agent-edit-btn')).toBeInTheDocument()
  })
})
