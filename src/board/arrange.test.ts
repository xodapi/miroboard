import { describe, expect, it } from 'vitest'
import { alignUnitCount, planAlign } from './arrange'
import type { BoardElement } from './types'

const box = (
  id: string,
  x: number,
  y: number,
  w = 20,
  h = 20,
  over: Partial<BoardElement> = {},
): BoardElement => ({
  id, type: 'rect', x, y, w, h, color: '#000', stroke: 2, fill: 'none', ...over,
})

const ids = (moves: { id: string }[]) => moves.map(move => move.id)

describe('planAlign', () => {
  it('aligns to the union edge, not the average of the centers', () => {
    const elements = [box('a', 0, 0, 10, 10), box('b', 100, 40, 100, 30)]
    expect(planAlign(elements, ['a', 'b'], 'left')).toEqual([{ id: 'b', x: 0, y: 40 }])
    expect(planAlign(elements, ['a', 'b'], 'right')).toEqual([{ id: 'a', x: 190, y: 0 }])
    // Union is x 0..200, center 100. Averaging the centers (5 and 150) would
    // land on 77.5 and move both.
    expect(planAlign(elements, ['a', 'b'], 'centerX')).toEqual([
      { id: 'a', x: 95, y: 0 },
      { id: 'b', x: 50, y: 40 },
    ])
    expect(planAlign(elements, ['a', 'b'], 'top')).toEqual([{ id: 'b', x: 100, y: 0 }])
    expect(planAlign(elements, ['a', 'b'], 'bottom')).toEqual([{ id: 'a', x: 0, y: 60 }])
    // Union is y 0..70, center 35. Averaging 5 and 55 would be 30.
    expect(planAlign(elements, ['a', 'b'], 'centerY')).toEqual([
      { id: 'a', x: 0, y: 30 },
      { id: 'b', x: 100, y: 20 },
    ])
  })

  it('does nothing for one unit, or when every unit is already on the edge', () => {
    expect(planAlign([box('a', 0, 0)], ['a', 'missing'], 'left')).toEqual([])
    expect(planAlign([box('a', 0, 0, 20, 10), box('b', 0, 40, 20, 10)], ['a', 'b'], 'left')).toEqual([])
    expect(alignUnitCount([box('a', 0, 0), box('b', 30, 0)], ['a'])).toBe(1)
    expect(alignUnitCount([box('a', 0, 0), box('b', 30, 0)], ['a', 'b'])).toBe(2)
  })

  it('moves a group as one body, including a member the selection did not name', () => {
    const elements = [
      box('a', 0, 0, 20, 20, { groupId: 'g' }),
      box('b', 40, 10, 20, 20, { groupId: 'g' }),
      box('c', 200, 0, 20, 20),
    ]
    const moves = planAlign(elements, ['a', 'c'], 'right')
    expect(ids(moves)).toEqual(['a', 'b'])
    expect(moves[0].x - elements[0].x).toBe(moves[1].x - elements[1].x)
    expect(moves[0].y).toBe(0)
    expect(moves[1].y).toBe(10)
    expect(alignUnitCount(elements, ['a', 'b'])).toBe(1)
  })

  it('leaves a locked unit where it is and still aligns the others to its edge', () => {
    const elements = [
      box('a', 0, 0, 40, 10, { locked: true }),
      box('b', 80, 30, 10, 10),
    ]
    expect(planAlign(elements, ['a', 'b'], 'left')).toEqual([{ id: 'b', x: 0, y: 30 }])
    expect(planAlign(elements, ['a', 'b'], 'right')).toEqual([])
  })

  it('does not tear a group that has a locked member', () => {
    const elements = [
      box('a', 10, 0, 20, 20, { groupId: 'g', locked: true }),
      box('b', 40, 0, 20, 20, { groupId: 'g' }),
      box('c', 100, 80, 10, 10),
    ]
    expect(planAlign(elements, ['b', 'c'], 'left')).toEqual([{ id: 'c', x: 10, y: 80 }])
  })

  it('skips a connector even when both endpoints are selected', () => {
    const flow = box('f', 5, 5, 0, 0, { type: 'arrow', bpmnFlow: { sourceId: 'a', targetId: 'b' } })
    const elements = [box('a', 0, 0), box('b', 100, 0), flow]
    const moves = planAlign(elements, ['a', 'b', 'f'], 'left')
    expect(ids(moves)).toEqual(['b'])
    expect(alignUnitCount(elements, ['f', 'f'])).toBe(0)
  })

  it('aligns a freeform line by its normalised frame, and a path by its points', () => {
    const line = box('line', 100, 8, -40, 12, { type: 'line' })
    const path = box('path', 10, 0, 30, 5, {
      type: 'path',
      points: [{ x: 5, y: 0 }, { x: 30, y: 4 }],
    })
    const origin = box('origin', 0, 0, 10, 10)
    expect(planAlign([line, origin], ['line', 'origin'], 'left')).toEqual([{ id: 'line', x: 40, y: 8 }])
    const moved = planAlign([path, origin], ['path', 'origin'], 'left')
    expect(moved).toEqual([{ id: 'path', x: -5, y: 0 }])
    expect(path.points).toEqual([{ x: 5, y: 0 }, { x: 30, y: 4 }])
  })

  it('uses the same implicit box as selection for an emoji without a size', () => {
    const emoji = box('e', 100, 20, undefined, undefined, { type: 'emoji', emoji: '👍' })
    delete emoji.w
    delete emoji.h
    expect(planAlign([emoji, box('a', 0, 0, 10, 10)], ['e', 'a'], 'left')).toEqual([{ id: 'e', x: 0, y: 20 }])
  })

  it('ignores rotation and aligns the stored frame', () => {
    const plain = [box('a', 0, 0, 100, 20), box('b', 40, 0, 20, 20)]
    const spun = [box('a', 0, 0, 100, 20, { rotation: 90 }), box('b', 40, 0, 20, 20)]
    expect(planAlign(spun, ['a', 'b'], 'left')).toEqual(planAlign(plain, ['a', 'b'], 'left'))
  })
})
