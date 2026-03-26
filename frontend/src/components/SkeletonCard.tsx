import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'

// SIRI-UX-244: shimmer animation moved to index.css .skeleton-shimmer class
// (eliminates runtime JS-injected <style> tag — same pattern as SIRI-UX-237/242/243)

const CARD_STYLE: CSSProperties = {
  background: '#1f2937',
  borderRadius: 8,
  padding: '0.75rem',
  border: '1px solid #374151',
}

function ShimmerLine({ width = '100%', height = 12 }: { width?: string | number; height?: number }) {
  return (
    <div
      data-testid="skeleton-line"
      className="skeleton-shimmer"
      style={{ width, height }}
    />
  )
}

function ShimmerCircle({ size, testId = 'skeleton-avatar' }: { size: number; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="skeleton-shimmer"
      style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }}
    />
  )
}

function AgentSkeleton() {
  return (
    <div data-testid="skeleton-agent" style={CARD_STYLE}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
        <ShimmerCircle size={48} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ShimmerLine width="60%" height={14} />
          <ShimmerLine width="40%" height={12} />
        </div>
      </div>
      <ShimmerLine width="30%" height={10} />
    </div>
  )
}

function TaskSkeleton() {
  return (
    <div data-testid="skeleton-task" style={CARD_STYLE}>
      <ShimmerLine width="80%" height={14} />
      <div style={{ marginTop: 8 }}>
        <ShimmerLine width="100%" height={10} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 10 }}>
        <ShimmerCircle size={24} />
        <ShimmerLine width="50%" height={10} />
      </div>
    </div>
  )
}

function CompanySkeleton() {
  return (
    <div data-testid="skeleton-company" style={CARD_STYLE}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <ShimmerCircle size={40} testId="skeleton-icon" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ShimmerLine width="70%" height={14} />
          <ShimmerLine width="45%" height={10} />
        </div>
      </div>
    </div>
  )
}

interface SkeletonCardProps {
  variant: 'agent' | 'task' | 'company'
  count?: number
}

export default function SkeletonCard({ variant, count = 1 }: SkeletonCardProps) {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    // SIRI-UX-244: shimmer is now in index.css — no JS injection needed
    const timer = setTimeout(() => setTimedOut(true), 5000)
    return () => clearTimeout(timer)
  }, [])

  if (timedOut) {
    return (
      // SIRI-UX-236: role="alert" so screen readers announce the timeout error to the user
      <div role="alert" style={{ padding: '1rem', textAlign: 'center', color: '#f87171', fontSize: '0.875rem' }}>
        Loading took too long. Please try refreshing.
      </div>
    )
  }

  const Component = variant === 'agent' ? AgentSkeleton : variant === 'task' ? TaskSkeleton : CompanySkeleton

  return (
    // SIRI-UX-364: role="status" + aria-label so screen readers announce loading state.
    // aria-busy="true" additionally signals to AT that the region is updating.
    // Without this, 9+ usage sites across the app give no feedback to screen reader users.
    <div
      role="status"
      aria-label="Loading..."
      aria-busy={true}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Component key={`skeleton-${variant}-${i}`} />
      ))}
    </div>
  )
}
