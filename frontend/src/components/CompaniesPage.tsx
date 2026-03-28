import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredToken, BASE_URL } from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useToast } from '../context/ToastContext'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'
import OnboardingPage from './OnboardingPage'
import { Building2 } from 'lucide-react'
// SIRI-UX-170: focus trap for New Company modal
import { useFocusTrap } from '../hooks/useFocusTrap'
import Button from './Button'


interface Company {
  id: string
  name: string
}

export default function CompaniesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  useDocumentTitle('Companies — AgentCo')
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // Track whether this is the first load (for onboarding)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  // SIRI-UX-429: edit company modal state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null)
  const [editCompanyName, setEditCompanyName] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  // SIRI-UX-170: focus trap for New Company modal
  const newModalTrapRef = useFocusTrap(showNewModal)
  // SIRI-UX-429: focus trap for Edit Company modal
  const editModalTrapRef = useFocusTrap(showEditModal)
  // SIRI-UX-183: abort controller for handleCreate POST
  const createAbortRef = useRef<AbortController | null>(null)
  // SIRI-UX-251: abort controller for the post-create reload — prevents setState on unmount
  const reloadAbortRef = useRef<AbortController | null>(null)
  // SIRI-UX-429: abort controller for handleEditSave PATCH
  const editAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => {
      createAbortRef.current?.abort()
      reloadAbortRef.current?.abort()
      editAbortRef.current?.abort()
    }
  }, [])

  // SIRI-UX-179: accept optional AbortSignal so fetch is cancellable from useEffect cleanup
  // SIRI-UX-372: memoize load so it's stable in handleCreate's dep array
  const load = useCallback(async (signal?: AbortSignal) => {
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
      // BUG-073: moved out of finally — must NOT run when aborted (unmounted component)
      setLoading(false)
      setHasLoadedOnce(true)
    } catch (err) {
      // SIRI-UX-179: ignore AbortError when component unmounts
      // BUG-073: return early — do NOT call setLoading/setHasLoadedOnce on unmounted component
      if (err instanceof Error && err.name === 'AbortError') return
      // SIRI-UX-148: surface network errors to user
      setLoadError('Failed to load companies. Please try again.')
      // BUG-073: only update state on non-abort errors (component still mounted)
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // SIRI-UX-372: wrap in useCallback to avoid recreating on every render
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return
    // SIRI-UX-183: abort any previous in-flight create request
    createAbortRef.current?.abort()
    const controller = new AbortController()
    createAbortRef.current = controller
    const { signal } = controller
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
        signal,
      })
      if (res.ok) {
        toast.success(`Company ${newName.trim()} created`)
        setNewName('')
        setShowNewModal(false)
        // SIRI-UX-251: pass AbortSignal to load() so it's cancellable when component unmounts
        reloadAbortRef.current?.abort()
        const reloadController = new AbortController()
        reloadAbortRef.current = reloadController
        await load(reloadController.signal)
      } else {
        toast.error('Something went wrong. Try again.')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Something went wrong. Try again.')
    } finally {
      if (!signal.aborted) {
        setCreating(false)
        createAbortRef.current = null
      }
    }
  }, [toast, newName, load])

  // SIRI-UX-429: open edit modal for a company
  const handleEditOpen = useCallback((co: Company, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditCompanyId(co.id)
    setEditCompanyName(co.name)
    setShowEditModal(true)
  }, [])

  const handleEditClose = useCallback(() => {
    setShowEditModal(false)
    setEditCompanyId(null)
    setEditCompanyName('')
  }, [])

  const handleEditSave = useCallback(async () => {
    if (!editCompanyId || !editCompanyName.trim()) return
    editAbortRef.current?.abort()
    const controller = new AbortController()
    editAbortRef.current = controller
    const { signal } = controller
    setEditSaving(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${editCompanyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: editCompanyName.trim() }),
        signal,
      })
      if (res.ok) {
        toast.success(`Company updated`)
        setCompanies((prev) => prev.map((c) => c.id === editCompanyId ? { ...c, name: editCompanyName.trim() } : c))
        handleEditClose()
      } else {
        toast.error('Failed to update company. Try again.')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      toast.error('Failed to update company. Try again.')
    } finally {
      if (!signal.aborted) {
        setEditSaving(false)
        editAbortRef.current = null
      }
    }
  }, [editCompanyId, editCompanyName, toast, handleEditClose])

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
          data-testid="new-company-btn"
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
              aria-label={co.name}
              // SIRI-UX-255: CSS class for hover instead of JS onMouseEnter/onMouseLeave
              // SIRI-UX-265: input-focus-ring-blue for focus ring via CSS
              className="companies-item input-focus-ring-blue"
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{co.name}</span>
              {/* SIRI-UX-429: edit button to open edit company modal */}
              <button
                data-testid={`edit-company-${co.id}-btn`}
                onClick={(e) => handleEditOpen(co, e)}
                style={{
                  padding: '0.2rem 0.5rem',
                  background: 'transparent',
                  border: '1px solid #4b5563',
                  borderRadius: 4,
                  color: '#9ca3af',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* SIRI-UX-429: Edit Company modal */}
      {showEditModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit Company"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) handleEditClose() }}
          onKeyDown={(e) => { if (e.key === 'Escape') handleEditClose() }}
        >
          <div ref={editModalTrapRef} style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 360,
            border: '1px solid #374151', position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontWeight: 700 }}>Edit Company</h2>
              <button
                aria-label="Close edit company modal"
                onClick={handleEditClose}
                style={{
                  background: 'transparent', border: 'none', color: '#9ca3af',
                  fontSize: '1.25rem', cursor: 'pointer', lineHeight: 1, padding: '0.25rem',
                }}
              >
                ×
              </button>
            </div>
            <input
              autoFocus
              data-testid="edit-company-name-input"
              aria-label="Company name"
              value={editCompanyName}
              onChange={(e) => setEditCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
              className="input-focus-ring-blue"
              placeholder="Company name"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={handleEditClose} style={{ padding: '0.4rem 0.9rem' }}>
                Cancel
              </Button>
              <Button
                data-testid="edit-company-save-btn"
                variant="primary"
                onClick={handleEditSave}
                disabled={editSaving || !editCompanyName.trim()}
                aria-disabled={editSaving || !editCompanyName.trim()}
                aria-busy={editSaving}
                style={{ padding: '0.4rem 0.9rem', fontWeight: 600 }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
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
              aria-label="Company name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="input-focus-ring-blue"
              placeholder="Company name"
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {/* SIRI-UX-409: use <Button> component for consistent style — matches KanbanBoard/TaskCard modal pattern */}
              <Button variant="secondary" onClick={() => { setShowNewModal(false); setNewName('') }} style={{ padding: '0.4rem 0.9rem' }}>
                Cancel
              </Button>
              {/* SIRI-UX-409: aria-disabled mirrors disabled prop so AT announces inactive state */}
              <Button
                data-testid="new-company-create-btn"
                variant="primary"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                aria-disabled={creating || !newName.trim()}
                aria-busy={creating}
                style={{ padding: '0.4rem 0.9rem', fontWeight: 600 }}
              >
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
