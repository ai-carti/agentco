import WarRoom from './components/WarRoom'
import KanbanBoard from './components/KanbanBoard'

function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', background: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      <WarRoom />
      <KanbanBoard />
    </div>
  )
}

export default App
