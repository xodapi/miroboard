import { describe, expect, it } from 'vitest'
import { lineEnds } from './follow'
import { boxOf, commitBend, distanceToSegment, draftBend, strokeOf, type BendDrag } from './route'
import type { BoardElement, Point } from './types'

function box(id: string, x: number, y: number, w = 100, h = 40): BoardElement {
  return { id, type: 'rect', x, y, w, h, color: '#000' }
}

function arrow(over: Partial<BoardElement> = {}): BoardElement {
  return { id: 'a', type: 'arrow', x: 200, y: 20, w: 100, h: 0, color: '#000', ...over }
}

const byId = (elements: readonly BoardElement[]) => new Map(elements.map(element => [element.id, element]))
const p = (x: number, y: number): Point => ({ x, y })

function drag(over: Partial<BendDrag> = {}): BendDrag {
  return {
    index: 0,
    origin: [],
    chord: [p(0, 0), p(100, 0)],
    created: true,
    ...over,
  }
}

describe('strokeOf', () => {
  it('keeps a straight mark as two points, aimed centre to centre', () => {
    const shape = box('s', 0, 0)
    const linked = arrow({ link: { sourceId: 's' } })
    const stroke = strokeOf(linked, byId([shape, linked]))
    const ends = lineEnds(linked, byId([shape, linked]))
    expect(stroke?.points).toEqual([ends!.start, ends!.end])
    expect(strokeOf(box('s', 0, 0), new Map())).toBeNull()
  })

  it('aims an attached end at the adjacent bend', () => {
    const shape = box('s', 0, 0, 100, 100)
    const linked = arrow({
      x: 200, y: 50, w: 0, h: 0,
      link: { sourceId: 's' },
      waypoints: [p(200, 200)],
    })
    const straight = strokeOf({ ...linked, waypoints: undefined }, byId([shape, linked]))
    const bent = strokeOf(linked, byId([shape, linked]))
    expect(bent?.points[1]).toEqual(p(200, 200))
    expect(bent!.points[0].y).toBeGreaterThan(straight!.points[0].y)
    expect(bent?.points[2]).toEqual(p(200, 50))
  })

  it('aims a connector at the bend and leaves a missing end on the stored frame', () => {
    const source = box('s', 0, 0, 80, 40)
    const target = box('t', 400, 0, 80, 40)
    const flow = arrow({
      x: 0, y: 0, w: 0, h: 0,
      bpmnFlow: { sourceId: 's', targetId: 't' },
      waypoints: [p(200, 80)],
    })
    const bent = strokeOf(flow, byId([source, target, flow]))
    const straight = strokeOf({ ...flow, waypoints: undefined }, byId([source, target, flow]))
    expect(bent?.points[1]).toEqual(p(200, 80))
    expect(bent!.points[0].y).not.toBeCloseTo(straight!.points[0].y, 4)
    expect(strokeOf(flow, new Map())?.points[0]).toEqual(p(0, 0))
  })
})

describe('boxOf', () => {
  it('frames every point, including a bend past the ends', () => {
    expect(boxOf([p(10, 20), p(40, -5), p(30, 20)])).toEqual({ x: 10, y: -5, w: 30, h: 25 })
    expect(boxOf([])).toBeNull()
  })
})

describe('commitBend', () => {
  it('inserts a pulled midpoint and does not insert a click', () => {
    const created = drag()
    expect(draftBend(created, p(50, 40))).toEqual([p(50, 40)])
    expect(commitBend(created, p(50, 40), 8)).toEqual([p(50, 40)])
    expect(commitBend(created, p(50, 2), 8)).toBeUndefined()
  })

  it('moves an existing bend and drops it when it lands on its chord', () => {
    const moved = drag({
      created: false,
      origin: [p(40, 30)],
      chord: [p(0, 0), p(100, 0)],
    })
    expect(draftBend(moved, p(70, 10))).toEqual([p(70, 10)])
    expect(commitBend(moved, p(70, 10), 8)).toEqual([p(70, 10)])
    expect(commitBend(moved, p(55, 3), 8)).toBeUndefined()
  })

  it('measures distance to the segment, not the infinite line', () => {
    expect(distanceToSegment(p(50, 8), p(0, 0), p(100, 0))).toBe(8)
    expect(distanceToSegment(p(-10, 0), p(0, 0), p(100, 0))).toBe(10)
  })
})
