import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { HistorySnapshot } from '../format/types'
import { RECOVERY_ORIGIN } from '../persistence/dirty'
import { HISTORY_RESTORE_ORIGIN } from './snapshots'
import {
  AUTOMATIC_CHECKPOINT_INTERVAL_MS,
  EDITS_PER_AUTOMATIC_CHECKPOINT,
  createCaptureTriggers,
} from './capture-triggers'

const entry = (kind: HistorySnapshot['kind'], label?: string, at = 'now'): HistorySnapshot => ({
  id: crypto.randomUUID(), at, kind, ...(label === undefined ? {} : { label }), snapshot: '', elementCount: 0,
})

describe('checkpoint capture triggers', () => {
  afterEach(() => vi.useRealTimers())

  it('captures exactly on every fiftieth committed edit and ignores tagged replays', () => {
    const doc = new Y.Doc({ gc: false })
    const capture = vi.fn(entry)
    const triggers = createCaptureTriggers({
      ydoc: doc, capture, ignoredOrigins: new Set([RECOVERY_ORIGIN, HISTORY_RESTORE_ORIGIN]),
    })
    const elements = doc.getArray('elements')

    for (let index = 0; index < EDITS_PER_AUTOMATIC_CHECKPOINT - 1; index += 1) elements.push([index])
    expect(capture).not.toHaveBeenCalled()
    elements.push([49])
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenLastCalledWith('auto', undefined, expect.any(String))

    doc.transact(() => elements.push(['recovery']), RECOVERY_ORIGIN)
    doc.transact(() => elements.push(['restore']), HISTORY_RESTORE_ORIGIN)
    expect(capture).toHaveBeenCalledTimes(1)
    triggers.dispose()
  })

  it('does not treat an IndexedDB recovery replay as a user edit', () => {
    const doc = new Y.Doc({ gc: false })
    const capture = vi.fn(entry)
    const triggers = createCaptureTriggers({ ydoc: doc, capture })

    for (let index = 0; index < EDITS_PER_AUTOMATIC_CHECKPOINT; index += 1) {
      doc.transact(() => doc.getArray('elements').push([index]), Object.create(IndexeddbPersistence.prototype))
    }

    expect(capture).not.toHaveBeenCalled()
    triggers.dispose()
  })

  it('only captures on the five-minute tick after an edit', () => {
    vi.useFakeTimers()
    const doc = new Y.Doc({ gc: false })
    const capture = vi.fn(entry)
    const triggers = createCaptureTriggers({ ydoc: doc, capture })

    vi.advanceTimersByTime(AUTOMATIC_CHECKPOINT_INTERVAL_MS)
    expect(capture).not.toHaveBeenCalled()
    doc.getArray('elements').push([{ id: 'edit' }])
    vi.advanceTimersByTime(AUTOMATIC_CHECKPOINT_INTERVAL_MS)
    expect(capture).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(AUTOMATIC_CHECKPOINT_INTERVAL_MS)
    expect(capture).toHaveBeenCalledTimes(1)
    triggers.dispose()
  })

  it('records named, save, and pre-restore captures without updating Yjs', () => {
    const doc = new Y.Doc({ gc: false })
    const capture = vi.fn(entry)
    const updates = vi.fn()
    doc.on('update', updates)
    const triggers = createCaptureTriggers({ ydoc: doc, capture })

    triggers.captureNow('named', 'Кавычки " \\ и\nстрока', 'named-at')
    triggers.captureNow('auto', undefined, 'save-at')
    triggers.captureBeforeRestore()

    expect(capture).toHaveBeenNthCalledWith(1, 'named', 'Кавычки " \\ и\nстрока', 'named-at')
    expect(capture).toHaveBeenNthCalledWith(2, 'auto', undefined, 'save-at')
    expect(capture).toHaveBeenNthCalledWith(3, 'auto', undefined, expect.any(String))
    expect(updates).not.toHaveBeenCalled()
    triggers.dispose()
  })
})
