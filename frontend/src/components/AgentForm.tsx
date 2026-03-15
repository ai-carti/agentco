import { useState, useEffect, FormEvent } from 'react'
import { getStoredToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const FALLBACK_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-5', 'gemini-1.5-pro']

export interface AgentFormData {
  name: string
  role: string
  model: string
}

interface AgentFormProps {
  onSubmit: (data: AgentFormData) => void
  initialValues?: Partial<AgentFormData>
}

export default function AgentForm({ onSubmit, initialValues }: AgentFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [role, setRole] = useState(initialValues?.role ?? '')
  const [model, setModel] = useState(initialValues?.model ?? '')
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadModels = async () => {
      try {
        const token = getStoredToken()
        const res = await fetch(`${BASE_URL}/api/llm/providers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error('Failed to load models')
        const data = await res.json()
        const list: string[] = data.models ?? data.providers ?? data ?? FALLBACK_MODELS
        const resolved = Array.isArray(list) && list.length > 0 ? list : FALLBACK_MODELS
        setModels(resolved)
      } catch {
        setModels(FALLBACK_MODELS)
      } finally {
        setLoadingModels(false)
      }
    }
    loadModels()
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!model) {
      setError('Please select a model')
      return
    }
    setError('')
    onSubmit({ name, role, model })
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
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginBottom: '0.3rem',
    fontWeight: 500,
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Name */}
      <div>
        <label style={labelStyle}>Name</label>
        <input
          data-testid="agent-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name"
          style={inputStyle}
          required
        />
      </div>

      {/* Role */}
      <div>
        <label style={labelStyle}>Role</label>
        <input
          data-testid="agent-role-input"
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Frontend Engineer"
          style={inputStyle}
        />
      </div>

      {/* Model — dropdown */}
      <div>
        <label style={labelStyle}>Model</label>
        <select
          data-testid="model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={loadingModels}
          required
          style={{
            ...inputStyle,
            cursor: loadingModels ? 'not-allowed' : 'pointer',
            appearance: 'auto',
          }}
        >
          <option value="" disabled>
            {loadingModels ? 'Loading models…' : 'Select model'}
          </option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {error && (
          <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>{error}</p>
        )}
      </div>

      <button
        data-testid="agent-form-submit"
        type="submit"
        style={{
          padding: '0.5rem 1rem',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Save Agent
      </button>
    </form>
  )
}
