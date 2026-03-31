/**
 * SettingsPage — LLM Credentials management.
 *
 * FE-002 / SIRI-UX-117 fix:
 * Credentials are company-scoped on the backend:
 *   GET  /api/companies/{id}/credentials
 *   POST /api/companies/{id}/credentials
 *   DEL  /api/companies/{id}/credentials/{credId}
 *
 * Flow:
 *  1. Fetch user's companies (GET /api/companies/)
 *  2. Use the first company (or let user pick via selector if >1)
 *  3. Load/save/delete credentials scoped to that company
 */
import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getStoredToken, BASE_URL } from '../api/client'
import { useToast } from '../context/ToastContext'
import Button from './Button'
import { useDocumentTitle } from '../hooks/useDocumentTitle'


interface Company {
  id: string
  name: string
}

interface LLMCredential {
  id: string
  provider: string
  key_hint: string
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
]

/** Returns last 4 chars of a key, formatted as sk-...xxxx */
function maskKey(key: string): string {
  if (key.length <= 4) return `sk-...${key}`
  return `sk-...${key.slice(-4)}`
}

// SIRI-UX-265: focus ring via CSS class input-focus-ring, no JS handlers needed

function authHeaders(): Record<string, string> {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function SettingsPage() {
  useDocumentTitle('Settings — AgentCo')
  const toast = useToast()

  // ── Companies state ──────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>([])
  const [companiesLoaded, setCompaniesLoaded] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

  // ── Credentials state ────────────────────────────────────────────────────
  // SIRI-UX-194: AbortController ref for handleDelete
  const deleteAbortRef = useRef<AbortController | null>(null)
  // SIRI-UX-227: AbortController ref for handleSubmit (validate + save 2-step flow)
  const submitAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => {
      deleteAbortRef.current?.abort()
      submitAbortRef.current?.abort()
    }
  }, [])
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [credentials, setCredentials] = useState<LLMCredential[]>([])
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)
  const [credentialsError, setCredentialsError] = useState<string | null>(null)

  // ── Step 1: load companies ───────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController()
    globalThis.fetch(`${BASE_URL}/api/companies/`, { headers: authHeaders(), signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Company[]) => {
        const list = Array.isArray(data) ? data : []
        setCompanies(list)
        if (list.length > 0) setSelectedCompanyId(list[0].id)
        setCompaniesLoaded(true)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setCompaniesLoaded(true)
      })
    return () => controller.abort()
  }, [])

  // ── Step 2: load credentials when company is selected ───────────────────
  useEffect(() => {
    if (!selectedCompanyId) return
    const controller = new AbortController()
    setCredentialsLoaded(false)
    setCredentialsError(null)
    globalThis.fetch(`${BASE_URL}/api/companies/${selectedCompanyId}/credentials`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          setCredentialsError(`Failed to load credentials (${res.status})`)
          setCredentialsLoaded(true)
          return null
        }
        return res.json()
      })
      .then((data: LLMCredential[] | null) => {
        if (data !== null) {
          setCredentials(Array.isArray(data) ? data : [])
          setCredentialsLoaded(true)
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setCredentialsError('Network error — could not load credentials')
        setCredentialsLoaded(true)
      })
    return () => controller.abort()
  }, [selectedCompanyId])

  // SIRI-UX-385: useCallback prevents recreation on every render — passed as onSubmit to form
  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedCompanyId) return
    const trimmedKey = apiKey.trim()
    if (trimmedKey === '') {
      setSubmitError('API key cannot be empty or whitespace')
      return
    }
    setSubmitError('')
    setSubmitting(true)

    // SIRI-UX-227: AbortController guards setState on unmounted component if user navigates away
    submitAbortRef.current?.abort()
    const controller = new AbortController()
    submitAbortRef.current = controller
    const { signal } = controller

    try {
      // Step 1: Validate key
      const validateRes = await globalThis.fetch(`${BASE_URL}/api/llm/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ provider, api_key: trimmedKey }),
        signal,
      })

      if (!validateRes.ok) {
        let errMsg = `API key validation failed (${validateRes.status})`
        try {
          const body = await validateRes.json() as { detail?: string }
          if (body.detail) errMsg = body.detail
        } catch { /* ignore */ }
        if (!signal.aborted) {
          setSubmitError(errMsg)
          toast.error(errMsg)
        }
        return
      }

      // Step 2: Save credential (company-scoped)
      const saveRes = await globalThis.fetch(
        `${BASE_URL}/api/companies/${selectedCompanyId}/credentials`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ provider, api_key: trimmedKey }),
          signal,
        },
      )

      if (!saveRes.ok) {
        const msg = `Failed to save credential (${saveRes.status})`
        if (!signal.aborted) {
          setSubmitError(msg)
          toast.error(msg)
        }
        return
      }

      const newCred = await saveRes.json() as LLMCredential
      // If backend doesn't return key_hint, generate one from the input
      if (!newCred.key_hint) {
        newCred.key_hint = maskKey(apiKey)
      }
      if (!signal.aborted) {
        setCredentials((prev) => [...prev, newCred])
        setApiKey('')
        toast.success('API key saved')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = 'Network error — could not save credential'
      if (!signal.aborted) {
        setSubmitError(msg)
        toast.error(msg)
      }
    } finally {
      if (!signal.aborted) {
        setSubmitting(false)
        submitAbortRef.current = null
      }
    }
  // SIRI-UX-385: deps — selectedCompanyId, provider, apiKey read inside; toast stable
  }, [selectedCompanyId, provider, apiKey, toast]) // SIRI-UX-385

  const handleDelete = useCallback(async (id: string) => {
    if (!selectedCompanyId) return
    // SIRI-UX-194: AbortController to guard setState on unmounted SettingsPage
    deleteAbortRef.current?.abort()
    const controller = new AbortController()
    deleteAbortRef.current = controller
    const { signal } = controller
    try {
      const res = await globalThis.fetch(
        `${BASE_URL}/api/companies/${selectedCompanyId}/credentials/${id}`,
        {
          method: 'DELETE',
          headers: authHeaders(),
          signal,
        },
      )
      if (!signal.aborted) {
        if (!res.ok) {
          toast.error(`Failed to delete credential (${res.status})`)
        } else {
          setCredentials((prev) => prev.filter((c) => c.id !== id))
          toast.success('Credential deleted')
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!signal.aborted) {
        toast.error('Network error — could not delete credential')
      }
    } finally {
      if (!signal.aborted) {
        deleteAbortRef.current = null
      }
    }
  }, [selectedCompanyId, toast])

  return (
    <div data-testid="settings-page" className="p-4 max-w-[560px]">
      <h1 className="text-2xl font-bold m-0 mb-6">
        Settings
      </h1>

      {/* LLM Credentials section */}
      <div data-testid="llm-credentials-section" className="mb-8">
        <h2 className="text-base font-semibold mb-4 text-slate-100">
          LLM Credentials
        </h2>

        {/* No companies state */}
        {companiesLoaded && companies.length === 0 && (
          <div
            data-testid="settings-no-company"
            className="p-4 bg-gray-800 border border-gray-700 rounded-md text-gray-400 text-sm"
          >
            Create a company first to manage LLM credentials.{' '}
            <Link to="/" className="text-[#6c47ff] no-underline">
              Go to Companies →
            </Link>
          </div>
        )}

        {/* Company selector (show only if multiple companies) */}
        {companiesLoaded && companies.length > 1 && (
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1 font-medium">Company</label>
            <select
              data-testid="settings-company-select"
              value={selectedCompanyId ?? ''}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="input-focus-ring w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-slate-50 text-sm box-border outline-none cursor-pointer appearance-auto"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Add new credential form — only show when company is selected */}
        {companiesLoaded && companies.length > 0 && (
          <>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-3 mb-5"
            >
              <div>
                <label htmlFor="settings-provider" className="block text-xs text-gray-400 mb-1 font-medium">Provider</label>
                <select
                  id="settings-provider"
                  data-testid="llm-provider-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="input-focus-ring w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-slate-50 text-sm box-border outline-none cursor-pointer appearance-auto"
                  required
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="settings-api-key" className="block text-xs text-gray-400 mb-1 font-medium">API Key</label>
                <input
                  id="settings-api-key"
                  data-testid="llm-api-key-input"
                  type="password"
                  value={apiKey}
                  // SIRI-UX-464: don't trim on keystroke — causes cursor jumps and breaks paste.
                  // Trim happens in handleSubmit before validation/save.
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input-focus-ring w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-slate-50 text-sm box-border outline-none"
                  placeholder="sk-..."
                  required
                  autoComplete="new-password"
                />
              </div>

              {submitError && (
                // SIRI-UX-304: role="alert" so screen reader announces validate/save errors automatically
                <p
                  data-testid="llm-credentials-error"
                  role="alert"
                  className="text-red-400 text-xs m-0"
                >
                  {submitError}
                </p>
              )}

              <Button
                data-testid="llm-credentials-submit"
                type="submit"
                variant="primary"
                disabled={submitting}
                className="self-start"
              >
                {submitting ? 'Validating…' : 'Validate & Save'}
              </Button>
            </form>

            {/* Credentials fetch error */}
            {credentialsError && (
              // SIRI-UX-304: role="alert" so screen reader announces credentials load error automatically
              <div
                data-testid="credentials-fetch-error"
                role="alert"
                className="px-3 py-3 bg-gray-800 border border-red-500 rounded-md text-red-400 text-sm mb-3"
              >
                {credentialsError}
              </div>
            )}

            {/* Saved credentials list */}
            {credentialsLoaded && credentials.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-400 m-0 mb-2">
                  Saved credentials
                </p>
                {credentials.map((cred) => (
                  <div
                    key={cred.id}
                    data-testid="llm-credential-item"
                    className="flex items-center justify-between px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm gap-3"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span
                        data-testid="llm-credential-provider"
                        className="text-slate-400 font-medium capitalize shrink-0"
                      >
                        {cred.provider}
                      </span>
                      <span className="text-gray-500 font-mono text-xs overflow-hidden text-ellipsis">
                        {cred.key_hint}
                      </span>
                    </div>
                    <Button
                      data-testid="llm-credential-delete"
                      variant="secondary"
                      onClick={() => handleDelete(cred.id)}
                      className="px-2 py-0.5 text-xs shrink-0"
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Billing link */}
      <div>
        <Link
          to="/settings/billing"
          data-testid="settings-billing-link"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-100 no-underline text-[0.9rem]"
        >
          💳 Billing
        </Link>
      </div>
    </div>
  )
}
