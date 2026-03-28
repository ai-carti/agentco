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
      }).catch((err) => { console.warn('[SIRI-UX-421] from-template endpoint failed, falling back to manual creation:', err); return null })

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
      // SIRI-UX-215: skip setState if we just navigated away — component is unmounted,
      // calling setState would trigger React "Can't perform a state update on unmounted component"
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '2rem 1rem',
        textAlign: 'center',
        animation: 'fadeIn 0.4s ease-in',
      }}
    >

      {/* Hero */}
      <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🦄</div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#f8fafc' }}>
        Welcome to AgentCo
      </h1>
      <p style={{ fontSize: '1rem', color: '#9ca3af', margin: '0 0 2.5rem', maxWidth: 420 }}>
        Launch your first AI team in seconds. Pick a template and go.
      </p>

      {/* Template card */}
      <div
        data-testid="template-card-startup-team"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #1a2540 100%)',
          border: '1px solid #2563eb',
          borderRadius: 16,
          padding: '1.75rem',
          width: '100%',
          maxWidth: 440,
          marginBottom: '1.5rem',
          boxShadow: '0 0 40px rgba(37,99,235,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>{template.emoji}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f1f5f9' }}>{template.name}</div>
            <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{template.description}</div>
          </div>
        </div>

        {/* Agent pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {template.agents.map((agent) => (
            <span
              key={agent.name}
              style={{
                padding: '0.25rem 0.75rem',
                background: 'rgba(37,99,235,0.15)',
                border: '1px solid rgba(37,99,235,0.3)',
                borderRadius: 20,
                fontSize: '0.8rem',
                color: '#93c5fd',
                fontWeight: 500,
              }}
            >
              {agent.name}
            </span>
          ))}
        </div>

        {/* Company name input */}
        {/* SIRI-UX-067: add aria-label since there's no visible <label> */}
        <input
          data-testid="onboarding-company-name-input"
          aria-label="Company name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUseTemplate()}
          className="input-focus-ring-blue"
          placeholder="Your company name"
          style={{
            width: '100%',
            padding: '0.6rem 0.9rem',
            background: '#0f172a',
            border: '1px solid #374151',
            borderRadius: 8,
            color: '#f8fafc',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            marginBottom: '1rem',
            outline: 'none',
          }}
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
