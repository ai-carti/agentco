import { useParams } from 'react-router-dom'
import WarRoom from './WarRoom'
import KanbanBoard from './KanbanBoard'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div data-testid="company-page">
      <WarRoom />
      <KanbanBoard companyId={id ?? ''} />
    </div>
  )
}
