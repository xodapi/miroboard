import { describe, expect, it } from 'vitest'
import { hitBounds, searchBoard, stepIndex } from './search'
import type { BoardElement } from './types'

function el(overrides: Partial<BoardElement> & Pick<BoardElement, 'id'>): BoardElement {
  return { type: 'sticky', x: 0, y: 0, w: 100, h: 60, color: '#000', ...overrides }
}

describe('searchBoard', () => {
  const board = [
    el({ id: 'a', text: 'Оплатить счёт' }),
    el({ id: 'b', text: 'Согласовать', bpmnResourceRole: 'бухгалтер' }),
    el({ id: 'c', type: 'arrow', text: '', bpmnFlow: { sourceId: 'a', targetId: 'b', condition: 'сумма > 100' } }),
    el({ id: 'd', type: 'emoji', emoji: '👍', text: '' }),
  ]

  it('matches nothing for an empty or blank query', () => {
    // An opened search box must not treat the whole board as a hit.
    expect(searchBoard(board, '')).toEqual([])
    expect(searchBoard(board, '   ')).toEqual([])
  })

  it('matches text case-insensitively and keeps document order', () => {
    // «а» is in the first label, the second label, and the flow condition.
    expect(searchBoard(board, 'а').map(hit => hit.id)).toEqual(['a', 'b', 'c'])
    expect(searchBoard(board, 'ОПЛАТИТЬ')[0]?.label).toBe('Оплатить счёт')
  })

  it('matches a caption on an arrow', () => {
    expect(searchBoard([el({ id: 'a', type: 'arrow', text: 'если да' })], 'если').map(hit => hit.id)).toEqual(['a'])
  })

  it('matches a role, a flow condition and an emoji, not just the label', () => {
    expect(searchBoard(board, 'бухгалтер').map(hit => hit.id)).toEqual(['b'])
    expect(searchBoard(board, 'сумма').map(hit => hit.id)).toEqual(['c'])
    expect(searchBoard(board, '👍').map(hit => hit.id)).toEqual(['d'])
  })

  it('does not match an id or a colour — those are not what a person searches for', () => {
    expect(searchBoard([el({ id: 'secret-id', text: 'заметка', color: '#abcdef' })], 'secret')).toEqual([])
    expect(searchBoard([el({ id: 'n', text: 'заметка', color: '#abcdef' })], 'abcdef')).toEqual([])
  })
})

describe('stepIndex', () => {
  it('wraps in both directions', () => {
    expect(stepIndex(3, 2, 1)).toBe(0)
    expect(stepIndex(3, 0, -1)).toBe(2)
  })

  it('stays at zero when there is nothing to step through', () => {
    expect(stepIndex(0, 4, 1)).toBe(0)
  })
})

describe('hitBounds', () => {
  it('frames a BPMN flow between its endpoints, not at the origin', () => {
    // Flows persist x/y/w/h of 0; the line is derived. Jumping to the stored
    // box would centre the view on (0, 0), nowhere near the process.
    const source = el({ id: 's', x: 100, y: 200, w: 80, h: 40 })
    const target = el({ id: 't', x: 400, y: 200, w: 80, h: 40 })
    const flow = el({
      id: 'f', type: 'arrow', x: 0, y: 0, w: 0, h: 0,
      bpmnFlow: { sourceId: 's', targetId: 't' },
    })
    const bounds = hitBounds(flow, new Map([['s', source], ['t', target]]))
    expect(bounds.x).toBeCloseTo(140)
    expect(bounds.y).toBeLessThanOrEqual(220)
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(440)
  })

  it('frames a linked arrow between its shapes, not at a stale origin', () => {
    const source = el({ id: 's', x: 100, y: 200, w: 80, h: 40 })
    const target = el({ id: 't', x: 400, y: 200, w: 80, h: 40 })
    const linked = el({
      id: 'a', type: 'arrow', x: 0, y: 0, w: 0, h: 0,
      link: { sourceId: 's', targetId: 't' },
    })
    const bounds = hitBounds(linked, new Map([['s', source], ['t', target]]))
    expect(bounds.x).toBeCloseTo(140)
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(440)
    expect(bounds.y).toBeLessThanOrEqual(220)
  })

  it('uses the element box for an ordinary sticky', () => {
    expect(hitBounds(el({ id: 'a', x: 10, y: 20, w: 30, h: 40 }), new Map())).toEqual({
      x: 10, y: 20, w: 30, h: 40,
    })
  })

  it('grows the box to cover a bend without moving a straight arrow', () => {
    expect(hitBounds(el({ id: 'a', type: 'arrow', x: 10, y: 20, w: 30, h: 0 }), new Map())).toMatchObject({
      x: 10, y: 20,
    })
    const bent = hitBounds(el({
      id: 'a', type: 'arrow', x: 10, y: 20, w: 30, h: 0,
      waypoints: [{ x: 40, y: -10 }],
    }), new Map())
    expect(bent.y).toBe(-10)
    expect(bent.x + bent.w).toBeGreaterThanOrEqual(40)
  })

  it('grows the box to a caption dragged off the route, and not when it sits on the route', () => {
    const straight = hitBounds(el({ id: 'a', type: 'arrow', x: 10, y: 20, w: 100, h: 0, text: 'да' }), new Map())
    const lifted = hitBounds(el({
      id: 'a', type: 'arrow', x: 10, y: 20, w: 100, h: 0, text: 'да',
      labelOffset: { x: 0, y: -80 },
    }), new Map())
    expect(lifted.y).toBeLessThan(straight.y)
    expect(lifted.y).toBeLessThanOrEqual(-60)
  })
})
