/**
 * Bulk document operations.
 *
 * Multi-select only pays off if the operations it enables are single
 * transactions: one undo step, one automatic-checkpoint increment, one update
 * to broadcast to peers. These tests pin that invariant, because the naive
 * implementation (a loop of `deleteElement` calls) silently breaks it.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { LOCAL_EDIT } from './origins'
import { idsOf, selectMany } from './selection'

type El = { id: string; x: number; y: number }

function board(initial: El[]) {
  const doc = new Y.Doc({ gc: false })
  const elements = doc.getArray<El>('elements')
  doc.transact(() => elements.push(initial), LOCAL_EDIT)
  return { doc, elements }
}

/** Mirrors `deleteSelected` in App.tsx. */
function deleteMany(doc: Y.Doc, elements: Y.Array<El>, ids: Iterable<string>): void {
  const wanted = new Set(ids)
  doc.transact(() => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      if (wanted.has(elements.get(index).id)) elements.delete(index, 1)
    }
  }, LOCAL_EDIT)
}

/** Mirrors `duplicateSelection` in App.tsx. */
function duplicateMany(doc: Y.Doc, elements: Y.Array<El>, picked: El[], idAt: (index: number) => string): string[] {
  const created: string[] = []
  doc.transact(() => {
    picked.forEach((element, index) => {
      const offset = 20 * (index + 1)
      const id = idAt(index)
      created.push(id)
      elements.push([{ ...element, id, x: element.x + offset, y: element.y + offset }])
    })
  }, LOCAL_EDIT)
  return created
}

describe('bulk document operations', () => {
  it('deletes a selection in one transaction, so undo is one step', () => {
    const { doc, elements } = board([
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 20, y: 0 },
    ])
    let updates = 0
    doc.on('update', () => { updates += 1 })

    deleteMany(doc, elements, idsOf(selectMany(['a', 'c'])))

    expect(updates).toBe(1)
    expect(elements.toArray().map(element => element.id)).toEqual(['b'])
  })

  it('deletes every selected element regardless of array order', () => {
    const { doc, elements } = board([
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 20, y: 0 }, { id: 'd', x: 30, y: 0 },
    ])
    deleteMany(doc, elements, ['d', 'a', 'c'])
    expect(elements.toArray().map(element => element.id)).toEqual(['b'])
  })

  it('is undoable as a single step', () => {
    const { doc, elements } = board([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }])
    const undo = new Y.UndoManager(elements, {
      captureTimeout: 0,
      trackedOrigins: new Set<unknown>([LOCAL_EDIT]),
    })
    deleteMany(doc, elements, ['a', 'b'])
    expect(elements.length).toBe(0)

    undo.undo()
    expect(elements.toArray().map(element => element.id)).toEqual(['a', 'b'])
    expect(undo.undoStack.length).toBe(0) // one step, not two
  })

  it('ignores ids that are not on the board', () => {
    const { doc, elements } = board([{ id: 'a', x: 0, y: 0 }])
    let updates = 0
    doc.on('update', () => { updates += 1 })
    deleteMany(doc, elements, ['missing'])
    expect(updates).toBe(0)
    expect(elements.length).toBe(1)
  })

  it('duplicates a selection in one transaction with non-stacking offsets', () => {
    const { doc, elements } = board([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 100 }])
    let updates = 0
    doc.on('update', () => { updates += 1 })

    const picked = elements.toArray().filter(element => element.id === 'a' || element.id === 'b')
    const created = duplicateMany(doc, elements, picked, index => `copy-${index}`)

    expect(updates).toBe(1)
    expect(created).toEqual(['copy-0', 'copy-1'])
    expect(elements.toArray()).toEqual([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 100 },
      { id: 'copy-0', x: 20, y: 20 },
      { id: 'copy-1', x: 140, y: 140 },
    ])
  })

  it('produces unique ids so a paste never collides with the source', () => {
    const { doc, elements } = board([{ id: 'a', x: 0, y: 0 }])
    duplicateMany(doc, elements, elements.toArray(), () => 'a-copy')
    const ids = elements.toArray().map(element => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
