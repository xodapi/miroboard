import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { HISTORY_RESTORE_ORIGIN } from './snapshots'
import type { HistorySnapshot } from '../format/types'

export const EDITS_PER_AUTOMATIC_CHECKPOINT = 50
export const AUTOMATIC_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000

export interface CaptureTriggers {
  /** Captures a checkpoint without changing the Y.Doc. */
  captureNow(kind: HistorySnapshot['kind'], label?: string, at?: string): HistorySnapshot
  /** Must be called immediately before applying a historical restore. */
  captureBeforeRestore(): HistorySnapshot
  dispose(): void
}

export interface CaptureTriggersOptions {
  ydoc: Y.Doc
  capture: (kind: HistorySnapshot['kind'], label?: string, at?: string) => HistorySnapshot
  now?: () => string
  setInterval?: typeof window.setInterval
  clearInterval?: typeof window.clearInterval
  ignoredOrigins?: ReadonlySet<unknown>
}

/**
 * Keeps checkpoint policy outside React.  Snapshot metadata is deliberately
 * external to Yjs, so recording a checkpoint cannot make a document dirty.
 */
export function createCaptureTriggers({
  ydoc,
  capture,
  now = () => new Date().toISOString(),
  setInterval: schedule = window.setInterval.bind(window),
  clearInterval: cancel = window.clearInterval.bind(window),
  ignoredOrigins = new Set([HISTORY_RESTORE_ORIGIN]),
}: CaptureTriggersOptions): CaptureTriggers {
  let editsSinceCapture = 0
  let hasEditSinceCapture = false

  const captureNow = (kind: HistorySnapshot['kind'], label?: string, at = now()) => {
    const entry = capture(kind, label, at)
    if (kind === 'auto') {
      editsSinceCapture = 0
      hasEditSinceCapture = false
    }
    return entry
  }
  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (ignoredOrigins.has(origin) || origin instanceof IndexeddbPersistence) return
    editsSinceCapture += 1
    hasEditSinceCapture = true
    if (editsSinceCapture >= EDITS_PER_AUTOMATIC_CHECKPOINT) captureNow('auto')
  }
  const timer = schedule(() => {
    if (hasEditSinceCapture) captureNow('auto')
  }, AUTOMATIC_CHECKPOINT_INTERVAL_MS)

  ydoc.on('update', onUpdate)
  return {
    captureNow,
    captureBeforeRestore: () => captureNow('auto'),
    dispose: () => {
      ydoc.off('update', onUpdate)
      cancel(timer)
    },
  }
}
