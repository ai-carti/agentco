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
      className="empty-state-fadein flex flex-col items-center justify-center gap-3 py-16 px-4 text-center"
    >
      {icon ? (
        <div data-testid="empty-state-icon" className="leading-none">{icon}</div>
      ) : (
        <span className="text-6xl leading-none">{emoji}</span>
      )}
      <h3 className="text-lg font-semibold text-slate-50 m-0">
        {title}
      </h3>
      <p className="text-sm text-gray-400 m-0 max-w-[20rem]">
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
