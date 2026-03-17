import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import OnboardingPage from './OnboardingPage'
import { Building2 } from 'lucide-react'

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
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // Track whether this is the first load (for onboarding)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setCompanies(Array.isArray(data) ? data : [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }

  useEffect(() => { load() }, [])

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

  // M3-003: First visit with no companies → show onboarding
  if (hasLoadedOnce && !loading && companies.length === 0) {
    return (
      <div data-testid="companies-page">
        <OnboardingPage onCompanyCreated={(id) => navigate(`/companies/${id}`)} />
      </div>
    )
  }

  return (
    <div data-testid="companies-page" style={{ padding: '1.5rem', maxWidth: 640 }}>
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
              onClick={() => navigate(`/companies/${co.id}`)}
              style={{
                padding: '0.875rem 1rem',
                background: '#1f2937',
                border: '1px solid #374151',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#6b7280')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#374151')}
            >
              {co.name}
            </div>
          ))}
        </div>
      )}

      {/* New Company modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewModal(false) }}
        >
          <div style={{
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
              placeholder="Company name"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setShowNewModal(false)}
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
