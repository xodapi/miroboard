import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import * as Y from 'yjs'
import { DEFAULT_RETENTION } from './retention'
import type { HistorySnapshot } from '../format/types'

interface Props {
  elements: unknown[]
  snapshots: HistorySnapshot[]
  ydoc: Y.Doc
  textClassName: string
  onCompact: () => void
}

export function HistoryRetentionControls({ elements, snapshots, ydoc, textClassName, onCompact }: Props) {
  const [confirming, setConfirming] = useState(false)
  const { historySizeBytes, ratio } = useMemo(() => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      yjsState: Y.encodeStateAsUpdate(ydoc), snapshots, retention: DEFAULT_RETENTION,
    })).byteLength
    const current = new TextEncoder().encode(JSON.stringify(elements)).byteLength
    return { historySizeBytes: bytes, ratio: current === 0 ? 0 : bytes / current }
  }, [elements, snapshots, ydoc])
  const compact = () => {
    onCompact()
    setConfirming(false)
  }
  return (
    <>
      <span role="status" aria-live="polite" className={`px-2 text-[11px] font-medium ${textClassName}`}>
        История: {(historySizeBytes / 1024).toFixed(1)} КБ, {ratio.toFixed(1)}× из {DEFAULT_RETENTION.maxHistoryRatio}×, точек: {snapshots.length}
      </span>
      <button onClick={() => setConfirming(true)} className="h-9 rounded-xl px-3 text-[13px] font-medium text-red-600 transition hover:bg-red-50">Сжать историю</button>
      {confirming && createPortal(
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/45 p-4 backdrop-blur-sm" data-ui>
          <section role="dialog" aria-modal="true" aria-labelledby="history-compaction-title" className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl">
            <h2 id="history-compaction-title" className="text-2xl font-bold text-slate-900">Сжать историю</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Будут безвозвратно удалены все контрольные точки истории. Содержимое доски останется без изменений.</p>
            <div className="mt-7 flex justify-end gap-3">
              <button onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Отмена</button>
              <button onClick={compact} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Сжать историю</button>
            </div>
          </section>
        </div>
      , document.body)}
    </>
  )
}
