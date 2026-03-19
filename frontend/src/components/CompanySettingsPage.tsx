import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getStoredToken } from '../api/client'
import { useToast } from '../context/ToastContext'
import Button from './Button'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface CompanyData {
  id: string
  name: string
  description?: string
  owner_id?: string
}

export default function CompanySettingsPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [company, setCompany] = useState<CompanyData | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  useEffect(() => {
    if (!companyId) return
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/companies/${companyId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setCompany(data)
          setName(data.name ?? '')
          setDescription(data.description ?? '')
        }
      })
      .catch(() => {})
  }, [companyId])

  const handleSave = async () => {
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
      })
      if (res.ok) {
        toast.success('Company settings saved')
        setCompany((c) => c ? { ...c, name, description } : c)
      } else {
        toast.error('Failed to save settings')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      const token = getStoredToken()
      const res = await fetch(`${BASE_URL}/api/companies/${companyId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        toast.success('Company deleted')
        navigate('/')
      } else {
        toast.error('Failed to delete company')
      }
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <div data-testid="company-settings-page" style={{ padding: '1.5rem', maxWidth: 560 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '1.5rem' }}>
        Company Settings
      </h1>

      {/* General section */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>General</h2>

        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="company-name" style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            Company name
          </label>
          <input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6c47ff' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
              border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
              fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="company-description" style={{ display: 'block', fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
            Description
          </label>
          <textarea
            id="company-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6c47ff' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
            rows={3}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
              border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
              fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      {/* Danger Zone */}
      <div
        style={{
          border: '1px solid #7f1d1d', borderRadius: 8, padding: '1rem',
          background: 'rgba(127,29,29,0.1)',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f87171', marginBottom: '0.5rem' }}>
          Danger Zone
        </h2>
        <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Once you delete a company, there is no going back.
        </p>
        <Button
          variant="danger"
          onClick={() => setDeleteModalOpen(true)}
          style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
        >
          Delete this company
        </Button>
      </div>

      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteModalOpen(false) }}
        >
          <div style={{
            background: '#1f2937', borderRadius: 10, padding: '1.5rem', width: 400,
            border: '1px solid #374151',
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 0.75rem', fontWeight: 700, color: '#f87171' }}>
              Delete Company
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              Type <strong style={{ color: '#f8fafc' }}>{company?.name}</strong> to confirm deletion.
            </p>
            <input
              data-testid="confirm-delete-company-input"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#f87171' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#374151' }}
              placeholder={company?.name}
              style={{
                width: '100%', padding: '0.5rem 0.75rem', background: '#111827',
                border: '1px solid #374151', borderRadius: 6, color: '#f8fafc',
                fontSize: '0.875rem', boxSizing: 'border-box', marginBottom: '1rem', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirm('') }}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                Cancel
              </Button>
              <Button
                data-testid="confirm-delete-company-btn"
                variant="danger"
                onClick={handleDelete}
                disabled={deleteConfirm !== company?.name}
                style={{ padding: '0.4rem 0.9rem' }}
              >
                Delete permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
