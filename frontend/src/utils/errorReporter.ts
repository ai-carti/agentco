/**
 * SIRI-POST-007: Structured error reporter for ErrorBoundary.
 *
 * - dev: console.error with plain format (unchanged behavior)
 * - production + VITE_SENTRY_DSN: Sentry.captureException
 * - production, no VITE_SENTRY_DSN: structured console.error with JSON payload
 */
import * as Sentry from '@sentry/react'

export interface ErrorInfo {
  componentStack: string
}

export function reportError(error: Error, info: ErrorInfo): void {
  const isProd = import.meta.env.PROD
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

  if (!isProd) {
    // Dev: preserve original behavior
    console.error('[ErrorBoundary] caught:', error, info.componentStack)
    return
  }

  if (sentryDsn) {
    // Production + Sentry DSN configured
    Sentry.withScope((scope) => {
      scope.setExtras({ componentStack: info.componentStack })
      Sentry.captureException(error)
    })
  } else {
    // Production, no Sentry: structured JSON log for log aggregation
    const payload = JSON.stringify({
      level: 'error',
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      timestamp: new Date().toISOString(),
    })
    console.error('[ErrorBoundary]', payload)
  }
}

/**
 * Initialize Sentry if VITE_SENTRY_DSN is set.
 * Call this once in main.tsx for production builds.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (dsn && import.meta.env.PROD) {
    Sentry.init({ dsn })
  }
}
