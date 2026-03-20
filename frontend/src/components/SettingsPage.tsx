import { useState, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import Button from './Button'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#f8fafc',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
  outline: 'none',
}

const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = '#6c47ff'
}
const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = '#374151'
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#9ca3af',
  marginBottom: '0.3rem',
  fontWeight: 500,
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function SettingsPage() {
  const toast = useToast()
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [credentials, setCredentials] = useState<LLMCredential[]>([])
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)

  useEffect(() => {
    globalThis.fetch(`${BASE_URL}/api/credentials`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setCredentials(Array.isArray(data) ? data : [])
        setCredentialsLoaded(true)
      })
      .catch(() => setCredentialsLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitting(true)

    try {
      // Step 1: Validate key
      const validateRes = await globalThis.fetch(`${BASE_URL}/api/llm/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ provider, api_key: apiKey }),
      })

      if (!validateRes.ok) {
        let errMsg = `API key validation failed (${validateRes.status})`
        try {
          const body = await validateRes.json() as { detail?: string }
          if (body.detail) errMsg = body.detail
        } catch { /* ignore */ }
        setSubmitError(errMsg)
        toast.error(errMsg)
        return
      }

      // Step 2: Save credential
      const saveRes = await globalThis.fetch(`${BASE_URL}/api/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ provider, api_key: apiKey }),
      })

      if (!saveRes.ok) {
        const msg = `Failed to save credential (${saveRes.status})`
        setSubmitError(msg)
        toast.error(msg)
        return
      }

      const newCred = await saveRes.json() as LLMCredential
      // If backend doesn't return key_hint, generate one from the input
      if (!newCred.key_hint) {
        newCred.key_hint = maskKey(apiKey)
      }
      setCredentials((prev) => [...prev, newCred])
      setApiKey('')
      toast.success('API key saved')
    } catch {
      const msg = 'Network error — could not save credential'
      setSubmitError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await globalThis.fetch(`${BASE_URL}/api/credentials/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        toast.error(`Failed to delete credential (${res.status})`)
        return
      }
      setCredentials((prev) => prev.filter((c) => c.id !== id))
      toast.success('Credential deleted')
    } catch {
      toast.error('Network error — could not delete credential')
    }
  }

  return (
    <div data-testid="settings-page" style={{ padding: '1rem', maxWidth: 560 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '1.5rem' }}>
        Settings
      </h1>

      {/* LLM Credentials section */}
      <div data-testid="llm-credentials-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#f1f5f9' }}>
          LLM Credentials
        </h2>

        {/* Add new credential form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Provider</label>
            <select
              data-testid="llm-provider-select"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
              required
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>API Key</label>
            <input
              data-testid="llm-api-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              placeholder="sk-..."
              style={inputStyle}
              required
              autoComplete="new-password"
            />
          </div>

          {submitError && (
            <p
              data-testid="llm-credentials-error"
              style={{ color: '#f87171', fontSize: '0.8rem', margin: 0 }}
            >
              {submitError}
            </p>
          )}

          <Button
            data-testid="llm-credentials-submit"
            type="submit"
            variant="primary"
            disabled={submitting}
            style={{ alignSelf: 'flex-start' }}
          >
            {submitting ? 'Validating…' : 'Validate & Save'}
          </Button>
        </form>

        {/* Saved credentials list */}
        {credentialsLoaded && credentials.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 0.5rem' }}>
              Saved credentials
            </p>
            {credentials.map((cred) => (
              <div
                key={cred.id}
                data-testid="llm-credential-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  background: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                  <span
                    data-testid="llm-credential-provider"
                    style={{ color: '#94a3b8', fontWeight: 500, textTransform: 'capitalize', flexShrink: 0 }}
                  >
                    {cred.provider}
                  </span>
                  <span style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cred.key_hint}
                  </span>
                </div>
                <Button
                  data-testid="llm-credential-delete"
                  variant="secondary"
                  onClick={() => handleDelete(cred.id)}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', flexShrink: 0 }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing link */}
      <div>
        <Link
          to="/settings/billing"
          data-testid="settings-billing-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#f1f5f9',
            textDecoration: 'none',
            fontSize: '0.9rem',
          }}
        >
          💳 Billing
        </Link>
      </div>
    </div>
  )
}
