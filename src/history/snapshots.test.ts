import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  HISTORY_RESTORE_ORIGIN,
  captureSnapshot,
  fromBase64,
  readSnapshot,
  restoreSnapshot,
  toBase64,
} from './snapshots'

describe('history snapshots', () => {
  it('round-trips snapshot bytes through base64 and JSON', () => {
    const doc = new Y.Doc({ gc: false })
    doc.getArray('elements').push([{ id: 'first' }])

    const encoded = Y.encodeSnapshot(Y.snapshot(doc))
    const parsed = JSON.parse(JSON.stringify({ snapshot: toBase64(encoded) })) as { snapshot: string }

    expect(fromBase64(parsed.snapshot)).toEqual(encoded)
  })

  it('reads a historical state without changing the live document', () => {
    const doc = new Y.Doc({ gc: false })
    const elements = doc.getArray<{ id: string }>('elements')
    elements.push([{ id: 'before' }])
    const snapshot = captureSnapshot(doc, 'named', 'Before change')
    elements.push([{ id: 'after' }])

    expect(readSnapshot(doc, snapshot)).toEqual([{ id: 'before' }])
    expect(elements.toArray()).toEqual([{ id: 'before' }, { id: 'after' }])
  })

  it('proves the 200-edit snapshot pipeline and restore-as-append semantics', () => {
    const doc = new Y.Doc({ gc: false })
    const elements = doc.getArray<{ id: string }>('elements')
    let edits = 0

    for (let index = 0; index < 100; index += 1) {
      elements.push([{ id: `edit-${index}` }])
      edits += 1
    }
    const checkpoint = captureSnapshot(doc, 'auto')
    for (let index = 100; index < 199; index += 1) {
      elements.push([{ id: `edit-${index}` }])
      edits += 1
    }

    const origins: unknown[] = []
    doc.on('afterTransaction', transaction => origins.push(transaction.origin))
    restoreSnapshot(doc, checkpoint)

    expect(edits + 1).toBe(200)
    expect(origins.at(-1)).toBe(HISTORY_RESTORE_ORIGIN)
    expect(elements.toArray()).toEqual(
      Array.from({ length: 100 }, (_, index) => ({ id: `edit-${index}` })),
    )
    expect(readSnapshot(doc, checkpoint)).toHaveLength(100)
  })

  it('restores content only as one undoable transaction without duplicating ids', () => {
    const doc = new Y.Doc({ gc: false })
    const elements = doc.getArray<{ id: string; text: string }>('elements')
    const meta = doc.getMap('meta')
    const profileConfig = doc.getMap('profileConfig')
    const undo = new Y.UndoManager(elements, {
      captureTimeout: 500,
      trackedOrigins: new Set([null, HISTORY_RESTORE_ORIGIN]),
    })

    elements.push([{ id: 'deleted', text: 'original' }, { id: 'kept', text: 'kept' }])
    const origin = captureSnapshot(doc, 'auto')
    elements.delete(0, elements.length)
    elements.push([{ id: 'current', text: 'current' }])
    meta.set('title', 'Current title')
    profileConfig.set('bpmn', { simulation: { seed: '99' } })

    undo.stopCapturing()
    restoreSnapshot(doc, origin)

    expect(elements.toArray()).toEqual([{ id: 'deleted', text: 'original' }, { id: 'kept', text: 'kept' }])
    expect(new Set(elements.toArray().map(element => element.id)).size).toBe(elements.length)
    expect(meta.toJSON()).toEqual({ title: 'Current title' })
    expect(profileConfig.toJSON()).toEqual({ bpmn: { simulation: { seed: '99' } } })

    undo.undo()
    expect(elements.toArray()).toEqual([{ id: 'current', text: 'current' }])
    undo.redo()
    expect(elements.toArray()).toEqual([{ id: 'deleted', text: 'original' }, { id: 'kept', text: 'kept' }])
  })
})
