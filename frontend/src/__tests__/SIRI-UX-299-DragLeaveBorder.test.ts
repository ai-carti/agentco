/**
 * SIRI-UX-299: KanbanBoard handleDragLeave must check relatedTarget to prevent
 * the column blue border from flickering when dragging over child elements.
 *
 * Without the fix, dragging a card over TaskCard divs inside a column fires
 * dragleave on the column → setDragOverCol(null) → border disappears mid-drag.
 * Fix: check `e.currentTarget.contains(e.relatedTarget)` and bail out if true.
 */
import { describe, it, expect } from 'vitest'

const modules = import.meta.glob('../components/KanbanBoard.tsx', { query: '?raw', import: 'default', eager: true })
const src: string = modules['../components/KanbanBoard.tsx'] as string

describe('SIRI-UX-299: handleDragLeave checks relatedTarget', () => {
  it('handleDragLeave accepts a DragEvent parameter (not a zero-arg function)', () => {
    // Old: const handleDragLeave = useCallback(() => { setDragOverCol(null) }, [])
    // New: const handleDragLeave = useCallback((e: React.DragEvent) => { ... }, [])
    expect(src).toMatch(/handleDragLeave\s*=\s*useCallback\s*\(\s*\(e[^)]*DragEvent/)
  })

  it('handleDragLeave checks relatedTarget against currentTarget', () => {
    expect(src).toContain('relatedTarget')
    expect(src).toMatch(/\.contains\s*\(related\)/)
  })

  it('setDragOverCol(null) is not called unconditionally on drag leave', () => {
    // Find the handleDragLeave block and confirm it has a guard before setDragOverCol
    const dragLeaveBlock = src.match(/handleDragLeave[\s\S]*?useCallback[\s\S]*?\}\s*,\s*\[\s*\]\s*\)/)
    expect(dragLeaveBlock).not.toBeNull()
    if (dragLeaveBlock) {
      const block = dragLeaveBlock[0]
      // The block must contain `return` (the early bail-out) before setDragOverCol
      expect(block).toContain('return')
      expect(block).toContain('setDragOverCol(null)')
    }
  })
})
