import '@testing-library/jest-dom'

// Suppress known "act(...)" warnings from async fetch in TaskDetailSidebar.
// These occur when synchronous tests render components that kick off async
// useEffect fetches. The component behaviour is correct; this is test-noise only.
const originalError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('not wrapped in act')
  ) {
    return
  }
  originalError(...args)
}
