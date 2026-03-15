import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  text: string
}

interface ToastContextValue {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 3000

let counter = 0
function nextId() {
  return `toast-${++counter}`
}

const STYLES: Record<ToastType, { border: string; bg: string; text: string; icon: string }> = {
  success: {
    border: '1px solid #047857',
    bg: 'rgba(6, 78, 59, 0.92)',
    text: '#d1fae5',
    icon: '✓',
  },
  error: {
    border: '1px solid #b91c1c',
    bg: 'rgba(127, 29, 29, 0.92)',
    text: '#fee2e2',
    icon: '✕',
  },
  info: {
    border: '1px solid #1d4ed8',
    bg: 'rgba(30, 58, 138, 0.92)',
    text: '#dbeafe',
    icon: 'ℹ',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback(
    (type: ToastType, text: string) => {
      const id = nextId()
      setToasts((prev) => {
        const next = [...prev, { id, type, text }]
        // Keep only last MAX_TOASTS
        if (next.length > MAX_TOASTS) {
          // Remove timer for the oldest toast being evicted
          const evicted = next.slice(0, next.length - MAX_TOASTS)
          evicted.forEach((t) => {
            clearTimeout(timers.current.get(t.id))
            timers.current.delete(t.id)
          })
          return next.slice(-MAX_TOASTS)
        }
        return next
      })
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  const success = useCallback((text: string) => addToast('success', text), [addToast])
  const error = useCallback((text: string) => addToast('error', text), [addToast])
  const info = useCallback((text: string) => addToast('info', text), [addToast])

  return (
    <ToastContext.Provider value={{ success, error, info }}>
      {children}
      <div
        data-testid="toast-container"
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const s = STYLES[t.type]
          return (
            <div
              key={t.id}
              data-testid="toast-item"
              data-type={t.type}
              style={{
                background: s.bg,
                border: s.border,
                color: s.text,
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
                minWidth: 280,
                maxWidth: 380,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                pointerEvents: 'auto',
                fontSize: '0.875rem',
                animation: 'toast-slide-in 0.2s ease-out',
              }}
            >
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>{s.icon}</span>
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{t.text}</span>
              <button
                data-testid="toast-close"
                onClick={() => dismiss(t.id)}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: s.text,
                  cursor: 'pointer',
                  padding: '0 0.25rem',
                  fontSize: '1rem',
                  lineHeight: 1,
                  opacity: 0.7,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(0.5rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

const noopToast: ToastContextValue = {
  success: () => {},
  error: () => {},
  info: () => {},
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  // Return no-ops when used outside provider (e.g. isolated component tests)
  return ctx ?? noopToast
}
