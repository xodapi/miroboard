import type { HistorySnapshot } from '../format/types'
import { formatSnapshotTimestamp } from './TimelinePanel'

interface Props {
  darkMode: boolean
  snapshot: HistorySnapshot | null
  onRestore: () => void
  onClose: () => void
}

/** Read-only preview controls kept separate from the canvas shell. */
export function HistoryPreviewBanner({ darkMode, snapshot, onRestore, onClose }: Props) {
  if (!snapshot) return null
  return <div role="status" aria-live="polite" className={`absolute left-1/2 top-[62px] z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-center text-xs font-semibold shadow-lg ${darkMode ? 'border-violet-400 bg-violet-950 text-violet-100' : 'border-violet-300 bg-violet-50 text-violet-900'}`} data-ui>
    Просмотр состояния от {formatSnapshotTimestamp(snapshot.at)}{snapshot.kind === 'named' && snapshot.label ? `, «${snapshot.label}»` : ''}. Редактирование отключено.
    <button onClick={onRestore} className="ml-3 rounded-md bg-violet-600 px-2 py-1 text-white hover:bg-violet-700">Восстановить это состояние</button>
    <button onClick={onClose} className="ml-3 rounded-md px-2 py-1 underline underline-offset-2 hover:bg-violet-200/40">Закрыть</button>
  </div>
}
