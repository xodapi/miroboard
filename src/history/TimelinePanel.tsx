import type { HistorySnapshot } from '../format/types'

export function formatSnapshotTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function snapshotDescription(snapshot: HistorySnapshot): string {
  const label = snapshot.kind === 'named' && snapshot.label ? `, «${snapshot.label}»` : ''
  return `${formatSnapshotTimestamp(snapshot.at)}${label}, ${snapshot.elementCount} ${snapshot.elementCount === 1 ? 'элемент' : 'элементов'}`
}

export interface TimelinePanelProps {
  darkMode: boolean
  isOpen: boolean
  selectedId: string | null
  snapshots: HistorySnapshot[]
  onClose: () => void
  onSelect: (snapshot: HistorySnapshot) => void
}

/** Presentational timeline controls. Snapshot materialization remains in App so it never mutates Yjs. */
export function TimelinePanel({
  darkMode,
  isOpen,
  selectedId,
  snapshots,
  onClose,
  onSelect,
}: TimelinePanelProps) {
  if (!isOpen) return null
  const entries = [...snapshots].sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
  const selectedIndex = Math.max(0, entries.findIndex(entry => entry.id === selectedId))
  const bg = darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'
  const muted = darkMode ? 'text-slate-300' : 'text-slate-600'

  return (
    <aside
      aria-label="История доски"
      className={`absolute right-3 top-[68px] z-40 flex w-[min(28rem,calc(100vw-24px))] flex-col rounded-2xl border p-4 shadow-2xl ${bg}`}
      data-ui
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">История доски</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>Контрольные точки содержимого документа</p>
        </div>
        <button className="grid size-8 place-items-center rounded-lg text-lg hover:bg-black/10" onClick={onClose} aria-label="Закрыть историю доски">×</button>
      </div>

      {entries.length === 0 ? (
        <div className={`rounded-xl border border-dashed p-5 text-center text-sm ${muted}`}>
          Пока нет контрольных точек. Отметьте состояние или сохраните документ.
        </div>
      ) : (
        <>
          <label className="mb-2 text-xs font-semibold" htmlFor="history-scrubber">Перемещение по истории</label>
          <input
            id="history-scrubber"
            type="range"
            min={0}
            max={Math.max(entries.length - 1, 0)}
            step={1}
            value={selectedIndex}
            aria-valuetext={snapshotDescription(entries[selectedIndex])}
            onChange={event => onSelect(entries[Number(event.currentTarget.value)])}
            className="mb-4 w-full accent-violet-600"
          />
          <ol className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {entries.map((entry) => {
              const selected = entry.id === selectedId
              const named = entry.kind === 'named'
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => onSelect(entry)}
                    aria-pressed={selected}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-violet-500 bg-violet-100 text-violet-950'
                        : named
                          ? darkMode ? 'border-amber-500/60 bg-amber-950/30' : 'border-amber-300 bg-amber-50'
                          : darkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{formatSnapshotTimestamp(entry.at)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${named ? 'bg-amber-500 text-amber-950' : 'bg-slate-200 text-slate-700'}`}>
                        {named ? 'Отмечено' : 'Авто'}
                      </span>
                    </div>
                    {named && entry.label && <div className="mt-1 text-sm font-bold">«{entry.label}»</div>}
                    <div className={`mt-1 text-xs ${muted}`}>{entry.elementCount} {entry.elementCount === 1 ? 'элемент' : 'элементов'}</div>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </aside>
  )
}
