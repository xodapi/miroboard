import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import {
  createDirtyTracker,
  addBeforeUnloadGuard,
  HISTORY_RESTORE_ORIGIN,
  RECOVERY_ORIGIN,
} from './dirty'
import { LOAD, LOCAL_EDIT, NON_EDIT_ORIGINS } from '../collab/origins'

describe('createDirtyTracker', () => {
  it('marks the document dirty on its first ordinary Yjs update', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange)

    doc.getArray('elements').push(['first edit'])
    doc.getArray('elements').push(['second edit'])

    expect(tracker.isDirty()).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('clears dirtiness after a successful save and tracks the next edit', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange)
    const elements = doc.getArray('elements')

    elements.push(['edit'])
    tracker.markSaved()
    elements.push(['next edit'])

    expect(tracker.isDirty()).toBe(true)
    expect(onChange.mock.calls).toEqual([[true], [false], [true]])
  })

  it('can explicitly mark a tagged history restore as dirty', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange)

    doc.transact(() => doc.getArray('elements').push(['restored']), HISTORY_RESTORE_ORIGIN)
    tracker.markDirty()

    expect(tracker.isDirty()).toBe(true)
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)
  })

  it.each([
    ['recovery replay', RECOVERY_ORIGIN],
    ['history restore', HISTORY_RESTORE_ORIGIN],
    ['IndexedDB replay', Object.create(IndexeddbPersistence.prototype)],
  ])('does not mark dirty for %s', (_label, origin) => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange)

    doc.transact(() => doc.getArray('elements').push(['replayed']), origin)

    expect(tracker.isDirty()).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops observing updates after disposal', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange)

    tracker.dispose()
    doc.getArray('elements').push(['ignored'])

    expect(tracker.isDirty()).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  // Regression: opening a document is labelled LOAD, and the tracker's default
  // ignore set predates src/collab/origins.ts, so it did not know about LOAD.
  // Four cross-* e2e suites then saw a freshly opened board report
  // "Не сохранено". App passes NON_EDIT_ORIGINS to keep the two in step.
  it('does not dirty the document for any origin in NON_EDIT_ORIGINS', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange, NON_EDIT_ORIGINS)
    const elements = doc.getArray('elements')

    for (const origin of NON_EDIT_ORIGINS) {
      doc.transact(() => elements.push([`loaded via ${String(origin)}`]), origin)
    }

    expect(tracker.isDirty()).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  // Every write in the app now carries an origin, so an unlabelled one means a
  // code path forgot to say what it was doing. Losing the user's work is the
  // expensive failure; a spurious "Не сохранено" is the cheap one.
  it('treats an unlabelled write as an edit rather than silently ignoring it', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange, NON_EDIT_ORIGINS)

    doc.getArray('elements').push(['written with no transaction origin'])

    expect(tracker.isDirty()).toBe(true)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('still dirties the document for a local edit when an ignore set is supplied', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange, NON_EDIT_ORIGINS)

    doc.transact(() => doc.getArray('elements').push(['edit']), LOAD)
    expect(tracker.isDirty()).toBe(false)

    doc.transact(() => doc.getArray('elements').push(['edit']), LOCAL_EDIT)
    expect(tracker.isDirty()).toBe(true)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('keeps its historical default when no ignore set is supplied', () => {
    const doc = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(doc, onChange)

    doc.transact(() => doc.getArray('elements').push(['opened']), LOAD)
    expect(tracker.isDirty()).toBe(true)

    tracker.markSaved()
    doc.transact(() => doc.getArray('elements').push(['replayed']), RECOVERY_ORIGIN)
    expect(tracker.isDirty()).toBe(false)
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('guards beforeunload only while dirty', () => {
    const clean = addBeforeUnloadGuard(false)
    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    const dirty = addBeforeUnloadGuard(true)
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    clean()
    dirty()
  })
})
