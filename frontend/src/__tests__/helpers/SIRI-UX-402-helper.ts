/**
 * SIRI-UX-402 helper — static source audit for FilterBar role="menu"
 * Exists to satisfy the dynamic import in SIRI-UX-401-405.test.tsx.
 * Returns true if KanbanBoard.tsx has at least 3 role="menu" occurrences
 * (1 task card menu + 2 filter dropdowns).
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { resolve, dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const source = readFileSync(
  resolve(__dirname, '../../components/KanbanBoard.tsx'),
  'utf-8',
)

export const KanbanBoard_FilterBar_hasMenuRole =
  (source.match(/role="menu"/g) ?? []).length >= 3
