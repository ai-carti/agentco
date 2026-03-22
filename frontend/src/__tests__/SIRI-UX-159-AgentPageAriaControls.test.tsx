/**
 * SIRI-UX-159: AgentPage — history rows have aria-controls pointing to expanded content
 *
 * Previously: role="button" + aria-expanded but no aria-controls — screen readers
 * couldn't navigate to expanded description. Fix: add id to expanded div,
 * aria-controls on row button (only when description exists).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AgentPage from '../components/AgentPage'

function renderAgentPage() {
  return render(
    <MemoryRouter initialEntries={['/companies/c1/agents/a1']}>
      <Routes>
        <Route path="/companies/:id/agents/:agentId" element={<AgentPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const urlStr = url.toString()
    if (urlStr.includes('/tasks')) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { id: 't1', title: 'Task One', status: 'done', description: 'Details here', created_at: '2024-01-01' },
        ],
      } as Response)
    }
    if (urlStr.includes('/memory')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ id: 'a1', name: 'CEO', role: 'Chief Executive' }),
    } as Response)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SIRI-UX-159: AgentPage history aria-controls', () => {
  it('history row button has aria-controls referencing expanded content id', async () => {
    renderAgentPage()

    await waitFor(() => {
      expect(screen.getByText('Task One')).toBeInTheDocument()
    })

    const row = screen.getByText('Task One').closest('[role="button"]')!
    expect(row).toBeInTheDocument()

    // Before expansion: aria-expanded=false
    expect(row).toHaveAttribute('aria-expanded', 'false')
    // aria-controls should be set (task has description)
    const controlsId = row.getAttribute('aria-controls')
    expect(controlsId).toBeTruthy()

    // Click to expand
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')

    // Expanded content div should exist with the referenced id
    const expandedDiv = document.getElementById(controlsId!)
    expect(expandedDiv).toBeInTheDocument()
    expect(expandedDiv?.textContent).toContain('Details here')
  })
})
