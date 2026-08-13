import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  createDirtyTracker,
  addBeforeUnloadGuard,
  HISTORY_RESTORE_ORIGIN,
  RECOVERY_ORIGIN,
} from './dirty'

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

  it.each([
    ['recovery replay', RECOVERY_ORIGIN],
    ['history restore', HISTORY_RESTORE_ORIGIN],
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
