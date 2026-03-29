import { useState, useEffect } from 'react'

// SIRI-UX-244: shimmer animation moved to index.css .skeleton-shimmer class
// (eliminates runtime JS-injected <style> tag — same pattern as SIRI-UX-237/242/243)

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
      className="skeleton-shimmer rounded-full shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

function AgentSkeleton() {
  return (
    <div data-testid="skeleton-agent" className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <div className="flex gap-3 items-center mb-2">
        <ShimmerCircle size={48} />
        <div className="flex-1 flex flex-col gap-1.5">
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
    <div data-testid="skeleton-task" className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <ShimmerLine width="80%" height={14} />
      <div className="mt-2">
        <ShimmerLine width="100%" height={10} />
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <ShimmerCircle size={24} />
        <ShimmerLine width="50%" height={10} />
      </div>
    </div>
  )
}

function CompanySkeleton() {
  return (
    <div data-testid="skeleton-company" className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <div className="flex gap-3 items-center">
        <ShimmerCircle size={40} testId="skeleton-icon" />
        <div className="flex-1 flex flex-col gap-1.5">
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
      <div role="alert" className="p-4 text-center text-red-400 text-sm">
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
      className="flex flex-col gap-2"
    >
      {Array.from({ length: count }, (_, i) => (
        <Component key={`skeleton-${variant}-${i}`} />
      ))}
    </div>
  )
}
