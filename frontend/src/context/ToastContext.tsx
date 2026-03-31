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

const STYLES: Record<ToastType, { borderClass: string; bgClass: string; textClass: string; icon: string }> = {
  success: {
    borderClass: 'border-emerald-700',
    bgClass: 'bg-emerald-900/90',
    textClass: 'text-emerald-100',
    icon: '✓',
  },
  error: {
    borderClass: 'border-red-700',
    bgClass: 'bg-red-900/90',
    textClass: 'text-red-100',
    icon: '✕',
  },
  info: {
    borderClass: 'border-blue-700',
    bgClass: 'bg-blue-900/90',
    textClass: 'text-blue-100',
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
      {/* SIRI-UX-438: aria-live="polite" + role="status" so screen readers announce toasts */}
      <div
        data-testid="toast-container"
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const s = STYLES[t.type]
          return (
            <div
              key={t.id}
              data-testid="toast-item"
              data-type={t.type}
              className={`${s.bgClass} border ${s.borderClass} ${s.textClass} rounded-lg px-4 py-3 min-w-[280px] max-w-[380px] shadow-lg flex items-center gap-2.5 pointer-events-auto text-sm animate-[toast-slide-in_0.2s_ease-out]`}
            >
              <span className="text-base shrink-0">{s.icon}</span>
              <span className="flex-1 break-words">{t.text}</span>
              <button
                data-testid="toast-close"
                onClick={() => dismiss(t.id)}
                aria-label="Close"
                className={`bg-transparent border-none ${s.textClass} cursor-pointer px-1 py-0 text-base leading-none opacity-70 shrink-0`}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
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
