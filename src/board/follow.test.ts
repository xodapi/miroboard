import { describe, expect, it } from 'vitest'
import {
  containsPoint, hasLink, isAttachable, lineEnds, parkForMove, patchesForRemoval,
  planLink, visualExtent, withDrawnLine,
} from './follow'
import type { BoardElement } from './types'

function box(
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 40,
  over: Partial<BoardElement> = {},
): BoardElement {
  return { id, type: 'rect', x, y, w, h, color: '#000', ...over }
}

function arrow(over: Partial<BoardElement> = {}): BoardElement {
  return { id: 'a', type: 'arrow', x: 200, y: 20, w: 100, h: 0, color: '#000', ...over }
}

const byId = (elements: readonly BoardElement[]) => new Map(elements.map(element => [element.id, element]))

describe('planLink', () => {
  const left = box('left', 0, 0)
  const right = box('right', 400, 200, 100, 60)

  it('attaches each end to the shape under it, and neither end when they share a shape', () => {
    const drawn = arrow({ x: 40, y: 20, w: 0, h: 0 })
    expect(planLink(drawn, [left, right], { x: 450, y: 230 }, 0)).toEqual({
      sourceId: 'left',
      targetId: 'right',
    })
    expect(planLink(drawn, [left], { x: 60, y: 20 }, 0)).toBeUndefined()
  })

  it('attaches one end and leaves the other free', () => {
    const drawn = arrow({ x: 40, y: 20 })
    expect(planLink(drawn, [left, right], { x: 250, y: 20 }, 0)).toEqual({ sourceId: 'left' })
    expect(planLink(drawn, [left, right], { x: 450, y: 230 }, 0)?.sourceId).toBe('left')
  })

  it('attaches nothing for a zero-length stroke, a connector, or a miss', () => {
    const drawn = arrow({ x: 40, y: 20 })
    expect(planLink(drawn, [left], { x: 40, y: 20 }, 8)).toBeUndefined()
    expect(planLink(arrow({ x: 500, y: 500 }), [left], { x: 800, y: 800 }, 0)).toBeUndefined()
    const flow = arrow({ bpmnFlow: { sourceId: 'left', targetId: 'right' } })
    expect(planLink(flow, [left, right], { x: 450, y: 230 }, 8)).toBeUndefined()
  })

  it('hits the topmost attachable shape and ignores paths, arrows and connectors', () => {
    const under = box('under', 0, 0)
    const over = box('over', 0, 0)
    const path = box('path', 0, 0, 100, 40, { type: 'path' })
    const marker = arrow({ id: 'marker', x: 0, y: 0, w: 100, h: 40 })
    const flow = arrow({
      id: 'flow', x: 0, y: 0, w: 100, h: 40,
      bpmnFlow: { sourceId: 'under', targetId: 'over' },
    })
    const drawn = arrow({ id: 'drawn', x: 10, y: 10 })
    expect(planLink(drawn, [under, path, marker, flow, over], { x: 500, y: 500 }, 0)?.sourceId).toBe('over')
  })

  it('uses the release slop, not a stored box', () => {
    const drawn = arrow({ x: -5, y: 20, w: 0, h: 0 })
    expect(planLink(drawn, [left], { x: 500, y: 500 }, 0)).toBeUndefined()
    expect(planLink(drawn, [left], { x: 500, y: 500 }, 8)).toEqual({ sourceId: 'left' })
  })
})

describe('lineEnds', () => {
  it('follows a moved shape from the outline, and a dangling id from the stored frame', () => {
    const shape = box('s', 0, 0)
    const linked = arrow({ link: { sourceId: 's' } })
    const ends = lineEnds(linked, byId([shape, linked]))
    expect(ends?.start.x).toBeCloseTo(100, 4)
    expect(ends?.start.y).toBeCloseTo(20, 4)
    expect(ends?.end).toEqual({ x: 300, y: 20 })

    const moved = { ...shape, x: 30 }
    const followed = lineEnds(linked, byId([moved, linked]))
    expect(followed?.start.x).toBeCloseTo(130, 4)
    expect(followed?.end).toEqual({ x: 300, y: 20 })

    const dangling = arrow({ link: { sourceId: 'missing', targetId: 's' } })
    const mixed = lineEnds(dangling, byId([shape, dangling]))
    expect(mixed?.start).toEqual({ x: 200, y: 20 })
    expect(mixed?.end.x).toBeCloseTo(100, 4)
  })

  it('does not invent ends for a box', () => {
    expect(lineEnds(box('s', 0, 0), new Map())).toBeNull()
  })
})

describe('parkForMove', () => {
  const shape = box('s', 0, 0)
  const other = box('t', 400, 0)
  const linked = arrow({ x: 0, y: 20, w: 500, h: 0, link: { sourceId: 's', targetId: 't' } })

  it('keeps the link when every attached shape is moving with the arrow', () => {
    expect(parkForMove(linked, [shape, other, linked], new Set(['a', 's', 't']))).toEqual({ x: 0, y: 20 })
  })

  it('freezes an end whose shape stays behind', () => {
    const parked = parkForMove(linked, [shape, other, linked], new Set(['a', 's']))
    expect(parked.extras?.link).toEqual({ sourceId: 's' })
    expect(parked.x).toBeCloseTo(lineEnds(linked, byId([shape, other, linked]))!.start.x, 4)
    expect(parked.extras?.w).toBeCloseTo(
      lineEnds(linked, byId([shape, other, linked]))!.end.x - parked.x,
      4,
    )
  })

  it('does not park a shape, or an arrow that is not attached', () => {
    expect(parkForMove(shape, [shape, linked], new Set(['s']))).toEqual({ x: 0, y: 0 })
    expect(parkForMove(arrow(), [shape, arrow()], new Set(['a']))).toEqual({ x: 200, y: 20 })
  })
})

describe('patchesForRemoval', () => {
  it('freezes the arrow and leaves it, including when the arrow itself is removed', () => {
    const shape = box('s', 0, 0)
    const linked = arrow({ link: { targetId: 's' } })
    const patches = patchesForRemoval([shape, linked], new Set(['s']))
    expect(patches.map(patch => patch.id)).toEqual(['a'])
    expect(patches[0].updates.link).toBeUndefined()
    expect(patches[0].updates.x).toBeCloseTo(200, 4)

    expect(patchesForRemoval([shape, linked], new Set(['s', 'a']))).toEqual([])
    expect(patchesForRemoval([shape, linked], new Set(['other']))).toEqual([])
  })
})

describe('withDrawnLine', () => {
  it('bakes the visual segment and leaves a connector alone', () => {
    const shape = box('s', 0, 0)
    const linked = arrow({ link: { sourceId: 's' } })
    const drawn = withDrawnLine(linked, byId([shape, linked]))
    expect(drawn.link).toEqual({ sourceId: 's' })
    expect(drawn.x).toBeCloseTo(100, 4)
    expect(drawn.y).toBeCloseTo(20, 4)
    const free = arrow()
    expect(withDrawnLine(free, new Map())).toBe(free)

    const flow = arrow({ x: 4, y: 6, bpmnFlow: { sourceId: 's', targetId: 't' }, link: { sourceId: 's' } })
    expect(withDrawnLine(flow, byId([shape, flow]))).toMatchObject({ x: 4, y: 6 })
  })
})

describe('containsPoint', () => {
  it('uses the outline, including a rotated box, an ellipse and a diamond', () => {
    const rect = box('r', 0, 0, 100, 40, { rotation: 90 })
    expect(containsPoint(rect, { x: 50, y: 70 })).toBe(true)
    expect(containsPoint(rect, { x: 100, y: 20 })).toBe(false)

    const circle = box('c', 0, 0, 100, 40, { type: 'circle' })
    expect(containsPoint(circle, { x: 100, y: 40 })).toBe(false)
    expect(containsPoint(circle, { x: 50, y: 20 })).toBe(true)

    const gate = box('g', 0, 0, 80, 80, { bpmnNodeType: 'xorGateway' })
    expect(containsPoint(gate, { x: 0, y: 0 })).toBe(false)
    expect(containsPoint(gate, { x: 40, y: 40 })).toBe(true)
  })

  it('treats a negative size as a box, not as empty', () => {
    const flipped = box('f', 100, 100, -40, -20)
    expect(containsPoint(flipped, { x: 80, y: 90 })).toBe(true)
    expect(containsPoint(flipped, { x: 10, y: 10 })).toBe(false)
  })
})

describe('attachment predicates', () => {
  it('follows stickies, boxes and BPMN nodes, not a path or a connector', () => {
    expect(isAttachable(box('s', 0, 0, 10, 10, { type: 'sticky', bpmnNodeType: 'task' }))).toBe(true)
    expect(isAttachable(box('p', 0, 0, 10, 10, { type: 'path' }))).toBe(false)
    expect(isAttachable(arrow({ bpmnFlow: { sourceId: 's', targetId: 't' } }))).toBe(false)
    expect(hasLink(arrow({ link: { sourceId: 's' } }))).toBe(true)
    expect(hasLink(arrow({ bpmnFlow: { sourceId: 's', targetId: 't' }, link: { sourceId: 's' } }))).toBe(false)
    expect(hasLink(box('s', 0, 0, 10, 10, { link: { sourceId: 'other' } }))).toBe(false)
  })

  it('frames the live segment, not a stale origin', () => {
    const shape = box('s', 0, 0)
    const linked = arrow({ x: 0, y: 0, w: 0, h: 0, link: { sourceId: 's' } })
    const ends = lineEnds(linked, byId([shape, linked]))!
    const extent = visualExtent(linked, byId([shape, linked]))
    expect(extent.x).toBeCloseTo(Math.min(ends.start.x, ends.end.x), 4)
    expect(extent.y).toBeCloseTo(Math.min(ends.start.y, ends.end.y), 4)
    expect(visualExtent(arrow(), new Map())).toEqual({ x: 200, y: 20, w: 100, h: 0 })
  })
})
