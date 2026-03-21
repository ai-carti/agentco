/**
 * SIRI-UX-010: SettingsPage LLM Credentials
 *
 * Updated for SIRI-UX-117: company-scoped credentials.
 * SettingsPage first loads /api/companies/, then /api/companies/{id}/credentials.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../components/SettingsPage'
import { ToastProvider } from '../context/ToastContext'

const MOCK_COMPANY = { id: 'co-test', name: 'Test Corp' }

const mockCredentials = [
  { id: '1', provider: 'openai', key_hint: 'sk-...abc1' },
  { id: '2', provider: 'anthropic', key_hint: 'sk-ant-...xyz2' },
]

/** Setup fetch: companies first, then credentials, then action responses. */
function setupFetch(credentials: object[] = [], validateOk = true) {
  globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    if (method === 'GET' && url.match(/\/api\/companies\/?$/)) {
      return Promise.resolve({ ok: true, json: async () => [MOCK_COMPANY] })
    }
    if (method === 'GET' && url.includes('/credentials')) {
      return Promise.resolve({ ok: true, json: async () => credentials })
    }
    if (url.includes('/api/llm/validate-key')) {
      if (validateOk) return Promise.resolve({ ok: true, json: async () => ({ valid: true }) })
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ detail: 'Invalid API key' }) })
    }
    if (method === 'POST' && url.includes('/credentials')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: '3', provider: 'openai', key_hint: 'sk-...new1' }) })
    }
    if (method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

function renderSettings() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('SIRI-UX-010: SettingsPage LLM Credentials', () => {
  it('renders LLM Credentials section heading', () => {
    setupFetch()
    renderSettings()
    expect(screen.getByTestId('llm-credentials-section')).toBeInTheDocument()
  })

  it('shows provider select with openai/anthropic/gemini options', async () => {
    setupFetch()
    renderSettings()
    await waitFor(() => screen.getByTestId('llm-provider-select'))
    const providerSelect = screen.getByTestId('llm-provider-select')
    expect(providerSelect).toBeInTheDocument()
    expect(screen.getByTestId('llm-api-key-input')).toBeInTheDocument()
  })

  it('api key input is type=password', async () => {
    setupFetch()
    renderSettings()
    await waitFor(() => screen.getByTestId('llm-api-key-input'))
    const keyInput = screen.getByTestId('llm-api-key-input')
    expect(keyInput).toHaveAttribute('type', 'password')
  })

  it('submits validate then POST /api/companies/{id}/credentials on form submit', async () => {
    setupFetch()
    renderSettings()

    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-provider-select'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-test-key' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const validateCall = calls.find((c) => c[0].includes('/api/llm/validate-key'))
      expect(validateCall).toBeDefined()
      const postCall = calls.find(
        (c) => (c[1]?.method ?? 'GET') === 'POST' && c[0].includes('/credentials') && !c[0].includes('validate'),
      )
      expect(postCall).toBeDefined()
      // URL must be company-scoped
      expect(postCall![0]).toMatch(/\/api\/companies\/[^/]+\/credentials/)
    })
  })

  it('shows saved credentials list with hint and delete button', async () => {
    setupFetch(mockCredentials)
    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(2)
    })
    expect(screen.getByText('sk-...abc1')).toBeInTheDocument()
    expect(screen.getByText('sk-ant-...xyz2')).toBeInTheDocument()
    expect(screen.getAllByTestId('llm-credential-delete')).toHaveLength(2)
  })

  it('sends DELETE on credential delete click', async () => {
    setupFetch(mockCredentials)
    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-delete')).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByTestId('llm-credential-delete')[0])

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const deleteCall = calls.find((c) => (c[1]?.method ?? 'GET') === 'DELETE')
      expect(deleteCall).toBeDefined()
      // Company-scoped URL
      expect(deleteCall![0]).toMatch(/\/api\/companies\/[^/]+\/credentials\/1/)
    })
  })

  it('shows error toast when validation fails', async () => {
    setupFetch([], false)
    renderSettings()

    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-provider-select'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-bad' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('llm-credentials-error')).toBeInTheDocument()
    })
  })
})
