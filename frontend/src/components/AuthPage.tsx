import { useCallback, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

type Tab = 'signin' | 'signup'

export default function AuthPage() {
  useDocumentTitle('Sign In — AgentCo')
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const { login, register, isLoading, error } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // BUG-010: read the "from" location saved by ProtectedRoute
  // BUG-012: guard against redirect loop back to /auth
  const rawFrom = (location.state as { from?: Location })?.from?.pathname
  const from = rawFrom && rawFrom !== '/auth' ? rawFrom : '/'

  // SIRI-UX-391: wrap in useCallback — handleSubmit is recreated on every render
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (tab === 'signin') {
      await login(email, password)
    } else {
      await register(email, password)
    }
    // BUG-010: navigate to original URL after successful auth
    const token = useAuthStore.getState().token
    if (token) {
      navigate(from, { replace: true })
    }
  }, [tab, email, password, login, register, navigate, from]) // SIRI-UX-391

  return (
    <div data-testid="auth-page" className="min-h-screen bg-[#0a0a0f] flex items-center justify-center font-sans">
      <div className="w-full max-w-[400px] p-8 bg-[#111118] rounded-xl border border-[#1e1e2e]">
        <h1 className="text-slate-50 text-2xl font-bold mb-6 text-center">AgentCo</h1>

        <p
          data-testid="auth-tagline"
          className="text-center text-gray-500 text-sm -mt-3 mb-6 leading-relaxed"
        >
          Your AI team, working 24/7
        </p>

        {/* SIRI-UX-282: roving tabindex — active tab gets tabIndex=0, inactive gets tabIndex=-1
            SIRI-UX-310: ArrowLeft/ArrowRight keyboard navigation between tabs (WAI-ARIA APG) */}
        <div role="tablist" className="flex mb-6 border-b border-[#1e1e2e]">
          <button
            id="tab-signin"
            role="tab"
            aria-selected={tab === 'signin'}
            aria-controls="tabpanel-auth"
            tabIndex={tab === 'signin' ? 0 : -1}
            className={`px-5 py-2.5 bg-none border-none cursor-pointer text-[0.95rem] transition-colors duration-150 -mb-px ${
              tab === 'signin'
                ? 'text-[#6c47ff] font-semibold border-b-2 border-[#6c47ff]'
                : 'text-gray-500 font-normal border-b-2 border-transparent'
            }`}
            onClick={() => setTab('signin')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                setTab('signup')
                document.getElementById('tab-signup')?.focus()
              }
            }}
            type="button"
          >
            Sign In
          </button>
          <button
            id="tab-signup"
            role="tab"
            aria-selected={tab === 'signup'}
            aria-controls="tabpanel-auth"
            tabIndex={tab === 'signup' ? 0 : -1}
            className={`px-5 py-2.5 bg-none border-none cursor-pointer text-[0.95rem] transition-colors duration-150 -mb-px ${
              tab === 'signup'
                ? 'text-[#6c47ff] font-semibold border-b-2 border-[#6c47ff]'
                : 'text-gray-500 font-normal border-b-2 border-transparent'
            }`}
            onClick={() => setTab('signup')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                setTab('signin')
                document.getElementById('tab-signin')?.focus()
              }
            }}
            type="button"
          >
            Sign Up
          </button>
        </div>

        {/* SIRI-UX-108: aria-labelledby links tabpanel to active tab for screen readers */}
        <div
          id="tabpanel-auth"
          role="tabpanel"
          aria-labelledby={tab === 'signin' ? 'tab-signin' : 'tab-signup'}
        >
        {/* SIRI-UX-283: role="alert" ensures screen readers auto-announce auth errors */}
        {error && (
          <div role="alert" className="text-red-500 text-sm mb-4 px-3 py-2 bg-[#1f0a0a] rounded-md border border-[#3f1010]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            id="auth-email"
            aria-label="Email address"
            className="input-focus-ring w-full px-4 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-slate-50 text-[0.95rem] outline-none box-border mb-4"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <input
            id="auth-password"
            aria-label="Password"
            className="input-focus-ring w-full px-4 py-2.5 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg text-slate-50 text-[0.95rem] outline-none box-border mb-4"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
          />

          {/* SIRI-UX-324: was a <span> — now a disabled <button> for accessibility */}
          <div className="text-right -mt-3 mb-4">
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Coming soon"
              data-testid="forgot-password-btn"
              className="bg-none border-none text-gray-500 text-xs cursor-not-allowed p-0"
            >
              Forgot password?
            </button>
          </div>

          <button
            className={`w-full py-3 bg-[#6c47ff] text-white border-none rounded-lg text-base font-semibold cursor-pointer mt-2 ${isLoading ? 'opacity-70' : 'opacity-100'}`}
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? 'Loading…' : tab === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>
        </div>
      </div>
    </div>
  )
}
