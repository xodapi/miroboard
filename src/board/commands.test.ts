/**
 * The document write layer.
 *
 * These replace src/collab/bulk-operations.test.ts, which asserted the same
 * invariants against copies of the App.tsx logic pasted into the test file and
 * labelled "mirrors". Those copies could not fail when the real code changed.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { LOCAL_EDIT, LOCAL_GESTURE } from '../collab/origins'
import {
  addElement, alignElements, bringToFront, deleteElement, deleteElements, duplicateElements,
  moveElements, restackElements, setLocked, setStrokeStyle, updateElement, updateElements, writeGroupMembership, type Elements,
} from './commands'
import { planGroup, planUngroup } from './group'
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

  it('deletes a group and every connector that touched it, as one undo step', () => {
    const flow = (id: string, sourceId: string, targetId: string): BoardElement => ({
      id, type: 'arrow', x: 0, y: 0, color: '#000', bpmnFlow: { sourceId, targetId },
    })
    const { doc, elements } = board([
      element('a', { groupId: 'g' }),
      element('b', { groupId: 'g' }),
      element('c'),
      flow('ab', 'a', 'b'),
      flow('ac', 'a', 'c'),
    ])
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: new Set<unknown>([LOCAL_EDIT]) })
    const updates = countUpdates(doc)

    expect(deleteElement(doc, elements, 'a')).toBe(true)
    expect(updates.value).toBe(1)
    expect(ids(elements)).toEqual(['c'])

    undo.undo()
    expect(ids(elements)).toEqual(['a', 'b', 'c', 'ab', 'ac'])
    expect(elements.get(0).groupId).toBe('g')
    expect(elements.get(1).groupId).toBe('g')
    expect(elements.get(1)).not.toHaveProperty('groupId', undefined)
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

  it('translates bends with the arrow and leaves them when only the shape moves', () => {
    const { doc, elements } = board([
      element('s', { x: 0, y: 0, w: 100, h: 40 }),
      element('a', {
        type: 'arrow', x: 200, y: 20, w: 80, h: 0,
        waypoints: [{ x: 240, y: 80 }],
        link: { sourceId: 's' },
      }),
    ])
    moveElements(doc, elements, ['s'], { x: 30, y: 10 })
    expect(elements.get(1)).toMatchObject({ x: 200, y: 20, waypoints: [{ x: 240, y: 80 }], link: { sourceId: 's' } })

    moveElements(doc, elements, ['a'], { x: 15, y: 0 })
    const moved = elements.get(1)
    expect(moved.waypoints).toEqual([{ x: 255, y: 80 }])
    expect(moved).not.toHaveProperty('link')
    expect(moved.x).not.toBe(200)
  })

  it('carries a caption with the arrow and does not treat the shift as a world point', () => {
    const { doc, elements } = board([
      element('a', { type: 'arrow', x: 10, y: 20, w: 40, h: 0, text: 'да', labelOffset: { x: 0, y: -12 } }),
    ])
    moveElements(doc, elements, ['a'], { x: 5, y: 3 })
    expect(elements.get(0)).toMatchObject({ x: 15, y: 23, text: 'да', labelOffset: { x: 0, y: -12 } })
  })

  it('leaves a locked element where it is, and opens no transaction when nothing else moves', () => {
    const { doc, elements } = board([
      element('a', { locked: true, x: 0, y: 0 }),
      element('b', { x: 10, y: 0 }),
    ])
    const updates = countUpdates(doc)
    expect(moveElements(doc, elements, ['a'], { x: 5, y: 1 })).toBe(0)
    expect(updates.value).toBe(0)
    expect(elements.get(0)).toMatchObject({ x: 0, y: 0, locked: true })

    expect(moveElements(doc, elements, ['a', 'b'], { x: 5, y: 1 })).toBe(1)
    expect(updates.value).toBe(1)
    expect(elements.toArray().map(item => [item.x, item.y])).toEqual([[0, 0], [15, 1]])
  })
})

describe('alignElements', () => {
  it('writes a different delta per element, as one undo step', () => {
    const { doc, elements } = board([
      element('a', { x: 0, y: 0, w: 20, h: 10 }),
      element('b', { x: 80, y: 40, w: 20, h: 10 }),
    ])
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: new Set<unknown>([LOCAL_EDIT]) })
    const updates = countUpdates(doc)
    const seen: unknown[] = []
    doc.on('afterTransaction', tr => seen.push(tr.origin))

    expect(alignElements(doc, elements, ['a', 'b'], 'left')).toBe(1)
    expect(updates.value).toBe(1)
    expect(seen).toEqual([LOCAL_EDIT])
    expect(elements.toArray().map(item => [item.x, item.y])).toEqual([[0, 0], [0, 40]])

    undo.undo()
    expect(elements.toArray().map(item => item.x)).toEqual([0, 80])
  })

  it('opens no transaction when the selection is already aligned or too small', () => {
    const { doc, elements } = board([
      element('a', { x: 0, y: 0 }),
      element('b', { x: 0, y: 40 }),
    ])
    const updates = countUpdates(doc)
    expect(alignElements(doc, elements, ['a', 'b'], 'left')).toBe(0)
    expect(alignElements(doc, elements, ['a'], 'right')).toBe(0)
    expect(alignElements(doc, elements, [], 'top')).toBe(0)
    expect(updates.value).toBe(0)
  })

  it('shifts bends by the same delta as the mark', () => {
    const { doc, elements } = board([
      element('a', { x: 0, y: 0, w: 20, h: 10 }),
      element('b', { type: 'arrow', x: 80, y: 40, w: 10, h: 0, waypoints: [{ x: 90, y: 70 }] }),
    ])
    expect(alignElements(doc, elements, ['a', 'b'], 'left')).toBe(1)
    expect(elements.get(1)).toMatchObject({ x: 0, y: 40, waypoints: [{ x: 10, y: 70 }] })
  })

  it('does not move a locked unit or a connector', () => {
    const flow = element('f', { type: 'arrow', x: 9, y: 9, bpmnFlow: { sourceId: 'a', targetId: 'b' } })
    const { doc, elements } = board([
      element('a', { x: 0, y: 0, locked: true }),
      element('b', { x: 60, y: 0 }),
      flow,
    ])
    expect(alignElements(doc, elements, ['a', 'b', 'f'], 'left')).toBe(1)
    expect(elements.get(0)).toMatchObject({ x: 0, locked: true })
    expect(elements.get(1).x).toBe(0)
    expect(elements.get(2)).toMatchObject({ x: 9, y: 9 })
  })
})

describe('setLocked', () => {
  it('writes true and deletes the key on unlock', () => {
    const { doc, elements } = board([element('a'), element('b', { locked: true })])
    const updates = countUpdates(doc)
    expect(setLocked(doc, elements, ['a', 'b'], true)).toBe(1)
    expect(updates.value).toBe(1)
    expect(elements.get(0).locked).toBe(true)
    expect(elements.get(1).locked).toBe(true)

    expect(setLocked(doc, elements, ['a'], false)).toBe(1)
    expect(elements.get(0)).not.toHaveProperty('locked')
    expect(elements.get(1).locked).toBe(true)
  })

  it('does not lock a connector and opens no transaction when nothing changes', () => {
    const flow = { id: 'f', type: 'arrow' as const, x: 0, y: 0, color: '#000', bpmnFlow: { sourceId: 'a', targetId: 'b' } }
    const { doc, elements } = board([element('a', { locked: true }), flow])
    const updates = countUpdates(doc)
    expect(setLocked(doc, elements, ['a'], true)).toBe(0)
    expect(setLocked(doc, elements, ['f'], true)).toBe(0)
    expect(setLocked(doc, elements, [], true)).toBe(0)
    expect(updates.value).toBe(0)
    expect(elements.get(1)).not.toHaveProperty('locked')
  })

  it('copies the lock with the element', () => {
    const { doc, elements } = board([element('a', { locked: true })])
    duplicateElements(doc, elements, ['a'], () => 'copy')
    expect(elements.toArray().find(item => item.id === 'copy')!.locked).toBe(true)
  })
})

describe('setStrokeStyle', () => {
  it('writes a dash and a thicker stroke, then deletes the dash for solid', () => {
    const { doc, elements } = board([element('a', { type: 'arrow' }), element('b', { type: 'line', stroke: 4 })])
    const updates = countUpdates(doc)
    expect(setStrokeStyle(doc, elements, ['a', 'b'], { dash: 'dashed', stroke: 7 })).toBe(2)
    expect(updates.value).toBe(1)
    expect(elements.get(0)).toMatchObject({ dash: 'dashed', stroke: 7, type: 'arrow' })
    expect(elements.get(1)).toMatchObject({ dash: 'dashed', stroke: 7 })

    expect(setStrokeStyle(doc, elements, ['a'], { dash: 'solid' })).toBe(1)
    expect(elements.get(0)).not.toHaveProperty('dash')
    expect(elements.get(1).dash).toBe('dashed')
  })

  it('turns a connector head off without dropping the flow, and ignores a rectangle', () => {
    const flow = element('f', { type: 'arrow', bpmnFlow: { sourceId: 'a', targetId: 'b' } })
    const { doc, elements } = board([element('a', { type: 'rect' }), flow])
    const updates = countUpdates(doc)
    expect(setStrokeStyle(doc, elements, ['a'], { dash: 'dashed' })).toBe(0)
    expect(setStrokeStyle(doc, elements, ['f'], { arrowHead: 'none', dash: 'dashed' })).toBe(1)
    expect(updates.value).toBe(1)
    expect(elements.get(1).type).toBe('line')
    expect(elements.get(1).dash).toBe('dashed')
    expect(elements.get(1).bpmnFlow).toEqual({ sourceId: 'a', targetId: 'b' })
    expect(elements.get(0)).not.toHaveProperty('dash')
  })

  it('opens no transaction when the line already has that style', () => {
    const { doc, elements } = board([element('a', { type: 'arrow', stroke: 2 })])
    const updates = countUpdates(doc)
    expect(setStrokeStyle(doc, elements, ['a'], { arrowHead: 'triangle', dash: 'solid', stroke: 2 })).toBe(0)
    expect(setStrokeStyle(doc, elements, [], { dash: 'dashed' })).toBe(0)
    expect(updates.value).toBe(0)
  })
})

describe('duplicateElements', () => {
  it('copies a selection in one transaction without changing the gap', () => {
    const { doc, elements } = board([element('a', { x: 0, y: 0 }), element('b', { x: 100, y: 100 })])
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: new Set<unknown>([LOCAL_EDIT]) })
    const updates = countUpdates(doc)
    let counter = 0
    const created = duplicateElements(doc, elements, ['b', 'a'], () => `copy-${counter++}`)

    expect(updates.value).toBe(1)
    expect(created).toEqual(['copy-0', 'copy-1'])
    expect(elements.toArray().map(e => [e.id, e.x, e.y])).toEqual([
      ['a', 0, 0], ['b', 100, 100], ['copy-0', 20, 20], ['copy-1', 120, 120],
    ])

    undo.undo()
    expect(ids(elements)).toEqual(['a', 'b'])
  })

  it('keeps coincident copies coincident', () => {
    // A shared offset lands stacked sources on top of each other. Shearing
    // them apart used to look like a layout; the selection count is the signal.
    const { doc, elements } = board([element('a', { x: 0, y: 0 }), element('b', { x: 0, y: 0 })])
    let counter = 0
    const created = duplicateElements(doc, elements, ['a', 'b'], () => `copy-${counter++}`)
    expect(created).toEqual(['copy-0', 'copy-1'])
    const copies = elements.toArray().filter(e => e.id.startsWith('copy'))
    expect(copies.map(copy => [copy.x, copy.y])).toEqual([[20, 20], [20, 20]])
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

  it('gives a duplicated group a new token so the copies do not join the source', () => {
    const { doc, elements } = board([element('a', { groupId: 'g' }), element('b', { groupId: 'g' })])
    let counter = 0
    duplicateElements(doc, elements, ['a', 'b'], () => `copy-${counter++}`)
    const copies = elements.toArray().filter(item => item.id.startsWith('copy'))
    expect(copies.map(item => item.groupId)).toEqual(['copy-2', 'copy-2'])
    expect(elements.get(0).groupId).toBe('g')
    expect(elements.get(1).groupId).toBe('g')
  })

  it('copies an unnamed group mate and keeps the gap', () => {
    const { doc, elements } = board([
      element('a', { groupId: 'g', x: 0, y: 0 }),
      element('outsider', { x: 400, y: 400 }),
      element('b', { groupId: 'g', x: 80, y: 10 }),
    ])
    let counter = 0
    expect(duplicateElements(doc, elements, ['a'], () => `copy-${counter++}`)).toEqual(['copy-0', 'copy-1'])
    expect(elements.toArray().slice(3).map(item => [item.id, item.x, item.y, item.groupId])).toEqual([
      ['copy-0', 20, 20, 'copy-2'],
      ['copy-1', 100, 30, 'copy-2'],
    ])
    expect(elements.get(2).groupId).toBe('g')
  })

  it('remaps a connector onto the copies and drops one that would leave the set', () => {
    const flow = (id: string, sourceId: string, targetId: string): BoardElement => ({
      id, type: 'arrow', x: 4, y: 6, color: '#000', bpmnFlow: { sourceId, targetId, condition: 'ok' },
    })
    const { doc, elements } = board([
      element('a', { x: 0, y: 0 }),
      element('b', { x: 100, y: 40 }),
      flow('ab', 'a', 'b'),
      flow('ac', 'a', 'c'),
      element('c', { x: 200, y: 0 }),
    ])
    const updates = countUpdates(doc)
    let counter = 0

    expect(duplicateElements(doc, elements, ['a', 'b'], () => `copy-${counter++}`)).toEqual(['copy-0', 'copy-1', 'copy-2'])
    expect(updates.value).toBe(1)
    const copied = elements.toArray().find(item => item.id === 'copy-2')
    expect(copied).toMatchObject({ x: 24, y: 26, bpmnFlow: { sourceId: 'copy-0', targetId: 'copy-1', condition: 'ok' } })
    expect(elements.toArray().find(item => item.id === 'ab')!.bpmnFlow).toEqual({ sourceId: 'a', targetId: 'b', condition: 'ok' })
    expect(elements.toArray().some(item => item.bpmnFlow?.targetId === 'c' && item.id.startsWith('copy'))).toBe(false)

    expect(duplicateElements(doc, elements, ['ac'], () => 'stray')).toEqual([])
    expect(updates.value).toBe(1)
    expect(elements.toArray().some(item => item.id === 'stray')).toBe(false)
  })
})

describe('writeGroupMembership', () => {
  it('groups and dissolves leftovers in one undo step, deleting the key rather than setting it undefined', () => {
    const { doc, elements } = board([
      element('a'),
      element('b'),
      element('c', { groupId: 'old' }),
      element('d', { groupId: 'old' }),
    ])
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: new Set<unknown>([LOCAL_EDIT]) })
    const updates = countUpdates(doc)
    const plan = planGroup(elements.toArray(), ['a', 'c'], 'grp_new')
    expect(plan.kind).toBe('group')
    if (plan.kind !== 'group') return

    expect(writeGroupMembership(doc, elements, plan.writes)).toBe(3)
    expect(updates.value).toBe(1)
    expect(elements.toArray().map(element => element.groupId ?? null)).toEqual(['grp_new', null, 'grp_new', null])
    expect(elements.get(1)).not.toHaveProperty('groupId')
    expect(elements.get(3)).not.toHaveProperty('groupId')

    undo.undo()
    expect(elements.toArray().map(element => element.groupId ?? null)).toEqual([null, null, 'old', 'old'])
  })

  it('ungroups every member when only one was named', () => {
    const { doc, elements } = board([element('a', { groupId: 'g' }), element('b', { groupId: 'g' })])
    const writes = planUngroup(elements.toArray(), ['b'])
    writeGroupMembership(doc, elements, writes)
    expect(elements.toArray().every(element => !('groupId' in element))).toBe(true)
  })

  it('opens no transaction when the write would change nothing', () => {
    const { doc, elements } = board([element('a', { groupId: 'g' })])
    const updates = countUpdates(doc)
    expect(writeGroupMembership(doc, elements, [{ id: 'a', groupId: 'g' }])).toBe(0)
    expect(writeGroupMembership(doc, elements, [{ id: 'missing' }])).toBe(0)
    expect(writeGroupMembership(doc, elements, [])).toBe(0)
    expect(updates.value).toBe(0)
  })
})

describe('restackElements', () => {
  it('sends a selection to the back in one undo step, keeping document order', () => {
    const { doc, elements } = board([element('a'), element('b'), element('c'), element('d')])
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: new Set<unknown>([LOCAL_EDIT]) })
    const updates = countUpdates(doc)

    expect(restackElements(doc, elements, ['d', 'b'], 'back')).toBe(2)
    expect(updates.value).toBe(1)
    expect(ids(elements)).toEqual(['b', 'd', 'a', 'c'])
    expect(elements.get(0).zIndex).toBe(-2)
    expect(elements.get(1).zIndex).toBe(-1)

    undo.undo()
    expect(ids(elements)).toEqual(['a', 'b', 'c', 'd'])
    expect(elements.get(1)).not.toHaveProperty('zIndex')
  })

  it('raises a block above the highest staying z and ignores a lock', () => {
    const { doc, elements } = board([
      element('a', { zIndex: 4, locked: true }),
      element('b'),
      element('c', { zIndex: 9 }),
    ])
    expect(restackElements(doc, elements, ['a'], 'front')).toBe(1)
    expect(ids(elements)).toEqual(['b', 'c', 'a'])
    expect(elements.get(2)).toMatchObject({ zIndex: 10, locked: true, x: 0 })
  })

  it('opens no transaction when the block is already the edge, or the id is missing', () => {
    const { doc, elements } = board([element('a'), element('b')])
    const updates = countUpdates(doc)
    expect(restackElements(doc, elements, ['b'], 'front')).toBe(0)
    expect(restackElements(doc, elements, ['a'], 'back')).toBe(0)
    expect(restackElements(doc, elements, ['a', 'b'], 'front')).toBe(0)
    expect(restackElements(doc, elements, [], 'back')).toBe(0)
    expect(restackElements(doc, elements, ['missing'], 'back')).toBe(0)
    expect(updates.value).toBe(0)
  })

  it('takes a group mate and the connector between them, not a flow that leaves the set', () => {
    const flow = (id: string, sourceId: string, targetId: string): BoardElement => ({
      id, type: 'arrow', x: 1, y: 2, color: '#000', bpmnFlow: { sourceId, targetId },
    })
    const { doc, elements } = board([
      element('a', { groupId: 'g' }),
      flow('ab', 'a', 'b'),
      element('b', { groupId: 'g' }),
      flow('ac', 'a', 'c'),
      element('c'),
    ])
    expect(restackElements(doc, elements, ['b'], 'front')).toBe(3)
    expect(ids(elements)).toEqual(['ac', 'c', 'a', 'ab', 'b'])
    expect(elements.toArray().find(item => item.id === 'ab')).not.toHaveProperty('zIndex')
    expect(elements.toArray().find(item => item.id === 'a')!.zIndex).toBe(1)
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

  it('stamps a zIndex above the rest, not a clock value', () => {
    const { doc, elements } = board([element('a'), element('b', { zIndex: 3 })])
    bringToFront(doc, elements, 'a')
    expect(elements.toArray().at(-1)!.zIndex).toBe(4)
  })
})

describe('freeform link', () => {
  const linked = (): BoardElement => element('a', {
    type: 'arrow', x: 200, y: 20, w: 80, h: 0, link: { sourceId: 's' },
  })

  it('does not delete the arrow when its shape goes, and one undo restores the link', () => {
    const { doc, elements } = board([element('s', { x: 0, y: 0, w: 100, h: 40 }), linked()])
    const undo = new Y.UndoManager(elements, { captureTimeout: 0, trackedOrigins: new Set<unknown>([LOCAL_EDIT]) })

    expect(deleteElement(doc, elements, 's')).toBe(true)
    expect(ids(elements)).toEqual(['a'])
    const parked = elements.get(0)
    expect(parked.bpmnFlow).toBeUndefined()
    expect(parked).not.toHaveProperty('link')
    expect(parked.x).not.toBe(0)

    undo.undo()
    expect(ids(elements)).toEqual(['s', 'a'])
    expect(elements.toArray().find(item => item.id === 'a')!.link).toEqual({ sourceId: 's' })
  })

  it('does not rewrite an arrow when only its shape moves', () => {
    const { doc, elements } = board([element('s', { x: 0, y: 0, w: 100, h: 40 }), linked()])
    moveElements(doc, elements, ['s'], { x: 30, y: 10 })
    expect(elements.toArray().find(item => item.id === 'a')).toMatchObject({
      x: 200, y: 20, link: { sourceId: 's' },
    })
    expect(elements.get(0)).toMatchObject({ x: 30, y: 10 })
  })

  it('detaches an arrow that is nudged away from its shape', () => {
    const { doc, elements } = board([element('s', { x: 0, y: 0, w: 100, h: 40 }), linked()])
    const before = elements.get(1)
    moveElements(doc, elements, ['a'], { x: 15, y: 0 })
    const after = elements.get(1)
    expect(after).not.toHaveProperty('link')
    expect(after.bpmnFlow).toBeUndefined()
    expect(after.x).not.toBe(before.x)
    expect(after.y).toBeCloseTo(before.y, 4)
  })

  it('remaps a copied link onto the copies, and bakes a lone arrow', () => {
    const { doc, elements } = board([
      element('s', { x: 0, y: 0, w: 100, h: 40 }),
      element('t', { x: 400, y: 0, w: 100, h: 40 }),
      element('a', { type: 'arrow', x: 4, y: 6, w: 10, h: 10, link: { sourceId: 's', targetId: 't' } }),
    ])
    let n = 0
    const both = duplicateElements(doc, elements, ['s', 't', 'a'], () => `copy-${n++}`)
    const copied = elements.toArray().find(item => item.id === both[2])!
    expect(copied.bpmnFlow).toBeUndefined()
    expect(copied.link).toEqual({ sourceId: both[0], targetId: both[1] })

    const alone = duplicateElements(doc, elements, ['a'], () => 'lone')
    const lone = elements.toArray().find(item => item.id === alone[0])!
    expect(lone).not.toHaveProperty('link')
    expect(lone.x).not.toBe(24)
  })
})
