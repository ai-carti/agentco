import { useEffect, useRef } from 'react'

/**
 * SIRI-UX-431: Set document.title on mount, restore on unmount.
 * Improves accessibility (screen readers announce page title) and
 * UX (users can distinguish tabs in the browser).
 */
export function useDocumentTitle(title: string) {
  const prevTitleRef = useRef(document.title)

  useEffect(() => {
    prevTitleRef.current = document.title
    document.title = title
    return () => {
      document.title = prevTitleRef.current
    }
  }, [title])
}
