import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import OnboardingPage from './OnboardingPage'
import { Building2 } from 'lucide-react'
// SIRI-UX-170: focus trap for New Company modal
import { useFocusTrap } from '../hooks/useFocusTrap'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface Company {
  id: string
  name: string
}

export default function CompaniesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // Track whether this is the first load (for onboarding)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  // SIRI-UX-170: focus trap for New Company modal
  const newModalTrapRef = useFocusTrap(showNewModal)

  // SIRI-UX-179: accept optional AbortSignal so fetch is cancellable from useEffect cleanup
  const load = async (signal?: AbortSignal) => {
    setLoading(true)
    setLoadError(null)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(signal ? { signal } : {}),
      })
      if (res.ok) {
        const data = await res.json()
        setCompanies(Array.isArray(data) ? data : [])
      } else {
        // SIRI-UX-148: surface API errors to user
        setLoadError('Failed to load companies. Please try again.')
      }
    } catch (err) {
      // SIRI-UX-179: ignore AbortError when component unmounts
      if (err instanceof Error && err.name === 'AbortError') return
      // SIRI-UX-148: surface network errors to user
      setLoadError('Failed to load companies. Please try again.')
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (res.ok) {
        toast.success(`Company ${newName.trim()} created`)
        setNewName('')
        setShowNewModal(false)
        await load()
      } else {
        toast.error('Something went wrong. Try again.')
      }
    } catch {
      toast.error('Something went wrong. Try again.')
    } finally {
      setCreating(false)
    }
  }

  // M3-003: First visit with no companies → show onboarding (but not when there's a fetch error)
  if (hasLoadedOnce && !loading && companies.length === 0 && !loadError) {
    return (
      <div data-testid="companies-page">
        <OnboardingPage onCompanyCreated={(id) => navigate(`/companies/${id}`)} />
      </div>
    )
  }

  return (
    <div data-testid="companies-page" style={{ padding: '1.5rem', maxWidth: 640 }}>
      {/* SIRI-UX-148: error state — shown when fetch fails */}
      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.875rem 1rem',
            background: 'rgba(127, 29, 29, 0.85)',
            border: '1px solid #b91c1c',
            borderRadius: '0.5rem',
            color: '#fee2e2',
            fontSize: '0.875rem',
          }}
        >
          {loadError}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Companies</h1>
        <button
          onClick={() => setShowNewModal(true)}
          style={{
            padding: '0.4rem 0.9rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New Company
        </button>
      </div>

      {loading ? (
        <SkeletonCard variant="company" count={4} />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={<Building2 className="w-12 h-12 text-gray-400" />}
          title="No companies yet"
          subtitle="Create your first workspace"
          ctaLabel="+ New Company"
          onCTA={() => setShowNewModal(true)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {companies.map((co) => (
            <div
              key={co.id}
              data-testid={`company-item-${co.id}`}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/companies/${co.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/companies/${co.id}`)
                }
              }}
              style={{
                padding: '0.875rem 1rem',
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'border-color 0.15s',
                outline: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#6b7280')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#374151')}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#374151')}
            >
              {co.name}
            </div>
          ))}
        </div>
      )}

      {/* New Company modal */}
      {showNewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New Company"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewModal(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowNewModal(false) }}
        >
          <div ref={newModalTrapRef} style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 360,
            border: '1px solid #374151',
          }}>
            <h2 style={{ margin: '0 0 1rem', fontWeight: 700 }}>New Company</h2>
            <input
              autoFocus
              data-testid="new-company-name-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.outline = 'none' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
              placeholder="Company name"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => { setShowNewModal(false); setNewName('') }}
                style={{ padding: '0.4rem 0.9rem', background: '#374151', color: '#f8fafc', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{ padding: '0.4rem 0.9rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
