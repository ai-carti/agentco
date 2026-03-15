import { useParams } from 'react-router-dom'

export default function AgentPage() {
  const { agentId } = useParams()

  return (
    <div data-testid="agent-page" style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, marginBottom: '1rem' }}>
        Agent {agentId}
      </h1>
      <p style={{ color: '#9ca3af' }}>Agent details</p>
    </div>
  )
}
