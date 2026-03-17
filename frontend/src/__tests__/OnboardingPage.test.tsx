import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../context/ToastContext'
import OnboardingPage, { COMPANY_TEMPLATES } from '../components/OnboardingPage'
import CompaniesPage from '../components/CompaniesPage'
import { useAuthStore } from '../store/authStore'

beforeEach(() => {
  useAuthStore.setState({ token: 'test-token' })
  vi.clearAllMocks()
})

const wrap = (ui: React.ReactElement, initialEntries = ['/']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  )

// --- Templates definition ---
describe('COMPANY_TEMPLATES', () => {
  it('has startup-team template with 3 agents', () => {
    const tmpl = COMPANY_TEMPLATES.find((t) => t.id === 'startup-team')
    expect(tmpl).toBeDefined()
    expect(tmpl!.agents).toHaveLength(3)
    expect(tmpl!.agents.map((a) => a.name)).toEqual(['CEO', 'CPO', 'SWE'])
  })

  it('all agents have system_prompt', () => {
    const tmpl = COMPANY_TEMPLATES[0]
    tmpl.agents.forEach((agent) => {
      expect(agent.system_prompt.length).toBeGreaterThan(10)
    })
  })
})

// --- OnboardingPage rendering ---
describe('OnboardingPage', () => {
  it('renders welcome text and template card', () => {
    wrap(<OnboardingPage />)
    expect(screen.getByTestId('onboarding-page')).toBeInTheDocument()
    expect(screen.getByText(/Welcome to AgentCo/i)).toBeInTheDocument()
    expect(screen.getByTestId('template-card-startup-team')).toBeInTheDocument()
    expect(screen.getByText('Startup Team')).toBeInTheDocument()
  })

  it('shows CEO, CPO, SWE agent pills', () => {
    wrap(<OnboardingPage />)
    expect(screen.getByText('CEO')).toBeInTheDocument()
    expect(screen.getByText('CPO')).toBeInTheDocument()
    expect(screen.getByText('SWE')).toBeInTheDocument()
  })

  it('has use-template button and company name input', () => {
    wrap(<OnboardingPage />)
    expect(screen.getByTestId('onboarding-use-template-btn')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-company-name-input')).toBeInTheDocument()
  })

  it('has a skip button', () => {
    wrap(<OnboardingPage />)
    expect(screen.getByTestId('onboarding-skip-btn')).toBeInTheDocument()
  })

  // UX-POLISH-001: button text must be in English
  it('use-template button text is in English (not Russian)', () => {
    wrap(<OnboardingPage />)
    const btn = screen.getByTestId('onboarding-use-template-btn')
    expect(btn).toHaveTextContent('Launch Demo')
    expect(btn).not.toHaveTextContent('Запустить')
  })

  it('calls from-template endpoint on button click', async () => {
    const mockOnCreated = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-co-id' }),
    })
    wrap(<OnboardingPage onCompanyCreated={mockOnCreated} />)
    fireEvent.click(screen.getByTestId('onboarding-use-template-btn'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('from-template'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(mockOnCreated).toHaveBeenCalledWith('new-co-id')
    })
  })

  it('falls back to manual company creation if from-template fails', async () => {
    const mockOnCreated = vi.fn()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false }) // from-template fails
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'fallback-co-id' }) }) // companies POST
      .mockResolvedValue({ ok: true, json: async () => ({}) }) // agent POSTs

    wrap(<OnboardingPage onCompanyCreated={mockOnCreated} />)
    fireEvent.click(screen.getByTestId('onboarding-use-template-btn'))
    await waitFor(() => {
      expect(mockOnCreated).toHaveBeenCalledWith('fallback-co-id')
    })
  })
})

// --- M3-003: CompaniesPage shows onboarding when empty ---
describe('CompaniesPage onboarding integration', () => {
  it('shows onboarding when no companies on first load', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    render(
      <MemoryRouter>
        <ToastProvider>
          <CompaniesPage />
        </ToastProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument()
    })
    expect(screen.getByText(/Welcome to AgentCo/i)).toBeInTheDocument()
  })

  it('does NOT show onboarding when companies exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'c1', name: 'Acme' }],
    })
    render(
      <MemoryRouter>
        <ToastProvider>
          <CompaniesPage />
        </ToastProvider>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
  })
})

// --- /onboarding route ---
describe('/onboarding route', () => {
  it('renders OnboardingPage at /onboarding', () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <ToastProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('onboarding-page')).toBeInTheDocument()
  })
})
