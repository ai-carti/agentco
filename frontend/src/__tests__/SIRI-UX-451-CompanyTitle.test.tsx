/**
 * SIRI-UX-451: CompanyPage document title includes company name
 */
import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompanyPage from '../components/CompanyPage'
import { useAgentStore } from '../store/agentStore'

// Mock heavy sub-components to keep test fast
vi.mock('../components/WarRoomPage', () => ({ default: () => <div>WarRoom</div> }))
vi.mock('../components/KanbanBoard', () => ({ default: () => <div>Kanban</div> }))

describe('SIRI-UX-451: CompanyPage document title', () => {
  beforeEach(() => {
    useAgentStore.setState({ currentCompany: null, agents: [], tasks: [], activeCompanyTab: null })
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.includes('/agents')) return Promise.resolve({ ok: true, json: async () => [] })
      return Promise.resolve({ ok: true, json: async () => ({ id: 'co-1', name: 'Acme Corp' }) })
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updates document.title to include company name once loaded', async () => {
    render(
      <MemoryRouter initialEntries={['/companies/co-1']}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.title).toContain('Acme Corp')
    })
  })
})
