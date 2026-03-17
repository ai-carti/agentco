/**
 * BUG-039 — Company Header in CompanyPage
 * Tests that CompanyPage renders a header with avatar and company name
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompanyPage from '../components/CompanyPage'
import { useAgentStore } from '../store/agentStore'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderCompanyPage(companyId = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}`]}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({
    currentCompany: null,
    agents: [],
    tasks: [],
  })

  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/companies/')) {
      if (url.endsWith('/agents')) return Promise.resolve({ ok: true, json: async () => [] })
      if (url.endsWith('/tasks')) return Promise.resolve({ ok: true, json: async () => [] })
      // Company detail
      return Promise.resolve({ ok: true, json: async () => ({ id: 'c1', name: 'TestCorp' }) })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
})

describe('BUG-039: Company Header', () => {
  it('renders company header when company is loaded', async () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCorp' } })
    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByTestId('company-header')).toBeInTheDocument()
    })
  })

  it('shows company name in header', async () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCorp' } })
    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByTestId('company-header-name')).toHaveTextContent('TestCorp')
    })
  })

  it('shows avatar with first 2 letters of company name', async () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCorp' } })
    renderCompanyPage()

    await waitFor(() => {
      const avatar = screen.getByTestId('company-avatar')
      expect(avatar).toBeInTheDocument()
      expect(avatar.textContent).toBe('TE')
    })
  })

  it('clicking AgentCo breadcrumb navigates to /', async () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCorp' } })
    renderCompanyPage()

    await waitFor(() => {
      expect(screen.getByTestId('company-header-home-link')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('company-header-home-link'))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('avatar color is generated from company name hash', async () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCorp' } })
    renderCompanyPage()

    await waitFor(() => {
      const avatar = screen.getByTestId('company-avatar')
      // Avatar should have a background color set
      expect(avatar.style.background).toBeTruthy()
    })
  })

  it('header has correct styling classes/styles', async () => {
    useAgentStore.setState({ currentCompany: { id: 'c1', name: 'TestCorp' } })
    renderCompanyPage()

    await waitFor(() => {
      const header = screen.getByTestId('company-header')
      expect(header.style.height).toBe('48px')
    })
  })
})
