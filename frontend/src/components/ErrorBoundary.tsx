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
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            color: '#9ca3af',
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💥</div>
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#f1f5f9',
              marginBottom: '0.5rem',
            }}
          >
            Something went wrong
          </div>
          <div
            style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '1.5rem',
              maxWidth: 400,
            }}
          >
            An unexpected error occurred. Try reloading the page.
          </div>
          <button
            data-testid="error-boundary-reload-btn"
            onClick={this.handleReload}
            style={{
              padding: '0.5rem 1.25rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
