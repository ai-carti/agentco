import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * SIRI-UX-430: Smart auto-scroll for activity feeds.
 * Only scrolls to bottom when user is already near the bottom.
 * If user has scrolled up to read history, new messages don't steal their position.
 */
const NEAR_BOTTOM_THRESHOLD = 100 // px from bottom to consider "near bottom"

export function useAutoScroll(deps: unknown[] = []) {
  const feedEndRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    setIsNearBottom(distanceFromBottom <= NEAR_BOTTOM_THRESHOLD)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (feedEndRef.current && typeof feedEndRef.current.scrollIntoView === 'function') {
      feedEndRef.current.scrollIntoView({ behavior: 'auto' })
    }
  }, [])

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (isNearBottom && feedEndRef.current && typeof feedEndRef.current.scrollIntoView === 'function') {
      feedEndRef.current.scrollIntoView({ behavior: 'auto' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { feedEndRef, containerRef, isNearBottom, handleScroll, scrollToBottom }
}
