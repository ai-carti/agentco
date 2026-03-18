import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

beforeEach(() => {
  vi.clearAllMocks()
})

function renderAgentPage(agentId = 'agent-1', companyId = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}/agents/${agentId}`]}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
        <Route path="/companies/:id/agents/:agentId/edit" element={<div data-testid="edit-page">Edit</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const mockAgent = {
  id: 'agent-1',
  name: 'Test Agent',
  role: 'Engineer',
  model: 'gpt-4o',
  system_prompt: 'You are an engineer.',
}

describe('SIRI-UX-007: AgentPage read-only view', () => {
  it('shows agent name in read-only display', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockAgent })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-name-display')).toBeInTheDocument()
    })
    expect(screen.getByTestId('agent-name-display')).toHaveTextContent('Test Agent')
  })

  it('shows agent role in read-only display', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockAgent })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-role-display')).toBeInTheDocument()
    })
    expect(screen.getByTestId('agent-role-display')).toHaveTextContent('Engineer')
  })

  it('shows agent model in read-only display', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockAgent })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-model-display')).toBeInTheDocument()
    })
    expect(screen.getByTestId('agent-model-display')).toHaveTextContent('gpt-4o')
  })

  it('shows system prompt in read-only display', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockAgent })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-system-prompt-display')).toBeInTheDocument()
    })
    expect(screen.getByTestId('agent-system-prompt-display')).toHaveTextContent('You are an engineer.')
  })

  it('does NOT render editable AgentForm inputs on AgentPage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockAgent })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-page')).toBeInTheDocument()
    })
    // Wait a bit to ensure form would have loaded if present
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('agent-name-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agent-role-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('model-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('agent-form-submit')).not.toBeInTheDocument()
  })

  it('Edit button navigates to edit page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockAgent })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-edit-btn')).toBeInTheDocument()
    })
    // Button should be present and visible
    expect(screen.getByTestId('agent-edit-btn')).toBeVisible()
  })
})
