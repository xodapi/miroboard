import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { HISTORY_RESTORE_ORIGIN } from '../history/snapshots'
import { RECOVERY_ORIGIN } from '../persistence/dirty'
import { commitElementUpdate } from '../persistence/updates'
import {
  LOAD, LOCAL_CLIPBOARD, LOCAL_EDIT, LOCAL_GESTURE, LOCAL_ORIGINS, LOCAL_TEMPLATE, NON_EDIT_ORIGINS,
} from './origins'

type El = { id: string; x: number }

/** Mirrors the UndoManager configuration used by the app. */
function makeUndoTrackedOrigins(): Set<unknown> {
  return new Set<unknown>([...LOCAL_ORIGINS, HISTORY_RESTORE_ORIGIN])
}

describe('transaction origins', () => {
  it('keeps local intent and non-edit origins disjoint', () => {
    for (const origin of LOCAL_ORIGINS) expect(NON_EDIT_ORIGINS.has(origin)).toBe(false)
    expect(LOCAL_ORIGINS.size).toBe(4)
    expect([...LOCAL_ORIGINS]).toEqual(expect.arrayContaining([LOCAL_EDIT, LOCAL_GESTURE, LOCAL_CLIPBOARD, LOCAL_TEMPLATE]))
  })

  it('treats loads and restores as non-edits', () => {
    expect(NON_EDIT_ORIGINS.has(LOAD)).toBe(true)
    expect(NON_EDIT_ORIGINS.has(RECOVERY_ORIGIN)).toBe(true)
    expect(NON_EDIT_ORIGINS.has(HISTORY_RESTORE_ORIGIN)).toBe(true)
    expect(NON_EDIT_ORIGINS.has(LOCAL_EDIT)).toBe(false)
  })

  it('makes every local origin undoable and remote/unknown origins not', () => {
    const tracked = makeUndoTrackedOrigins()
    for (const origin of LOCAL_ORIGINS) expect(tracked.has(origin)).toBe(true)
    expect(tracked.has(HISTORY_RESTORE_ORIGIN)).toBe(true)
    // A collaboration provider uses its own instance as origin: never undoable
    // by the local user, which is the whole point of the allow-list.
    expect(tracked.has(null)).toBe(false)
    expect(tracked.has({ provider: true })).toBe(false)
    expect(tracked.has(LOAD)).toBe(false)
    expect(tracked.has(RECOVERY_ORIGIN)).toBe(false)
  })

  it('propagates the origin through commitElementUpdate to observers', () => {
    const doc = new Y.Doc({ gc: false })
    const elements = doc.getArray<El>('elements')
    doc.transact(() => elements.push([{ id: 'n1', x: 0 }]), RECOVERY_ORIGIN)
    const seen: unknown[] = []
    doc.on('update', (_update: Uint8Array, origin: unknown) => seen.push(origin))

    commitElementUpdate(doc, elements, 'n1', { x: 10 }, LOCAL_GESTURE)
    commitElementUpdate(doc, elements, 'n1', { x: 20 })

    // Yjs normalises an absent origin to `null`, which is exactly the value
    // the old allow-list tracked and the reason unlabelled writes are
    // indistinguishable from each other.
    expect(seen).toEqual([LOCAL_GESTURE, null])
    expect(makeUndoTrackedOrigins().has(seen[0])).toBe(true)
    expect(makeUndoTrackedOrigins().has(seen[1])).toBe(false)
  })

  it('undoes a gesture commit but not an unlabelled write', () => {
    const doc = new Y.Doc({ gc: false })
    const elements = doc.getArray<El>('elements')
    doc.transact(() => elements.push([{ id: 'n1', x: 0 }]), RECOVERY_ORIGIN)
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: makeUndoTrackedOrigins() })

    commitElementUpdate(doc, elements, 'n1', { x: 100 }, LOCAL_GESTURE)
    expect(elements.get(0).x).toBe(100)
    undo.undo()
    expect(elements.get(0).x).toBe(0)

    commitElementUpdate(doc, elements, 'n1', { x: 55 })
    expect(undo.undoStack.length).toBe(0)
    undo.undo()
    expect(elements.get(0).x).toBe(55)
  })
})
