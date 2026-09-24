import { describe, expect, it, vi } from 'vitest'

// The wasm build is not loaded under vitest; app-smoke.test.tsx mocks the same
// module with the same arithmetic, so snapVal is exercised against that stub and
// the assertion is about delegation (value plus the default grid), not about the
// Rust rounding itself.
const { snapToGrid } = vi.hoisted(() => ({
  snapToGrid: vi.fn((value: number, grid: number) => Math.round(value / grid) * grid),
}))
vi.mock('../wasm/board-core/board_core', () => ({ snap_to_grid: snapToGrid }))

import { bpmnEdgeAnchor, localToWorld, outlineAnchor, pointToLineDistance, simplifyPath, smoothPathD, snapVal, worldToLocal } from './geometry'
import type { BoardElement, Point } from './types'

/** Anchors come out of float division, so compare with a tolerance. */
function expectAnchor(actual: Point, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 6)
  expect(actual.y).toBeCloseTo(y, 6)
}

const p = (x: number, y: number): Point => ({ x, y })

function node(overrides: Partial<BoardElement>): BoardElement {
  return { id: 'n1', type: 'rect', x: 0, y: 0, w: 100, h: 60, color: '#000', ...overrides }
}

describe('pointToLineDistance', () => {
  it('measures the perpendicular offset from a segment', () => {
    expect(pointToLineDistance(p(5, 3), p(0, 0), p(10, 0))).toBeCloseTo(3)
  })

  it('measures along a diagonal too, not just axis-aligned lines', () => {
    // (0,0)-(10,10) and the point (0,10): the perpendicular distance is 10/sqrt(2)
    expect(pointToLineDistance(p(0, 10), p(0, 0), p(10, 10))).toBeCloseTo(Math.SQRT1_2 * 10)
  })

  it('falls back to plain distance when the segment is a single point', () => {
    expect(pointToLineDistance(p(3, 4), p(0, 0), p(0, 0))).toBeCloseTo(5)
  })
})

describe('simplifyPath', () => {
  it('returns short strokes untouched', () => {
    const two = [p(0, 0), p(10, 10)]
    expect(simplifyPath(two)).toEqual(two)
    expect(simplifyPath([p(0, 0)])).toEqual([p(0, 0)])
    expect(simplifyPath([])).toEqual([])
  })

  it('collapses a straight-ish stroke to its endpoints', () => {
    const stroke = [p(0, 0), p(5, 0.5), p(10, 1), p(15, 1.5), p(20, 2)]
    expect(simplifyPath(stroke, 2)).toEqual([p(0, 0), p(20, 2)])
  })

  it('keeps a deviation that exceeds the tolerance', () => {
    const spike = [p(0, 0), p(10, 50), p(20, 0)]
    const result = simplifyPath(spike, 2)
    expect(result).toHaveLength(3)
    expect(result[1]).toEqual(p(10, 50))
  })

  it('keeps both endpoints of a zig-zag and never reorders them', () => {
    const zig = [p(0, 0), p(10, 40), p(20, 0), p(30, 40), p(40, 0)]
    const result = simplifyPath(zig, 2)
    expect(result[0]).toEqual(p(0, 0))
    expect(result[result.length - 1]).toEqual(p(40, 0))
    expect(result.length).toBeLessThan(zig.length + 1)
    expect(result.length).toBeGreaterThan(2)
  })

  it('a larger tolerance simplifies more aggressively', () => {
    const stroke = [p(0, 0), p(10, 5), p(20, 0), p(30, 5), p(40, 0)]
    expect(simplifyPath(stroke, 10).length).toBeLessThanOrEqual(simplifyPath(stroke, 1).length)
  })
})

describe('smoothPathD', () => {
  it('renders nothing for fewer than two points', () => {
    expect(smoothPathD([])).toBe('')
    expect(smoothPathD([p(4, 4)])).toBe('')
  })

  it('draws a straight line for exactly two points', () => {
    expect(smoothPathD([p(1, 2), p(3, 4)])).toBe('M 1 2 L 3 4')
  })

  it('curves through midpoints once there are three or more points', () => {
    const d = smoothPathD([p(0, 0), p(10, 10), p(20, 0)])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d).toContain('Q 10 10 15 5')
    expect(d.endsWith('L 20 0')).toBe(true)
  })
})

describe('snapVal', () => {
  it('snaps to a 20px grid unless told otherwise', () => {
    expect(snapVal(23)).toBe(20)
    expect(snapToGrid).toHaveBeenLastCalledWith(23, 20)
    expect(snapVal(23, 5)).toBe(25)
    expect(snapToGrid).toHaveBeenLastCalledWith(23, 5)
  })

  it('leaves values already on the grid alone', () => {
    expect(snapVal(0)).toBe(0)
    expect(snapVal(40)).toBe(40)
    expect(snapVal(60, 30)).toBe(60)
  })
})

describe('bpmnEdgeAnchor', () => {
  it('returns the centre when the edge points nowhere', () => {
    expectAnchor(bpmnEdgeAnchor(node({}), 50, 30), 50, 30)
  })

  it('stops a task edge on the rectangle outline', () => {
    // 100x60 task at the origin, centre (50,30); edge coming from the right
    expectAnchor(bpmnEdgeAnchor(node({ bpmnNodeType: 'task' }), 500, 30), 100, 30)
    // and from below
    expectAnchor(bpmnEdgeAnchor(node({ bpmnNodeType: 'task' }), 50, 500), 50, 60)
  })

  it('stops an event edge on the circle outline', () => {
    const event = node({ w: 40, h: 40, bpmnNodeType: 'startEvent' })
    expectAnchor(bpmnEdgeAnchor(event, 400, 20), 40, 20)
    expectAnchor(bpmnEdgeAnchor(event, 20, 400), 20, 40)
  })

  it('stops a gateway edge on the diamond outline', () => {
    for (const bpmnNodeType of ['xorGateway', 'andGateway', 'orGateway'] as const) {
      const gateway = node({ w: 40, h: 40, bpmnNodeType })
      // straight down meets the bottom vertex, not the bounding box
      expectAnchor(bpmnEdgeAnchor(gateway, 20, 400), 20, 40)
      // straight right meets the right vertex
      expectAnchor(bpmnEdgeAnchor(gateway, 400, 20), 40, 20)
    }
  })

  it('treats an element without a bpmnNodeType as a rectangle', () => {
    expectAnchor(bpmnEdgeAnchor(node({}), 500, 30), 100, 30)
  })

  it('anchors are symmetric: opposite sides of the same shape', () => {
    const task = node({ bpmnNodeType: 'task' })
    expectAnchor(bpmnEdgeAnchor(task, -500, 30), 0, 30)
    expectAnchor(bpmnEdgeAnchor(task, 50, -500), 50, 0)
  })
})

describe('outlineAnchor', () => {
  it('matches the connector anchor on an unrotated non-circle', () => {
    const shape = node({ x: 10, y: 20, w: 100, h: 60 })
    const toward = { x: 400, y: 80 }
    expectAnchor(
      outlineAnchor(shape, toward.x, toward.y),
      bpmnEdgeAnchor(shape, toward.x, toward.y).x,
      bpmnEdgeAnchor(shape, toward.x, toward.y).y,
    )
  })

  it('uses the ellipse for a circle, and the centre when the shape has no size', () => {
    const circle = node({ type: 'circle', x: 0, y: 0, w: 100, h: 40 })
    const corner = outlineAnchor(circle, 1000, 1000)
    expect(corner.x).toBeLessThan(100)
    expect(corner.y).toBeLessThan(40)
    expectAnchor(outlineAnchor(node({ w: 0, h: 0 }), 40, 40), 0, 0)
  })

  it('rotates with the shape, matching SVG clockwise', () => {
    const upright = node({ x: 0, y: 0, w: 100, h: 40 })
    const spun = node({ x: 0, y: 0, w: 100, h: 40, rotation: 90 })
    const local = { x: 100, y: 20 }
    const world = localToWorld(spun, local)
    expectAnchor(world, 50, 70)
    expectAnchor(worldToLocal(spun, world), local.x, local.y)
    // A point below the centre is the rotated image of a point to the right.
    expectAnchor(outlineAnchor(spun, 50, 200), world.x, world.y)
    expect(outlineAnchor(upright, 400, 20).y).toBeCloseTo(20, 4)
  })
})
