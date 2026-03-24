import type React from 'react'

interface EmptyStateProps {
  /** @deprecated Use icon instead. Kept for backward compat. */
  emoji?: string
  icon?: React.ReactNode
  title: string
  subtitle: string
  ctaLabel?: string
  onCTA?: () => void
  ctaTestId?: string
}

export default function EmptyState({ emoji, icon, title, subtitle, ctaLabel, onCTA, ctaTestId }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className="empty-state-fadein"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '4rem 1rem',
        textAlign: 'center',
      }}
    >
      {icon ? (
        <div data-testid="empty-state-icon" style={{ lineHeight: 1 }}>{icon}</div>
      ) : (
        <span style={{ fontSize: '4rem', lineHeight: 1 }}>{emoji}</span>
      )}
      <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: 0, maxWidth: '20rem' }}>
        {subtitle}
      </p>
      {ctaLabel && onCTA && (
        <button
          data-testid={ctaTestId}
          onClick={onCTA}
          className="empty-state-cta-btn"
        >
          {ctaLabel}
        </button>
      )}
      {/* SIRI-UX-243: fadeIn @keyframes moved to index.css .empty-state-fadein class */}
    </div>
  )
}
