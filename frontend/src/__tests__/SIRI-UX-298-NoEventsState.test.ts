/**
 * SIRI-UX-298: useWarRoomSocket must NOT expose an `events` array in its return value.
 *
 * Keeping an `events` state caused setEvents() to fire on every WS message,
 * triggering a re-render of useWarRoomSocket (and WarRoomPage) even though no
 * component ever consumed the `events` field. Fix: removed `events` state entirely.
 */
import { describe, it, expect } from 'vitest'

const modules = import.meta.glob('../hooks/useWarRoomSocket.ts', { query: '?raw', import: 'default', eager: true })
const src: string = modules['../hooks/useWarRoomSocket.ts'] as string

describe('SIRI-UX-298: useWarRoomSocket — no events state', () => {
  it('source does not declare events state with useState', () => {
    // Removed: const [events, setEvents] = useState<WsEvent[]>([])
    expect(src).not.toMatch(/useState<WsEvent\[\]>/)
    expect(src).not.toContain('const [events,')
  })

  it('source does not call setEvents (which would trigger unnecessary re-renders)', () => {
    expect(src).not.toContain('setEvents(')
  })

  it('return value does not include events field', () => {
    // The return statement should only have isConnected and error
    // Match: return { isConnected, error }  (no events)
    expect(src).not.toMatch(/return\s*\{[^}]*\bevents\b[^}]*\}/)
  })

  it('UseWarRoomSocketResult interface does not have events field', () => {
    expect(src).not.toMatch(/events:\s*WsEvent\[\]/)
  })
})
