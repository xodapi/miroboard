import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { attachRecoveryCache, docKey, DOC_KEY_PREFIX } from './indexeddb'
import { createDirtyTracker } from './dirty'

afterEach(async () => {
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(docKey('test-doc'))
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
})

describe('IndexedDB recovery cache', () => {
  it('uses the document identity prefix', () => {
    expect(DOC_KEY_PREFIX).toBe('mboard-doc-')
    expect(docKey('abc')).toBe('mboard-doc-abc')
  })

  it('waits for sync and restores updates under the document key', async () => {
    const first = new Y.Doc()
    const attached = await attachRecoveryCache('test-doc', first)
    expect(attached.synced).toBe(true)
    expect(attached.persistence).not.toBeNull()
    first.getArray('elements').push([{ id: 'persisted' }])
    await new Promise((resolve) => setTimeout(resolve, 20))
    attached.persistence?.destroy()

    const second = new Y.Doc()
    const restored = await attachRecoveryCache('test-doc', second)
    expect(restored.synced).toBe(true)
    expect(second.getArray('elements').toJSON()).toEqual([{ id: 'persisted' }])
    restored.persistence?.destroy()
    first.destroy()
    second.destroy()
  })

  it('allows dirty tracking to start clean after IndexedDB replay', async () => {
    const first = new Y.Doc()
    const attached = await attachRecoveryCache('test-doc', first)
    first.getArray('elements').push([{ id: 'persisted' }])
    await new Promise((resolve) => setTimeout(resolve, 20))
    attached.persistence?.destroy()

    const second = new Y.Doc()
    const onChange = vi.fn()
    const tracker = createDirtyTracker(second, onChange)
    const restored = await attachRecoveryCache('test-doc', second)

    expect(second.getArray('elements').toJSON()).toEqual([{ id: 'persisted' }])
    expect(tracker.isDirty()).toBe(false)
    expect(onChange).not.toHaveBeenCalled()

    second.getArray('elements').push([{ id: 'user-edit' }])
    expect(tracker.isDirty()).toBe(true)
    expect(onChange).toHaveBeenCalledWith(true)
    tracker.dispose()
    restored.persistence?.destroy()
    second.destroy()
    first.destroy()
  })

  it('returns a non-fatal memory-only result when persistence fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const original = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    const result = await attachRecoveryCache('test-doc', new Y.Doc())
    expect(result).toEqual({ persistence: null, synced: false })
    expect(warn).toHaveBeenCalledTimes(1)
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: original })
    warn.mockRestore()
  })

})
