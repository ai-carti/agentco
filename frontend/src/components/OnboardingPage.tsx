import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredToken, BASE_URL } from '../api/client'
import { useToast } from '../context/ToastContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'


// Templates defined in code, not in DB
export const COMPANY_TEMPLATES = [
  {
    id: 'startup-team',
    name: 'Startup Team',
    description: 'CEO, CPO, and SWE — ready to ship your idea',
    emoji: '🚀',
    agents: [
      {
        name: 'CEO',
        role: 'Chief Executive Officer',
        model: 'gpt-4o',
        system_prompt:
          'You are the CEO of a fast-moving startup. Your job is to set strategy, prioritize ruthlessly, and unblock your team. Think big, move fast. Always output structured plans.',
      },
      {
        name: 'CPO',
        role: 'Chief Product Officer',
        model: 'gpt-4o',
        system_prompt:
          'You are the CPO. You own the product roadmap, user research, and feature specs. Translate business goals into actionable product requirements. Write crisp PRDs.',
      },
      {
        name: 'SWE',
        role: 'Software Engineer',
        model: 'gpt-4o',
        system_prompt:
          'You are a senior software engineer. You implement features, review code, write tests, and fix bugs. You prefer clean, simple solutions over clever ones. Output working code.',
      },
    ],
  },
]

interface OnboardingPageProps {
  onCompanyCreated?: (companyId: string) => void
}

export default function OnboardingPage({ onCompanyCreated }: OnboardingPageProps) {
  useDocumentTitle('Onboarding — AgentCo')
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [companyName, setCompanyName] = useState('My Startup')

  const template = COMPANY_TEMPLATES[0]
  // SIRI-UX-187: abort controller for handleUseTemplate multi-fetch flow
  const launchAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => { launchAbortRef.current?.abort() }
  }, [])

  // SIRI-UX-390: wrap in useCallback — handleUseTemplate perse-created on every render
  // and passed as onClick/onKeyDown to two buttons
  const handleUseTemplate = useCallback(async () => {
    if (!companyName.trim()) return
    // SIRI-UX-187: abort any previous in-flight launch; guard setState on unmounted component
    launchAbortRef.current?.abort()
    const controller = new AbortController()
    launchAbortRef.current = controller
    const { signal } = controller
    // SIRI-UX-215: track whether we navigated away to skip setState in finally (component unmounts)
    let navigated = false
    setLoading(true)
    try {
      const token = getStoredToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      // Try the from-template endpoint first
      let companyId: string | null = null
      const templateRes = await fetch(`${BASE_URL}/api/companies/from-template`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ template_id: template.id, name: companyName.trim() }),
        signal,
      // SIRI-UX-459: guard console.warn with DEV flag — don't emit in production builds
      }).catch((err) => { if (import.meta.env.DEV) { console.warn('[SIRI-UX-421] from-template endpoint failed, falling back to manual creation:', err) } return null })

      if (templateRes?.ok) {
        const data = await templateRes.json()
        companyId = data.id ?? data.company_id ?? null
      }

      // Fallback: create company manually then add agents
      if (!companyId) {
        const coRes = await fetch(`${BASE_URL}/api/companies`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: companyName.trim() }),
          signal,
        })
        if (!coRes.ok) {
          toast.error('Failed to create company. Try again.')
          return
        }
        const co = await coRes.json()
        companyId = co.id

        // Create agents in parallel
        await Promise.allSettled(
          template.agents.map((agent) =>
            fetch(`${BASE_URL}/api/companies/${companyId}/agents`, {
              method: 'POST',
              headers,
              body: JSON.stringify(agent),
              signal,
            }),
          ),
        )
      }

      toast.success(`🚀 "${companyName.trim()}" created! Welcome to AgentCo.`)
      navigated = true
      if (onCompanyCreated && companyId) {
        onCompanyCreated(companyId)
      } else if (companyId) {
        navigate(`/companies/${companyId}`)
      } else {
        navigate('/')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Something went wrong. Try again.')
    } finally {
      // SIRI-UX-215: skip setState if we just navigated away — component is unmounted
      if (!signal.aborted && !navigated) {
        setLoading(false)
        launchAbortRef.current = null
      }
    }
  // SIRI-UX-390: deps — companyName, navigate, onCompanyCreated, template, toast
  }, [companyName, navigate, onCompanyCreated, template, toast]) // SIRI-UX-390

  return (
    <div
      data-testid="onboarding-page"
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-8 text-center animate-[fadeIn_0.4s_ease-in]"
    >

      {/* Hero */}
      <div className="text-6xl mb-4">🦄</div>
      <h1 className="text-3xl font-extrabold m-0 mb-2 text-slate-50">
        Welcome to AgentCo
      </h1>
      <p className="text-base text-gray-400 m-0 mb-10 max-w-[420px]">
        Launch your first AI team in seconds. Pick a template and go.
      </p>

      {/* Template card */}
      <div
        data-testid="template-card-startup-team"
        className="bg-gradient-to-br from-slate-800 to-[#1a2540] border border-blue-600 rounded-2xl p-7 w-full max-w-[440px] mb-6 shadow-[0_0_40px_rgba(37,99,235,0.15)]"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">{template.emoji}</span>
          <div className="text-left">
            <div className="font-bold text-lg text-slate-100">{template.name}</div>
            <div className="text-sm text-gray-400">{template.description}</div>
          </div>
        </div>

        {/* Agent pills */}
        <div className="flex gap-2 flex-wrap mb-5">
          {template.agents.map((agent) => (
            <span
              key={agent.name}
              className="px-3 py-1 bg-blue-600/15 border border-blue-600/30 rounded-full text-xs text-blue-300 font-medium"
            >
              {agent.name}
            </span>
          ))}
        </div>

        {/* Company name input */}
        {/* SIRI-UX-067: add aria-label since there's no visible <label> */}
        {/* SIRI-UX-454: autoFocus so keyboard users land on input immediately — part of WoW moment */}
        <input
          data-testid="onboarding-company-name-input"
          aria-label="Company name"
          autoFocus
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUseTemplate()}
          className="input-focus-ring-blue w-full px-4 py-2.5 bg-slate-900 border border-gray-700 rounded-lg text-slate-50 text-[0.9rem] box-border mb-4 outline-none"
          placeholder="Your company name"
        />

        {/* SIRI-UX-260: replaced JS hover with CSS class .onboarding-launch-btn */}
        <button
          data-testid="onboarding-use-template-btn"
          onClick={handleUseTemplate}
          disabled={loading || !companyName.trim()}
          // SIRI-UX-199: aria-busy announces loading state to screen readers
          aria-busy={loading}
          className="onboarding-launch-btn"
        >
          {loading ? (
            <>⏳ Creating…</>
          ) : (
            <>Launch Demo</>
          )}
        </button>
      </div>

      {/* Skip link */}
      {/* SIRI-UX-260: replaced JS hover with CSS class .onboarding-skip-btn */}
      <button
        data-testid="onboarding-skip-btn"
        onClick={() => navigate('/')}
        className="onboarding-skip-btn"
      >
        Skip, I'll set up manually
      </button>
    </div>
  )
}
