/**
 * FE-002 — SettingsPage: Real LLM key management
 *
 * Updated for SIRI-UX-117: credentials are company-scoped.
 * SettingsPage first fetches /api/companies/, then /api/companies/{id}/credentials.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../components/SettingsPage'
import { ToastProvider } from '../context/ToastContext'

const MOCK_COMPANY = { id: 'co-1', name: 'Test Corp' }

/**
 * Setup fetch mock that handles the new company-scoped flow:
 * 1. GET /api/companies/ → companies
 * 2. GET /api/companies/{id}/credentials → credentials
 * 3. POST /api/llm/validate-key → validate
 * 4. POST /api/companies/{id}/credentials → save
 * 5. DELETE /api/companies/{id}/credentials/{credId} → delete
 */
function setupFetch(opts?: {
  companies?: object[]
  credentials?: object[]
  validateOk?: boolean
  validateDetail?: string
  savedCred?: object
}) {
  const companies = opts?.companies ?? [MOCK_COMPANY]
  const credentials = opts?.credentials ?? []
  const validateOk = opts?.validateOk ?? true
  const savedCred = opts?.savedCred ?? { id: 'cred-new', provider: 'openai', key_hint: 'sk-...wxyz' }

  globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // GET companies list: /api/companies/ or /api/companies (trailing slash optional)
    if (method === 'GET' && url.match(/\/api\/companies\/?$/) ) {
      return Promise.resolve({ ok: true, json: async () => companies })
    }
    // GET credentials: /api/companies/{id}/credentials
    if (method === 'GET' && url.includes('/credentials')) {
      return Promise.resolve({ ok: true, json: async () => credentials })
    }
    // POST validate-key
    if (url.includes('/api/llm/validate-key')) {
      if (validateOk) {
        return Promise.resolve({ ok: true, json: async () => ({ valid: true }) })
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ detail: opts?.validateDetail ?? 'Invalid API key' }),
      })
    }
    // POST save credentials
    if (method === 'POST' && url.includes('/credentials')) {
      return Promise.resolve({ ok: true, json: async () => savedCred })
    }
    // DELETE credentials
    if (method === 'DELETE' && url.includes('/credentials')) {
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

// Helper: wait for the form to appear (needs company loaded first)
async function waitForForm() {
  await waitFor(() => screen.getByTestId('llm-provider-select'))
}

// ─── Provider options ─────────────────────────────────────────────────────────

describe('FE-002: SettingsPage provider select', () => {
  it('has openai, anthropic, gemini options', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()
    const select = screen.getByTestId('llm-provider-select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('openai')
    expect(values).toContain('anthropic')
    expect(values).toContain('gemini')
  })

  it('does not have a generic "google" option', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()
    const select = screen.getByTestId('llm-provider-select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).not.toContain('google')
  })

  it('api_key input is type="password"', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()
    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('type', 'password')
  })

  it('submit button is labelled "Validate & Save"', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()
    expect(screen.getByTestId('llm-credentials-submit')).toHaveTextContent('Validate & Save')
  })
})

// ─── Validate & Save flow ─────────────────────────────────────────────────────

describe('FE-002: Validate & Save flow', () => {
  it('calls POST /api/llm/validate-key before POST /api/companies/{id}/credentials', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()

    fireEvent.change(screen.getByTestId('llm-provider-select'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-test-validkey' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const validateIdx = calls.findIndex((c) => c[0].includes('/api/llm/validate-key'))
      const saveIdx = calls.findIndex(
        (c) => c[0].match(/\/api\/companies\/[^/]+\/credentials/) && (c[1]?.method ?? 'GET') === 'POST',
      )
      expect(validateIdx).toBeGreaterThanOrEqual(0)
      expect(saveIdx).toBeGreaterThanOrEqual(0)
      // Validate must come before save
      expect(validateIdx).toBeLessThan(saveIdx)
    })
  })

  it('shows toast.success("API key saved") after successful save', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-success-key' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByText('API key saved')).toBeInTheDocument()
    })
  })

  it('shows error and does NOT save when validation fails', async () => {
    setupFetch({ validateOk: false })
    renderSettings()
    await waitForForm()

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-bad-key' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('llm-credentials-error')).toBeInTheDocument()
    })

    // POST /api/companies/{id}/credentials (save) should NOT have been called
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
    const saveCall = calls.find(
      (c) => c[0].match(/\/api\/companies\/[^/]+\/credentials/) && (c[1]?.method ?? 'GET') === 'POST',
    )
    expect(saveCall).toBeUndefined()
  })

  it('shows toast.error on validation failure', async () => {
    setupFetch({ validateOk: false })
    renderSettings()
    await waitForForm()

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-invalid' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('llm-credentials-error')).toBeInTheDocument()
    })
  })
})

// ─── Credentials list ─────────────────────────────────────────────────────────

describe('FE-002: Credentials list', () => {
  it('loads and shows existing credentials from GET /api/companies/{id}/credentials', async () => {
    const credentials = [
      { id: '1', provider: 'openai', key_hint: 'sk-...abcd' },
      { id: '2', provider: 'anthropic', key_hint: 'sk-...efgh' },
    ]
    setupFetch({ credentials })

    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(2)
    })

    expect(screen.getByText('sk-...abcd')).toBeInTheDocument()
    expect(screen.getByText('sk-...efgh')).toBeInTheDocument()
  })

  it('shows provider badge on each credential', async () => {
    setupFetch({
      credentials: [{ id: '1', provider: 'gemini', key_hint: 'sk-...zzzz' }],
    })
    renderSettings()

    await waitFor(() => {
      expect(screen.getByTestId('llm-credential-provider')).toHaveTextContent('gemini')
    })
  })

  it('DELETEs /api/companies/{id}/credentials/{credId} on delete click, removes from list', async () => {
    const credentials = [
      { id: 'cred-1', provider: 'openai', key_hint: 'sk-...aaaa' },
      { id: 'cred-2', provider: 'anthropic', key_hint: 'sk-...bbbb' },
    ]
    setupFetch({ credentials })
    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByTestId('llm-credential-delete')[0])

    await waitFor(() => {
      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
      const deleteCall = calls.find((c) => (c[1]?.method ?? 'GET') === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toMatch(/\/api\/companies\/[^/]+\/credentials\/cred-1/)
    })

    // Item should be removed from the list
    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(1)
    })
  })
})

// ─── BUG-056: Credentials fetch error handling ───────────────────────────────

describe('BUG-056: GET /credentials error → UI error message', () => {
  it('shows error message when GET /credentials returns 403', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'GET' && url.match(/\/api\/companies\/?$/)) {
        return Promise.resolve({ ok: true, json: async () => [MOCK_COMPANY] })
      }
      if (method === 'GET' && url.includes('/credentials')) {
        return Promise.resolve({ ok: false, status: 403, json: async () => ({ detail: 'Forbidden' }) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    renderSettings()

    await waitFor(() => {
      expect(screen.getByTestId('credentials-fetch-error')).toBeInTheDocument()
    })
  })

  it('does NOT show credentials-fetch-error on success', async () => {
    setupFetch({ credentials: [] })
    renderSettings()
    await waitForForm()

    expect(screen.queryByTestId('credentials-fetch-error')).not.toBeInTheDocument()
  })

  it('shows error message on any non-ok status (e.g. 500)', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'GET' && url.match(/\/api\/companies\/?$/)) {
        return Promise.resolve({ ok: true, json: async () => [MOCK_COMPANY] })
      }
      if (method === 'GET' && url.includes('/credentials')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    renderSettings()

    await waitFor(() => {
      expect(screen.getByTestId('credentials-fetch-error')).toBeInTheDocument()
    })
  })
})

// ─── BUG-060: trim apiKey ─────────────────────────────────────────────────────

describe('BUG-060: apiKey trim before submit', () => {
  it('does NOT call fetch when apiKey is whitespace-only', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    // fetch should NOT have been called with validate-key
    const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown[][]
    const validateCall = fetchCalls.find((args) =>
      typeof args[0] === 'string' && (args[0] as string).includes('/api/llm/validate-key')
    )
    expect(validateCall).toBeUndefined()
  })

  it('trims leading/trailing spaces from apiKey before sending to validate-key', async () => {
    setupFetch()
    renderSettings()
    await waitForForm()

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: '  sk-actual-key  ' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown[][]
      const validateCall = fetchCalls.find((args) =>
        typeof args[0] === 'string' && (args[0] as string).includes('/api/llm/validate-key')
      )
      expect(validateCall).toBeDefined()
      const body = JSON.parse((validateCall![1] as RequestInit).body as string)
      expect(body.api_key).toBe('sk-actual-key')
    })
  })
})

// ─── Key masking ──────────────────────────────────────────────────────────────

describe('FE-002: Key masking (sk-...xxxx format)', () => {
  it('displays key_hint from backend as-is', async () => {
    setupFetch({
      credentials: [{ id: '1', provider: 'openai', key_hint: 'sk-...1234' }],
    })
    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('sk-...1234')).toBeInTheDocument()
    })
  })

  it('generates key_hint (last 4 chars) when backend omits it', async () => {
    setupFetch({
      savedCred: { id: '5', provider: 'openai' }, // no key_hint
    })
    renderSettings()
    await waitForForm()

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-abcdefghij1234' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      // Should show masked key with last 4 chars = "1234"
      expect(screen.getByText('sk-...1234')).toBeInTheDocument()
    })
  })
})
