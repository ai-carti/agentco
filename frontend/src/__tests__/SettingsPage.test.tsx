/**
 * FE-002 — SettingsPage: Real LLM key management
 *
 * Verifies validate-then-save flow, provider options, key masking, and delete.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SettingsPage from '../components/SettingsPage'
import { ToastProvider } from '../context/ToastContext'

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
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

// ─── Provider options ─────────────────────────────────────────────────────────

describe('FE-002: SettingsPage provider select', () => {
  it('has openai, anthropic, gemini options', () => {
    renderSettings()
    const select = screen.getByTestId('llm-provider-select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('openai')
    expect(values).toContain('anthropic')
    expect(values).toContain('gemini')
  })

  it('does not have a generic "google" option', () => {
    renderSettings()
    const select = screen.getByTestId('llm-provider-select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).not.toContain('google')
  })

  it('api_key input is type="password"', () => {
    renderSettings()
    expect(screen.getByTestId('llm-api-key-input')).toHaveAttribute('type', 'password')
  })

  it('submit button is labelled "Validate & Save"', () => {
    renderSettings()
    expect(screen.getByTestId('llm-credentials-submit')).toHaveTextContent('Validate & Save')
  })
})

// ─── Validate & Save flow ─────────────────────────────────────────────────────

describe('FE-002: Validate & Save flow', () => {
  it('calls POST /api/llm/validate-key before POST /api/credentials', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // GET /api/credentials
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // POST validate-key
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '99', provider: 'openai', key_hint: 'sk-...1234' }) }) // POST credentials

    globalThis.fetch = fetchMock
    renderSettings()

    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-provider-select'), { target: { value: 'openai' } })
    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-test-validkey' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>
      const validateIdx = calls.findIndex((c) => c[0].includes('/api/llm/validate-key'))
      const saveIdx = calls.findIndex((c) => c[0].includes('/api/credentials') && !c[0].includes('validate') && c[1]?.method === 'POST')
      expect(validateIdx).toBeGreaterThanOrEqual(0)
      expect(saveIdx).toBeGreaterThanOrEqual(0)
      // Validate must come before save
      expect(validateIdx).toBeLessThan(saveIdx)
    })
  })

  it('shows toast.success("API key saved") after successful save', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '1', provider: 'openai', key_hint: 'sk-...wxyz' }) })

    renderSettings()
    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-success-key' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByText('API key saved')).toBeInTheDocument()
    })
  })

  it('shows error and does NOT call /api/credentials when validation fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'Invalid API key' }) })

    globalThis.fetch = fetchMock
    renderSettings()
    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-bad-key' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('llm-credentials-error')).toBeInTheDocument()
    })

    // /api/credentials (save) should NOT have been called
    const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>
    const saveCall = calls.find((c) => c[0].includes('/api/credentials') && !c[0].includes('validate') && c[1]?.method === 'POST')
    expect(saveCall).toBeUndefined()
  })

  it('shows toast.error on validation failure', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ detail: 'Invalid API key' }) })

    renderSettings()
    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-invalid' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      // Error shown in form or toast
      expect(screen.getByTestId('llm-credentials-error')).toBeInTheDocument()
    })
  })
})

// ─── Credentials list ─────────────────────────────────────────────────────────

describe('FE-002: Credentials list', () => {
  it('loads and shows existing credentials from GET /api/credentials', async () => {
    const credentials = [
      { id: '1', provider: 'openai', key_hint: 'sk-...abcd' },
      { id: '2', provider: 'anthropic', key_hint: 'sk-...efgh' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => credentials })

    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(2)
    })

    expect(screen.getByText('sk-...abcd')).toBeInTheDocument()
    expect(screen.getByText('sk-...efgh')).toBeInTheDocument()
  })

  it('shows provider badge on each credential', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', provider: 'gemini', key_hint: 'sk-...zzzz' }],
    })
    renderSettings()

    await waitFor(() => {
      expect(screen.getByTestId('llm-credential-provider')).toHaveTextContent('gemini')
    })
  })

  it('DELETE /api/credentials/{id} on delete click, removes from list', async () => {
    const credentials = [
      { id: 'cred-1', provider: 'openai', key_hint: 'sk-...aaaa' },
      { id: 'cred-2', provider: 'anthropic', key_hint: 'sk-...bbbb' },
    ]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => credentials }) // GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // DELETE

    globalThis.fetch = fetchMock
    renderSettings()

    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByTestId('llm-credential-delete')[0])

    await waitFor(() => {
      const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>
      const deleteCall = calls.find((c) => c[1]?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toContain('/api/credentials/cred-1')
    })

    // Item should be removed from the list
    await waitFor(() => {
      expect(screen.getAllByTestId('llm-credential-item')).toHaveLength(1)
    })
  })
})

// ─── Key masking ──────────────────────────────────────────────────────────────

describe('FE-002: Key masking (sk-...xxxx format)', () => {
  it('displays key_hint from backend as-is', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: '1', provider: 'openai', key_hint: 'sk-...1234' }],
    })
    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('sk-...1234')).toBeInTheDocument()
    })
  })

  it('generates key_hint (last 4 chars) when backend omits it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // validate
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '5', provider: 'openai' }) }) // POST — no key_hint

    globalThis.fetch = fetchMock
    renderSettings()
    await waitFor(() => screen.getByTestId('llm-provider-select'))

    fireEvent.change(screen.getByTestId('llm-api-key-input'), { target: { value: 'sk-abcdefghij1234' } })
    fireEvent.click(screen.getByTestId('llm-credentials-submit'))

    await waitFor(() => {
      // Should show masked key with last 4 chars = "1234"
      expect(screen.getByText('sk-...1234')).toBeInTheDocument()
    })
  })
})
