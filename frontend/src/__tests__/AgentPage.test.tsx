import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

// BUG-017: AgentPage integrates AgentForm for create/edit agent

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

describe('BUG-017: AgentPage integrates AgentForm', () => {
  it('renders agent page', () => {
    renderAgentPage()
    expect(screen.getByTestId('agent-page')).toBeInTheDocument()
  })

  it('renders AgentForm with model selector dropdown', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o', 'claude-sonnet-4-5'] }),
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('model-select')).toBeInTheDocument()
    })
    expect(screen.getByTestId('model-select').tagName).toBe('SELECT')
  })

  it('AgentForm is accessible to user — name and role inputs present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o'] }),
    })
    renderAgentPage()
    await waitFor(() => {
      expect(screen.getByTestId('agent-name-input')).toBeInTheDocument()
      expect(screen.getByTestId('agent-role-input')).toBeInTheDocument()
    })
  })

  it('user can submit agent form', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: ['gpt-4o', 'gpt-4o-mini'] }),
    })
    renderAgentPage()
    await waitFor(() => screen.getByTestId('model-select'))

    fireEvent.change(screen.getByTestId('agent-name-input'), {
      target: { value: 'Test Agent' },
    })
    fireEvent.change(screen.getByTestId('agent-role-input'), {
      target: { value: 'Engineer' },
    })
    fireEvent.change(screen.getByTestId('model-select'), {
      target: { value: 'gpt-4o' },
    })
    fireEvent.click(screen.getByTestId('agent-form-submit'))

    // Form submitted without crash — success state or just no error
    await waitFor(() => {
      expect(screen.getByTestId('agent-page')).toBeInTheDocument()
    })
  })
})
