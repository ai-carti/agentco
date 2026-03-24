// SIRI-UX-243: EmptyState inline <style> tag duplicates @keyframes fadeIn already in index.css
// SIRI-UX-244: SkeletonCard injects shimmer keyframes via JS at runtime — should be in index.css CSS class
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import EmptyState from '../components/EmptyState'
import SkeletonCard from '../components/SkeletonCard'

describe('SIRI-UX-243: EmptyState — no inline <style> tag', () => {
  it('does not render an inline <style> tag inside EmptyState', () => {
    const { container } = render(
      <EmptyState title="Empty" subtitle="Nothing here" />
    )
    // No inline style tag should exist inside the component
    const styleTags = container.querySelectorAll('style')
    expect(styleTags).toHaveLength(0)
  })

  it('applies fadeIn CSS class instead of inline animation style', () => {
    const { container } = render(
      <EmptyState title="Empty" subtitle="Nothing here" />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root).toBeTruthy()
    // Should use CSS class (empty-state-fadein) not inline animation
    expect(root.className).toContain('empty-state-fadein')
  })
})

describe('SIRI-UX-244: SkeletonCard — shimmer uses CSS class not JS-injected keyframes', () => {
  it('shimmer lines have skeleton-shimmer CSS class', () => {
    const { container } = render(<SkeletonCard variant="agent" />)
    const shimmerEl = container.querySelector('[data-testid="skeleton-line"]') as HTMLElement
    expect(shimmerEl).toBeTruthy()
    expect(shimmerEl.className).toContain('skeleton-shimmer')
  })

  it('shimmer circles have skeleton-shimmer CSS class', () => {
    const { container } = render(<SkeletonCard variant="agent" />)
    const avatarEl = container.querySelector('[data-testid="skeleton-avatar"]') as HTMLElement
    expect(avatarEl).toBeTruthy()
    expect(avatarEl.className).toContain('skeleton-shimmer')
  })
})
