import { useState, useEffect, FormEvent } from 'react'
import { getStoredToken } from '../api/client'
import SystemPromptEditor from './SystemPromptEditor'
import Button from './Button'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const FALLBACK_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-5', 'gemini-1.5-pro']

export interface AgentFormData {
  name: string
  role: string
  model: string
  system_prompt: string
}

interface AgentFormProps {
  onSubmit: (data: AgentFormData) => void
  initialValues?: Partial<AgentFormData>
}

export default function AgentForm({ onSubmit, initialValues }: AgentFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '')
  const [role, setRole] = useState(initialValues?.role ?? '')
  const [model, setModel] = useState(initialValues?.model ?? '')
  const [systemPrompt, setSystemPrompt] = useState(initialValues?.system_prompt ?? '')
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
    onSubmit({ name, role, model, system_prompt: systemPrompt })
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

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#6c47ff'
  }
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#374151'
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
          onFocus={handleFocus}
          onBlur={handleBlur}
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
          onFocus={handleFocus}
          onBlur={handleBlur}
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
          onFocus={handleFocus}
          onBlur={handleBlur}
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

      {/* System Prompt */}
      <div>
        <label style={labelStyle}>System Prompt</label>
        <SystemPromptEditor value={systemPrompt} onChange={setSystemPrompt} />
      </div>

      <Button
        data-testid="agent-form-submit"
        type="submit"
        variant="primary"
        style={{ width: '100%' }}
      >
        Save Agent
      </Button>
    </form>
  )
}
