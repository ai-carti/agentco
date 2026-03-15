import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import WarRoom from './WarRoom'
import KanbanBoard from './KanbanBoard'
import { useAgentStore } from '../store/agentStore'
import { getStoredToken } from '../api/client'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const setCurrentCompany = useAgentStore((s) => s.setCurrentCompany)

  useEffect(() => {
    if (!id) return
    const token = getStoredToken()
    fetch(`${BASE_URL}/api/v1/companies/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCurrentCompany({ id: data.id, name: data.name })
      })
      .catch(() => {})

    return () => setCurrentCompany(null)
  }, [id, setCurrentCompany])

  return (
    <div data-testid="company-page">
      <WarRoom />
      <KanbanBoard companyId={id ?? ''} />
    </div>
  )
}
