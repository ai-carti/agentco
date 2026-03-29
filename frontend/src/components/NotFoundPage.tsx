import { useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Not Found — AgentCo')
  const navigate = useNavigate()

  return (
    <div
      data-testid="not-found-page"
      className="p-12 text-center text-gray-400 min-h-[60vh] flex flex-col items-center justify-center"
    >
      {/* SIRI-UX-399: use semantic h1 for screen reader heading navigation */}
      <div className="text-6xl mb-4" aria-hidden="true">404</div>
      <h1 className="text-xl font-bold text-slate-100 mb-2">
        Page not found
      </h1>
      <div className="text-sm text-gray-500 mb-6">
        The page you're looking for doesn't exist.
      </div>
      <button
        data-testid="not-found-home-btn"
        onClick={() => navigate('/')}
        className="px-5 py-2 bg-blue-600 text-white border-none rounded-md text-sm font-semibold cursor-pointer"
      >
        Go home
      </button>
    </div>
  )
}
