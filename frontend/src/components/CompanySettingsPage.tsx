import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getStoredToken, BASE_URL } from '../api/client'
import { useToast } from '../context/ToastContext'
import Button from './Button'
// SIRI-POST-006: focus trap for modals
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
// SIRI-UX-460: skeleton while company data loads
import SkeletonCard from './SkeletonCard'


interface CompanyData {
  id: string
  name: string
  description?: string
  owner_id?: string
}

export default function CompanySettingsPage() {
  useDocumentTitle('Company Settings — AgentCo')
  const { id: companyId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [company, setCompany] = useState<CompanyData | null>(null)
  const [loadingCompany, setLoadingCompany] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  // SIRI-POST-006: focus trap
  const deleteTrapRef = useFocusTrap(deleteModalOpen)
  // SIRI-UX-189: AbortController ref to guard setState/toast in finally on unmounted component
  const saveAbortRef = useRef<AbortController | null>(null)
  // SIRI-UX-309: AbortController ref for handleDelete to guard toast/setState on unmounted component
  const deleteAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!companyId) return
    const controller = new AbortController()
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/companies/${companyId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setCompany(data)
          setName(data.name ?? '')
          setDescription(data.description ?? '')
        }
        setLoadingCompany(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setLoadingCompany(false)
      })
    return () => controller.abort()
  }, [companyId])

  // SIRI-UX-309: cleanup abort refs on unmount
  useEffect(() => {
    return () => {
      saveAbortRef.current?.abort()
      deleteAbortRef.current?.abort()
    }
  }, [])

  // SIRI-UX-384: useCallback prevents recreation on every render — passed as onClick to Save button
  const handleSave = useCallback(async () => {
    saveAbortRef.current?.abort()
    const controller = new AbortController()
    saveAbortRef.current = controller
    const { signal } = controller
    setSaving(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, description }),
        signal,
      })
      if (!signal.aborted) {
        if (res.ok) {
          toast.success('Company settings saved')
          setCompany((c) => c ? { ...c, name, description } : c)
        } else {
          toast.error('Failed to save settings')
        }
      }
    } catch {
      if (!signal.aborted) {
        toast.error('Network error')
      }
    } finally {
      if (!signal.aborted) {
        setSaving(false)
      }
    }
  // SIRI-UX-384: deps — name, description are state values read inside; toast stable
  }, [companyId, name, description, toast]) // SIRI-UX-384

  // SIRI-UX-384: useCallback prevents recreation on every render
  const handleDelete = useCallback(async () => {
    // SIRI-UX-309: AbortController to guard toast/setState on unmounted component
    deleteAbortRef.current?.abort()
    const controller = new AbortController()
    deleteAbortRef.current = controller
    const { signal } = controller
    setIsDeleting(true)
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      })
      if (signal.aborted) return
      if (res.ok) {
        toast.success('Company deleted')
        navigate('/')
      } else {
        toast.error('Failed to delete company')
        setIsDeleting(false)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (!signal.aborted) {
        toast.error('Network error')
        setIsDeleting(false)
      }
    }
  // SIRI-UX-384: deps — companyId, company.name (for confirm validation), navigate, toast
  }, [companyId, navigate, toast]) // SIRI-UX-384

  // SIRI-UX-460: show loading skeleton while company data is being fetched
  if (loadingCompany) {
    return (
      <div data-testid="company-settings-loading" className="p-6 max-w-[560px]" role="status" aria-label="Loading company settings…">
        <SkeletonCard variant="task" count={3} />
      </div>
    )
  }

  return (
    <div data-testid="company-settings-page" className="p-6 max-w-[560px]">
      <h1 className="text-2xl font-bold m-0 mb-6">
        Company Settings
      </h1>

      {/* General section */}
      <div className="mb-8">
        <h2 className="text-base font-semibold mb-4">General</h2>

        <div className="mb-3">
          <label htmlFor="company-name" className="block text-[0.8rem] text-gray-400 mb-1">
            Company name
          </label>
          <input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-focus-ring w-full py-2 px-3 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border outline-none"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="company-description" className="block text-[0.8rem] text-gray-400 mb-1">
            Description
          </label>
          <textarea
            id="company-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-focus-ring w-full py-2 px-3 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border resize-y outline-none"
            rows={3}
          />
        </div>

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          className="py-2 px-5 text-sm"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-900 rounded-lg p-4 bg-red-900/10">
        <h2 className="text-base font-semibold text-red-400 mb-2">
          Danger Zone
        </h2>
        <p className="text-gray-400 text-[0.8rem] mb-3">
          Once you delete a company, there is no going back.
        </p>
        <Button
          variant="danger"
          onClick={() => setDeleteModalOpen(true)}
          className="py-1.5 px-4 text-[0.8rem]"
        >
          Delete this company
        </Button>
      </div>

      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete Company"
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteModalOpen(false) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setDeleteModalOpen(false) }}
        >
          <div ref={deleteTrapRef} className="bg-gray-800 rounded-[10px] p-6 w-[400px] border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h2 className="m-0 mb-3 font-bold text-red-400">
              Delete Company
            </h2>
            <p className="text-gray-400 text-sm m-0 mb-4">
              Type <strong className="text-gray-50">{company?.name}</strong> to confirm deletion.
            </p>
            <input
              data-testid="confirm-delete-company-input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="input-focus-ring-red w-full py-2 px-3 bg-gray-900 border border-gray-700 rounded-md text-gray-50 text-sm box-border mb-4 outline-none"
              placeholder={company?.name}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirm('') }}
                className="py-1.5 px-3.5"
              >
                Cancel
              </Button>
              <Button
                data-testid="confirm-delete-company-btn"
                variant="danger"
                onClick={handleDelete}
                disabled={deleteConfirm !== company?.name || isDeleting}
                className="py-1.5 px-3.5"
              >
                {isDeleting ? 'Deleting…' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
