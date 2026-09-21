/**
 * The document write layer.
 *
 * These replace src/collab/bulk-operations.test.ts, which asserted the same
 * invariants against copies of the App.tsx logic pasted into the test file and
 * labelled "mirrors". Those copies could not fail when the real code changed.
 */
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { LOCAL_EDIT, LOCAL_GESTURE } from '../collab/origins'
import {
  addElement, bringToFront, deleteElement, deleteElements, duplicateElements,
  moveElements, updateElement, updateElements, type Elements,
} from './commands'
import type { BoardElement } from './types'

const element = (id: string, over: Partial<BoardElement> = {}): BoardElement => ({
  id, type: 'rect', x: 0, y: 0, w: 50, h: 50, color: '#000', stroke: 2, fill: 'none', ...over,
} as BoardElement)

function board(initial: BoardElement[] = []) {
  const doc = new Y.Doc({ gc: false })
  const elements = doc.getArray<BoardElement>('elements') as Elements
  if (initial.length) doc.transact(() => elements.push(initial), LOCAL_EDIT)
  return { doc, elements }
}

/** Counts document updates, i.e. how many transactions actually committed. */
function countUpdates(doc: Y.Doc) {
  const counter = { value: 0 }
  doc.on('update', () => { counter.value += 1 })
  return counter
}

const ids = (elements: Elements) => elements.toArray().map(e => e.id)

describe('addElement', () => {
  it('appends and labels the write', () => {
    const { doc, elements } = board()
    const seen: unknown[] = []
    doc.on('afterTransaction', tr => seen.push(tr.origin))

    addElement(doc, elements, element('a'))
    expect(ids(elements)).toEqual(['a'])
    expect(seen).toEqual([LOCAL_EDIT])
  })

  it('accepts a caller-supplied origin', () => {
    // Gesture writes are labelled separately so the UndoManager can coalesce
    // them into one step.
    const { doc, elements } = board()
    const seen: unknown[] = []
    doc.on('afterTransaction', tr => seen.push(tr.origin))

    addElement(doc, elements, element('a'), LOCAL_GESTURE)
    expect(seen).toEqual([LOCAL_GESTURE])
  })
})

describe('updateElement', () => {
  it('reports whether anything changed', () => {
    const { doc, elements } = board([element('a', { x: 10 })])
    expect(updateElement(doc, elements, 'a', { x: 20 })).toBe(true)
    expect(updateElement(doc, elements, 'a', { x: 20 })).toBe(false)
    expect(updateElement(doc, elements, 'missing', { x: 20 })).toBe(false)
  })

  it('opens no transaction for a no-op', () => {
    // A redundant write still marks the document dirty and costs an undo step.
    const { doc, elements } = board([element('a', { x: 10 })])
    const updates = countUpdates(doc)
    updateElement(doc, elements, 'a', { x: 10 })
    expect(updates.value).toBe(0)
  })
})

describe('deleteElement', () => {
  it('removes by id and reports success', () => {
    const { doc, elements } = board([element('a'), element('b')])
    expect(deleteElement(doc, elements, 'a')).toBe(true)
    expect(ids(elements)).toEqual(['b'])
  })

  it('does nothing for an unknown id', () => {
    const { doc, elements } = board([element('a')])
    const updates = countUpdates(doc)
    expect(deleteElement(doc, elements, 'missing')).toBe(false)
    expect(updates.value).toBe(0)
  })
})

describe('deleteElements', () => {
  it('deletes a selection in one transaction', () => {
    const { doc, elements } = board([element('a'), element('b'), element('c')])
    const updates = countUpdates(doc)

    expect(deleteElements(doc, elements, ['a', 'c'])).toBe(2)
    expect(updates.value).toBe(1)
    expect(ids(elements)).toEqual(['b'])
  })

  it('deletes regardless of the order the ids arrive in', () => {
    // It walks the array backwards; a forward loop would shift indices out from
    // under itself and skip elements.
    const { doc, elements } = board([element('a'), element('b'), element('c'), element('d')])
    deleteElements(doc, elements, ['d', 'a', 'c'])
    expect(ids(elements)).toEqual(['b'])
  })

  it('deletes every element when the whole board is selected', () => {
    const { doc, elements } = board([element('a'), element('b'), element('c')])
    expect(deleteElements(doc, elements, ['a', 'b', 'c'])).toBe(3)
    expect(elements.length).toBe(0)
  })

  it('is one undo step, not one per element', () => {
    const { doc, elements } = board([element('a'), element('b')])
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: new Set<unknown>([LOCAL_EDIT]) })

    deleteElements(doc, elements, ['a', 'b'])
    undo.undo()

    expect(ids(elements)).toEqual(['a', 'b'])
    expect(undo.undoStack.length).toBe(0)
  })

  it('opens no transaction when nothing matches', () => {
    const { doc, elements } = board([element('a')])
    const updates = countUpdates(doc)
    expect(deleteElements(doc, elements, ['missing'])).toBe(0)
    expect(deleteElements(doc, elements, [])).toBe(0)
    expect(updates.value).toBe(0)
  })
})

describe('updateElements', () => {
  it('recolours a selection in one transaction', () => {
    const { doc, elements } = board([element('a'), element('b'), element('c')])
    const updates = countUpdates(doc)

    expect(updateElements(doc, elements, ['a', 'c'], { color: '#f00' })).toBe(2)
    expect(updates.value).toBe(1)
    expect(elements.toArray().map(e => e.color)).toEqual(['#f00', '#000', '#f00'])
  })

  it('counts only the elements that actually changed', () => {
    const { doc, elements } = board([element('a', { color: '#f00' }), element('b')])
    expect(updateElements(doc, elements, ['a', 'b'], { color: '#f00' })).toBe(1)
  })

  it('tolerates duplicate ids in the selection', () => {
    const { doc, elements } = board([element('a', { x: 0 })])
    expect(updateElements(doc, elements, ['a', 'a'], { x: 5 })).toBe(1)
    expect(elements.get(0).x).toBe(5)
  })
})

describe('moveElements', () => {
  it('nudges a selection in one transaction', () => {
    const { doc, elements } = board([element('a', { x: 0, y: 0 }), element('b', { x: 100, y: 100 })])
    const updates = countUpdates(doc)

    expect(moveElements(doc, elements, ['a', 'b'], { x: 5, y: -5 })).toBe(2)
    expect(updates.value).toBe(1)
    expect(elements.toArray().map(e => [e.x, e.y])).toEqual([[5, -5], [105, 95]])
  })

  it('accumulates across repeated nudges instead of compounding a stale base', () => {
    // A held arrow key fires many times; reading positions from the document
    // each time is what keeps the result linear.
    const { doc, elements } = board([element('a', { x: 0, y: 0 })])
    for (let i = 0; i < 4; i += 1) moveElements(doc, elements, ['a'], { x: 10, y: 0 })
    expect(elements.get(0).x).toBe(40)
  })

  it('ignores a zero delta', () => {
    const { doc, elements } = board([element('a')])
    const updates = countUpdates(doc)
    expect(moveElements(doc, elements, ['a'], { x: 0, y: 0 })).toBe(0)
    expect(updates.value).toBe(0)
  })
})

describe('duplicateElements', () => {
  it('copies a selection in one transaction with growing offsets', () => {
    const { doc, elements } = board([element('a', { x: 0, y: 0 }), element('b', { x: 100, y: 100 })])
    const updates = countUpdates(doc)
    let counter = 0
    const created = duplicateElements(doc, elements, ['a', 'b'], () => `copy-${counter++}`)

    expect(updates.value).toBe(1)
    expect(created).toEqual(['copy-0', 'copy-1'])
    expect(elements.toArray().map(e => [e.id, e.x, e.y])).toEqual([
      ['a', 0, 0], ['b', 100, 100], ['copy-0', 20, 20], ['copy-1', 140, 140],
    ])
  })

  it('does not stack copies of overlapping elements', () => {
    // Two elements at the same spot with a fixed offset would land their copies
    // on top of each other, looking like one duplicate went missing.
    const { doc, elements } = board([element('a', { x: 0, y: 0 }), element('b', { x: 0, y: 0 })])
    let counter = 0
    duplicateElements(doc, elements, ['a', 'b'], () => `copy-${counter++}`)
    const copies = elements.toArray().filter(e => e.id.startsWith('copy'))
    expect(copies[0].x).not.toBe(copies[1].x)
  })

  it('carries every field of the source across', () => {
    const { doc, elements } = board([element('a', { text: 'привет', color: '#0f0', bpmnNodeType: 'task' })])
    duplicateElements(doc, elements, ['a'], () => 'copy')
    const copy = elements.toArray().find(e => e.id === 'copy')!
    expect(copy).toMatchObject({ text: 'привет', color: '#0f0', bpmnNodeType: 'task' })
  })

  it('credits the copy to whoever duplicated it', () => {
    // Duplicating is creating, and the profile panel promises the local id
    // signs what you create. Pasting already re-stamps the same way, so
    // Ctrl+D and Ctrl+C/Ctrl+V agree about authorship.
    const { doc, elements } = board([element('a', { createdBy: 'colleague' })])
    duplicateElements(doc, elements, ['a'], () => 'copy', undefined, 'me')
    expect(elements.toArray().find(e => e.id === 'copy')!.createdBy).toBe('me')
    expect(elements.toArray().find(e => e.id === 'a')!.createdBy).toBe('colleague')
  })

  it('keeps the original author when no one is named', () => {
    const { doc, elements } = board([element('a', { createdBy: 'colleague' })])
    duplicateElements(doc, elements, ['a'], () => 'copy')
    expect(elements.toArray().find(e => e.id === 'copy')!.createdBy).toBe('colleague')
  })

  it('returns nothing and writes nothing for an empty selection', () => {
    const { doc, elements } = board([element('a')])
    const updates = countUpdates(doc)
    expect(duplicateElements(doc, elements, [], () => 'x')).toEqual([])
    expect(updates.value).toBe(0)
  })
})

describe('bringToFront', () => {
  it('moves the element to the end of the paint order', () => {
    const { doc, elements } = board([element('a'), element('b'), element('c')])
    expect(bringToFront(doc, elements, 'a')).toBe(true)
    expect(ids(elements)).toEqual(['b', 'c', 'a'])
  })

  it('does nothing when the element is already on top', () => {
    // Raising the topmost element would still dirty the document and cost an
    // undo step for a change nobody can see.
    const { doc, elements } = board([element('a'), element('b')])
    const updates = countUpdates(doc)
    expect(bringToFront(doc, elements, 'b')).toBe(false)
    expect(updates.value).toBe(0)
  })

  it('stamps a zIndex for consumers that sort rather than use array order', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T00:00:00Z'))
    const { doc, elements } = board([element('a'), element('b')])
    bringToFront(doc, elements, 'a')
    expect(elements.toArray().at(-1)!.zIndex).toBe(Date.parse('2026-09-21T00:00:00Z'))
    vi.useRealTimers()
  })
})
