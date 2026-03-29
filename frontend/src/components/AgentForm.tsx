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

  // SIRI-UX-265: focus ring via CSS class input-focus-ring, no JS handlers needed

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <div>
        {/* SIRI-UX-066: associate label with input via htmlFor/id */}
        <label htmlFor="agent-name" className="block text-xs text-gray-400 mb-1 font-medium">Name</label>
        <input
          id="agent-name"
          data-testid="agent-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-focus-ring w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-slate-50 text-sm box-border outline-none"
          placeholder="Agent name"
          required
        />
      </div>

      {/* Role */}
      <div>
        <label htmlFor="agent-role" className="block text-xs text-gray-400 mb-1 font-medium">Role</label>
        <input
          id="agent-role"
          data-testid="agent-role-input"
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="input-focus-ring w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-slate-50 text-sm box-border outline-none"
          placeholder="e.g. Frontend Engineer"
        />
      </div>

      {/* Model — dropdown */}
      <div>
        <label htmlFor="agent-model" className="block text-xs text-gray-400 mb-1 font-medium">Model</label>
        <select
          id="agent-model"
          data-testid="model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={`input-focus-ring w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-slate-50 text-sm box-border outline-none appearance-auto ${loadingModels ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          disabled={loadingModels}
          aria-busy={loadingModels}
          required
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
          <p data-testid="agent-form-model-error" role="alert" className="text-red-400 text-xs mt-1">{error}</p>
        )}
      </div>

      {/* System Prompt */}
      <div>
        <label htmlFor="agent-system-prompt" className="block text-xs text-gray-400 mb-1 font-medium">System Prompt</label>
        <SystemPromptEditor id="agent-system-prompt" value={systemPrompt} onChange={setSystemPrompt} />
      </div>

      <Button
        data-testid="agent-form-submit"
        type="submit"
        variant="primary"
        className="w-full"
      >
        Save Agent
      </Button>
    </form>
  )
}
