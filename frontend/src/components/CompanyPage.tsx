import WarRoom from './WarRoom'
import KanbanBoard from './KanbanBoard'

export default function CompanyPage() {
  return (
    <div data-testid="company-page">
      <WarRoom />
      <KanbanBoard />
    </div>
  )
}
