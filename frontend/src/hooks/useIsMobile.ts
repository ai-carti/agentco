/**
 * SIRI-UX-132: shared debounced useIsMobile hook
 * Extracted from WarRoomPage.tsx (which had the correct debounced implementation)
 * to eliminate duplication in CompanyPage.tsx and Sidebar.tsx which both had
 * the un-debounced version — causing excessive re-renders on resize.
 */
import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 640
const DEBOUNCE_MS = 120

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  )
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setMobile(window.innerWidth < MOBILE_BREAKPOINT), DEBOUNCE_MS)
    }
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('resize', handler)
      if (timer) clearTimeout(timer)
    }
  }, [])
  return mobile
}
