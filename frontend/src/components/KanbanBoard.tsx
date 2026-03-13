import { useAgentStore, type TaskStatus } from '../store/agentStore'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

export default function KanbanBoard() {
  const tasks = useAgentStore((s) => s.tasks)

  return (
    <div
      data-testid="kanban-board"
      style={{ display: 'flex', gap: '1rem', padding: '1rem' }}
    >
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          style={{
            flex: 1,
            background: '#111827',
            borderRadius: 8,
            padding: '0.75rem',
          }}
        >
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            {col.label}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {tasks
              .filter((t) => t.status === col.id)
              .map((task) => (
                <div
                  key={task.id}
                  style={{
                    background: '#1f2937',
                    borderRadius: 6,
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                  }}
                >
                  {task.title}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
