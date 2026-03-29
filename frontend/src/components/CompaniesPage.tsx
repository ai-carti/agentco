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
    <div data-testid="companies-page" className="p-6 max-w-[640px]">
      {/* SIRI-UX-148: error state — shown when fetch fails */}
      {loadError && (
        <div
          role="alert"
          className="mb-4 py-3.5 px-4 bg-red-900/85 border border-red-700 rounded-lg text-red-100 text-sm"
        >
          {loadError}
        </div>
      )}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold m-0">Companies</h1>
        <button
          data-testid="new-company-btn"
          onClick={() => setShowNewModal(true)}
          className="py-1.5 px-3.5 bg-blue-600 text-white border-none rounded-md text-sm font-semibold cursor-pointer"
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
        <div className="flex flex-col gap-2">
          {companies.map((co) => (
            <div
              key={co.id}
              data-testid={`company-item-${co.id}`}
              role="button"
              tabIndex={0}
              aria-label={co.name}
              // SIRI-UX-255: CSS class for hover instead of JS onMouseEnter/onMouseLeave
              // SIRI-UX-265: input-focus-ring-blue for focus ring via CSS
              className="companies-item input-focus-ring-blue py-3.5 px-4 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer font-medium transition-colors outline-none flex items-center justify-between"
              onClick={() => navigate(`/companies/${co.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/companies/${co.id}`)
                }
              }}
            >
              <span>{co.name}</span>
              {/* SIRI-UX-429: edit button to open edit company modal */}
              <button
                data-testid={`edit-company-${co.id}-btn`}
                onClick={(e) => handleEditOpen(co, e)}
                className="py-0.5 px-2 bg-transparent border border-gray-600 rounded text-gray-400 text-xs cursor-pointer leading-none"
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
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) handleEditClose() }}
          onKeyDown={(e) => { if (e.key === 'Escape') handleEditClose() }}
        >
          <div ref={editModalTrapRef} className="bg-gray-800 rounded-[10px] p-6 w-[360px] border border-gray-700 relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="m-0 font-bold">Edit Company</h2>
              <button
                aria-label="Close edit company modal"
                onClick={handleEditClose}
                className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none p-1"
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
              className="input-focus-ring-blue w-full py-2 px-3 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border outline-none"
              placeholder="Company name"
            />
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" onClick={handleEditClose} className="py-1.5 px-3.5">
                Cancel
              </Button>
              <Button
                data-testid="edit-company-save-btn"
                variant="primary"
                onClick={handleEditSave}
                disabled={editSaving || !editCompanyName.trim()}
                aria-disabled={editSaving || !editCompanyName.trim()}
                aria-busy={editSaving}
                className="py-1.5 px-3.5 font-semibold"
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
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewModal(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowNewModal(false) }}
        >
          <div ref={newModalTrapRef} className="bg-gray-800 rounded-[10px] p-6 w-[360px] border border-gray-700">
            <h2 className="m-0 mb-4 font-bold">New Company</h2>
            <input
              autoFocus
              data-testid="new-company-name-input"
              aria-label="Company name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="input-focus-ring-blue w-full py-2 px-3 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border outline-none"
              placeholder="Company name"
            />
            <div className="flex gap-2 justify-end mt-4">
              {/* SIRI-UX-409: use <Button> component for consistent style — matches KanbanBoard/TaskCard modal pattern */}
              <Button variant="secondary" onClick={() => { setShowNewModal(false); setNewName('') }} className="py-1.5 px-3.5">
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
                className="py-1.5 px-3.5 font-semibold"
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
