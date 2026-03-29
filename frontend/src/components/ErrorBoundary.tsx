import { Component, type ReactNode } from 'react'
import { reportError } from '../utils/errorReporter'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    reportError(error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          role="alert"
          aria-live="assertive"
          className="p-12 text-center text-gray-400 min-h-[60vh] flex flex-col items-center justify-center"
        >
          <div className="text-5xl mb-4">💥</div>
          <div className="text-xl font-bold text-slate-100 mb-2">
            Something went wrong
          </div>
          <div className="text-sm text-gray-500 mb-6 max-w-[400px]">
            An unexpected error occurred. Try reloading the page.
          </div>
          <button
            data-testid="error-boundary-reload-btn"
            onClick={this.handleReload}
            className="px-5 py-2 bg-blue-600 text-white border-none rounded-md text-sm font-semibold cursor-pointer"
          >
            Reload page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
