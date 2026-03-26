import { useState, useEffect, FormEvent } from 'react'
import { getStoredToken, BASE_URL } from '../api/client'
import SystemPromptEditor from './SystemPromptEditor'
import Button from './Button'


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
    const controller = new AbortController()
    const loadModels = async () => {
      try {
        const token = getStoredToken()
        const res = await fetch(`${BASE_URL}/api/llm/providers/available`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('Failed to load models')
        const data = await res.json()
        const list: string[] = data.all_models ?? FALLBACK_MODELS
        const resolved = Array.isArray(list) && list.length > 0 ? list : FALLBACK_MODELS
        setModels(resolved)
        setLoadingModels(false)
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setModels(FALLBACK_MODELS)
        setLoadingModels(false)
      }
    }
    loadModels()
    return () => controller.abort()
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

  // SIRI-UX-265: focus ring via CSS class input-focus-ring, no JS handlers needed

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
        {/* SIRI-UX-066: associate label with input via htmlFor/id */}
        <label htmlFor="agent-name" style={labelStyle}>Name</label>
        <input
          id="agent-name"
          data-testid="agent-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-focus-ring"
          placeholder="Agent name"
          style={inputStyle}
          required
        />
      </div>

      {/* Role */}
      <div>
        <label htmlFor="agent-role" style={labelStyle}>Role</label>
        <input
          id="agent-role"
          data-testid="agent-role-input"
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="input-focus-ring"
          placeholder="e.g. Frontend Engineer"
          style={inputStyle}
        />
      </div>

      {/* Model — dropdown */}
      <div>
        <label htmlFor="agent-model" style={labelStyle}>Model</label>
        <select
          id="agent-model"
          data-testid="model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="input-focus-ring"
          disabled={loadingModels}
          aria-busy={loadingModels}
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
          // SIRI-UX-306: role="alert" so screen reader announces model validation error automatically
          <p data-testid="agent-form-model-error" role="alert" style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>{error}</p>
        )}
      </div>

      {/* System Prompt */}
      <div>
        <label htmlFor="agent-system-prompt" style={labelStyle}>System Prompt</label>
        <SystemPromptEditor id="agent-system-prompt" value={systemPrompt} onChange={setSystemPrompt} />
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
