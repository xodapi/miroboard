import { describe, expect, it } from 'vitest'
import type { BoardElement } from '../format/mboard'
import { BPMN_NODE_TYPES } from '../board/types'
import {
  CLIPBOARD_MIME,
  CLIPBOARD_VERSION,
  MAX_PASTE_ELEMENTS,
  PASTE_OFFSET,
  parseClipboard,
  preparePaste,
  roundTrip,
  sanitiseElement,
  serialiseSelection,
} from './clipboard'

function rect(overrides: Partial<BoardElement> = {}): BoardElement {
  return { id: 'r1', type: 'rect', x: 100, y: 120, w: 80, h: 40, color: '#4D96FF', ...overrides }
}

describe('serialiseSelection / parseClipboard', () => {
  it('round-trips a selection without losing optional fields', () => {
    const elements: BoardElement[] = [
      rect(),
      {
        id: 'sticky-1', type: 'sticky', x: 10, y: 20, w: 120, h: 120, color: '#FFD166',
        text: 'Заметка', rotation: 3, zIndex: 4, createdBy: 'participant-9',
      },
      {
        id: 'path-1', type: 'path', x: 0, y: 0, color: '#000', stroke: 2,
        points: [{ x: 0, y: 0 }, { x: 12, y: 30 }],
      },
    ]
    expect(parseClipboard(serialiseSelection(elements))).toEqual(elements)
  })

  it('declares its media type and version inside the payload', () => {
    const parsed = JSON.parse(serialiseSelection([rect()])) as Record<string, unknown>
    expect(parsed.kind).toBe(CLIPBOARD_MIME)
    expect(parsed.version).toBe(CLIPBOARD_VERSION)
    expect(Array.isArray(parsed.elements)).toBe(true)
  })

  it('keeps an empty payload distinguishable from foreign text', () => {
    expect(parseClipboard(serialiseSelection([]))).toEqual([])
  })

  it('returns null for anything that is not a miroboard payload', () => {
    expect(parseClipboard(null)).toBeNull()
    expect(parseClipboard(undefined)).toBeNull()
    expect(parseClipboard('')).toBeNull()
    expect(parseClipboard('just some text the user copied')).toBeNull()
    expect(parseClipboard('{ broken json')).toBeNull()
    expect(parseClipboard('[1,2,3]')).toBeNull()
    expect(parseClipboard('{"kind":"text/plain","version":1,"elements":[]}')).toBeNull()
    expect(parseClipboard(JSON.stringify({ kind: CLIPBOARD_MIME, version: 99, elements: [] }))).toBeNull()
    expect(parseClipboard(JSON.stringify({ kind: CLIPBOARD_MIME, version: CLIPBOARD_VERSION }))).toBeNull()
  })

  it('drops invalid elements but keeps the valid ones next to them', () => {
    const payload = JSON.stringify({
      kind: CLIPBOARD_MIME,
      version: CLIPBOARD_VERSION,
      elements: [
        rect(),
        null,
        'not an element',
        { id: '', type: 'rect', x: 0, y: 0, color: '#000' },
        { id: 'x', type: 'hexagon', x: 0, y: 0, color: '#000' },
        { id: 'y', type: 'rect', x: Number.NaN, y: 0, color: '#000' },
        rect({ id: 'r2', x: 300 }),
      ],
    })
    expect(parseClipboard(payload)?.map(element => element.id)).toEqual(['r1', 'r2'])
  })

  it('ignores a repeated id instead of pasting two elements with one identity', () => {
    const payload = JSON.stringify({
      kind: CLIPBOARD_MIME,
      version: CLIPBOARD_VERSION,
      elements: [rect(), rect({ x: 500 }), rect({ x: 900 })],
    })
    expect(parseClipboard(payload)).toHaveLength(1)
  })

  it('never pastes more than the element cap', () => {
    const elements = Array.from({ length: MAX_PASTE_ELEMENTS + 50 }, (_, index) => rect({ id: `r${index}`, x: index }))
    expect(parseClipboard(serialiseSelection(elements))).toHaveLength(MAX_PASTE_ELEMENTS)
  })
})

describe('sanitiseElement', () => {
  it('rejects elements without an id, a known type or numeric coordinates', () => {
    expect(sanitiseElement({ type: 'rect', x: 0, y: 0 })).toBeNull()
    expect(sanitiseElement({ id: 'a', type: 'nope', x: 0, y: 0 })).toBeNull()
    expect(sanitiseElement({ id: 'a', type: 'rect', x: '0', y: 0 })).toBeNull()
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 0, y: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('drops an unrecognised bpmnNodeType instead of trusting it', () => {
    // The Rust engine deserialises this into a strict enum. One unknown value
    // makes the whole model fail to parse, so a single pasted element used to
    // leave the board reporting "Не удалось проверить BPMN-модель." for every
    // other node too.
    const element = sanitiseElement({ id: 'a', type: 'sticky', x: 0, y: 0, bpmnNodeType: 'totallyBogus' })
    expect(element).not.toBeNull()
    expect(element).not.toHaveProperty('bpmnNodeType')
  })

  it('keeps every node type the engine knows', () => {
    for (const nodeType of BPMN_NODE_TYPES) {
      const element = sanitiseElement({ id: 'a', type: 'sticky', x: 0, y: 0, bpmnNodeType: nodeType })
      expect(element?.bpmnNodeType).toBe(nodeType)
    }
  })

  it('defaults the mandatory colour instead of dropping the element', () => {
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 1, y: 2 })?.color).toBe('transparent')
  })

  it('drops malformed optional fields and keeps well-formed ones', () => {
    const element = sanitiseElement({
      id: 'a', type: 'path', x: 0, y: 0, color: '#000',
      stroke: 'thick', rotation: 90, text: 42, points: [{ x: 1, y: 2 }, { x: Number.NaN, y: 3 }, 'junk'],
      waypoints: 'not-an-array', labelOffset: { x: 5, y: 6, extra: true },
    })
    expect(element).toMatchObject({ rotation: 90, points: [{ x: 1, y: 2 }], labelOffset: { x: 5, y: 6 } })
    // Wrongly-typed fields are dropped outright, not coerced into placeholders.
    expect(element).not.toHaveProperty('stroke')
    expect(element).not.toHaveProperty('text')
    expect(element).not.toHaveProperty('waypoints')
    expect(element?.labelOffset).not.toHaveProperty('extra')
  })

  it('keeps a non-empty group token and drops one that is empty, mistyped, or sitting on a connector', () => {
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 0, y: 0, color: '#000', groupId: 'grp_1' })?.groupId).toBe('grp_1')
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 0, y: 0, color: '#000', groupId: '' })).not.toHaveProperty('groupId')
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 0, y: 0, color: '#000', groupId: 4 })).not.toHaveProperty('groupId')
    const flow = sanitiseElement({
      id: 'f', type: 'arrow', x: 0, y: 0, color: '#000', groupId: 'grp_1',
      bpmnFlow: { sourceId: 'a', targetId: 'b' },
    })
    expect(flow).not.toHaveProperty('groupId')
  })

  it('keeps locked: true and never puts the flag on a connector', () => {
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 0, y: 0, color: '#000', locked: true })?.locked).toBe(true)
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 0, y: 0, color: '#000', locked: false })).not.toHaveProperty('locked')
    expect(sanitiseElement({ id: 'a', type: 'rect', x: 0, y: 0, color: '#000', locked: 'yes' })).not.toHaveProperty('locked')
    const flow = sanitiseElement({
      id: 'f', type: 'arrow', x: 0, y: 0, color: '#000', locked: true,
      bpmnFlow: { sourceId: 'a', targetId: 'b' },
    })
    expect(flow).not.toHaveProperty('locked')
  })

  it('keeps a bpmnFlow only when both endpoints are strings', () => {
    const kept = sanitiseElement({ id: 'f', type: 'arrow', x: 0, y: 0, color: '#000', bpmnFlow: { sourceId: 'a', targetId: 'b', flowType: 'message', probability: 0.5 } })
    expect(kept?.bpmnFlow).toEqual({ sourceId: 'a', targetId: 'b', flowType: 'message', probability: 0.5 })
    const dropped = sanitiseElement({ id: 'f', type: 'arrow', x: 0, y: 0, color: '#000', bpmnFlow: { sourceId: 'a' } })
    expect(dropped?.bpmnFlow).toBeUndefined()
  })
})

describe('preparePaste', () => {
  it('gives every pasted element a new id and offsets it', () => {
    const pasted = preparePaste([rect(), rect({ id: 'r2', x: 200, y: 220 })], { makeId: (_sourceId, index) => `new-${index}` })
    expect(pasted.map(element => element.id)).toEqual(['new-0', 'new-1'])
    expect(pasted[0]).toMatchObject({ x: 100 + PASTE_OFFSET, y: 120 + PASTE_OFFSET })
    expect(pasted[1]).toMatchObject({ x: 200 + PASTE_OFFSET, y: 220 + PASTE_OFFSET })
  })

  it('honours an explicit offset', () => {
    expect(preparePaste([rect()], { offset: { x: -5, y: 7 } })[0]).toMatchObject({ x: 95, y: 127 })
  })

  it('remaps bpmnFlow endpoints through the same id table, so a copied fragment stays connected to itself', () => {
    const elements: BoardElement[] = [
      rect({ id: 'start', bpmnNodeType: 'startEvent' }),
      rect({ id: 'task', bpmnNodeType: 'task' }),
      {
        id: 'flow', type: 'arrow', x: 0, y: 0, color: '#000',
        bpmnFlow: { sourceId: 'start', targetId: 'task', flowType: 'sequence', condition: 'ok' },
      },
    ]
    const pasted = preparePaste(elements, { makeId: sourceId => `${sourceId}-2` })
    expect(pasted.map(element => element.id)).toEqual(['start-2', 'task-2', 'flow-2'])
    expect(pasted[2].bpmnFlow).toMatchObject({ sourceId: 'start-2', targetId: 'task-2', condition: 'ok' })
  })

  it('drops a flow whose endpoint is outside the payload rather than rewiring it onto the board', () => {
    const elements: BoardElement[] = [
      rect({ id: 'task' }),
      { id: 'flow', type: 'arrow', x: 0, y: 0, color: '#000', bpmnFlow: { sourceId: 'task', targetId: 'not-copied' } },
    ]
    const pasted = preparePaste(elements, { makeId: sourceId => `${sourceId}-2` })
    expect(pasted[1].bpmnFlow).toBeUndefined()
    expect(pasted[1].id).toBe('flow-2')
  })

  it('attributes pasted elements to the pasting participant', () => {
    const pasted = preparePaste([rect({ createdBy: 'someone-else' })], { createdBy: 'me' })
    expect(pasted[0].createdBy).toBe('me')
  })

  it('does not mutate the source elements', () => {
    const source = rect()
    preparePaste([source], { makeId: () => 'new', offset: { x: 50, y: 50 } })
    expect(source).toEqual(rect())
  })

  it('retargets a pasted group so the copies do not join the source group', () => {
    const source = [rect({ id: 'a', groupId: 'g' }), rect({ id: 'b', groupId: 'g' })]
    const pasted = preparePaste(source, { makeId: (sourceId, index) => `${sourceId}-${index}` })
    expect(pasted.map(element => element.id)).toEqual(['a-0', 'b-1'])
    expect(pasted[0].groupId).toBe('g-2')
    expect(pasted[1].groupId).toBe(pasted[0].groupId)
    expect(source[0].groupId).toBe('g')
  })

  it('drops a group token when the paste does not contain two members', () => {
    const pasted = preparePaste([rect({ groupId: 'g' })], { makeId: () => 'new' })
    expect(pasted[0]).not.toHaveProperty('groupId')
  })
})

describe('roundTrip', () => {
  it('is copy followed by paste', () => {
    const copied = roundTrip([rect()], { makeId: () => 'pasted' })
    expect(copied).toEqual([rect({ id: 'pasted', x: 120, y: 140 })])
  })

  it('pastes nothing when there was nothing to copy', () => {
    expect(roundTrip([])).toEqual([])
  })
})
