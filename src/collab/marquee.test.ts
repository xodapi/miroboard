import { describe, expect, it } from 'vitest'
import { boundsOf, contains, intersects, normaliseRect, selectInRect, type MarqueeElement } from './marquee'

const sticky = (id: string, x: number, y: number, w = 100, h = 60): MarqueeElement =>
  ({ id, type: 'sticky', x, y, w, h })

describe('marquee geometry', () => {
  it('normalises a rect dragged from any corner', () => {
    expect(normaliseRect({ x: 10, y: 10 }, { x: 0, y: 0 })).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
    expect(normaliseRect({ x: 0, y: 5 }, { x: 7, y: 2 })).toEqual({ minX: 0, minY: 2, maxX: 7, maxY: 5 })
  })

  it('bounds a box element from its frame', () => {
    expect(boundsOf(sticky('a', 10, 20, 100, 60))).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 80 })
  })

  it('falls back to 48px for elements without a size, matching fitToContent', () => {
    expect(boundsOf({ id: 'e', type: 'emoji', x: 0, y: 0 })).toEqual({ minX: 0, minY: 0, maxX: 48, maxY: 48 })
  })

  it('bounds a freehand path from its relative points', () => {
    const path: MarqueeElement = {
      id: 'p', type: 'path', x: 100, y: 100,
      points: [{ x: 0, y: 0 }, { x: 40, y: -20 }, { x: 80, y: 10 }],
    }
    expect(boundsOf(path)).toEqual({ minX: 100, minY: 80, maxX: 180, maxY: 110 })
  })

  it('returns null for a path with no points so it cannot be selected', () => {
    expect(boundsOf({ id: 'p', type: 'path', x: 0, y: 0, points: [] })).toBeNull()
  })

  it('bounds a line between its two corners regardless of direction', () => {
    expect(boundsOf({ id: 'l', type: 'line', x: 50, y: 50, w: -30, h: 20 }))
      .toEqual({ minX: 20, minY: 50, maxX: 50, maxY: 70 })
  })

  it('bounds a linked arrow between shape centers, and a free end from the stored frame', () => {
    const source = sticky('s', 0, 0, 80, 40)
    const target = sticky('t', 400, 200, 80, 40)
    const byId = new Map<string, MarqueeElement>([source, target].map(element => [element.id, element]))
    const linked: MarqueeElement = {
      id: 'a', type: 'arrow', x: 0, y: 0, w: 10, h: 10,
      link: { sourceId: 's', targetId: 't' },
    }
    expect(boundsOf(linked, byId)).toEqual({ minX: 40, minY: 20, maxX: 440, maxY: 220 })
    expect(boundsOf({ ...linked, link: { sourceId: 's' } }, byId))
      .toEqual({ minX: 10, minY: 10, maxX: 40, maxY: 20 })
    expect(boundsOf({ ...linked, link: { sourceId: 'gone' } }, byId))
      .toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
  })

  it('bounds a plain arrow from its endpoints', () => {
    expect(boundsOf({ id: 'a', type: 'arrow', x: 10, y: 10, w: 90, h: 40 }))
      .toEqual({ minX: 10, minY: 10, maxX: 100, maxY: 50 })
  })

  it('includes a bend that sits outside the endpoint box', () => {
    expect(boundsOf({
      id: 'a', type: 'arrow', x: 10, y: 10, w: 90, h: 40,
      waypoints: [{ x: 40, y: -15 }],
    })).toEqual({ minX: 10, minY: -15, maxX: 100, maxY: 50 })
  })

  it('re-derives a BPMN flow arrow from its connected nodes, not its stored frame', () => {
    const nodes: MarqueeElement[] = [sticky('s', 0, 0, 80, 80), sticky('t', 400, 300, 80, 80)]
    const flow: MarqueeElement = {
      id: 'f', type: 'arrow', x: 0, y: 0, w: 0, h: 0,
      bpmnFlow: { sourceId: 's', targetId: 't' },
    }
    const byId = new Map(nodes.map(node => [node.id, node]))
    expect(boundsOf(flow, byId)).toEqual({ minX: 40, minY: 40, maxX: 440, maxY: 340 })
    // Without the endpoints it degrades to the stored frame instead of throwing.
    expect(boundsOf(flow)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })

  it('treats touching edges as an intersection', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    expect(intersects(a, { minX: 10, minY: 10, maxX: 20, maxY: 20 })).toBe(true)
    expect(intersects(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false)
    expect(contains(a, { minX: 2, minY: 2, maxX: 8, maxY: 8 })).toBe(true)
    expect(contains(a, { minX: 2, minY: 2, maxX: 12, maxY: 8 })).toBe(false)
  })

  it('selects everything a drag touches, in render order', () => {
    const elements = [sticky('a', 0, 0), sticky('b', 200, 0), sticky('c', 400, 0)]
    expect(selectInRect(elements, normaliseRect({ x: -10, y: -10 }, { x: 250, y: 70 })))
      .toEqual(['a', 'b'])
    expect(selectInRect(elements, normaliseRect({ x: 0, y: 0 }, { x: 1000, y: 100 })))
      .toEqual(['a', 'b', 'c'])
    expect(selectInRect(elements, normaliseRect({ x: 5000, y: 5000 }, { x: 5001, y: 5001 })))
      .toEqual([])
  })

  it('supports contain-mode for precise framing', () => {
    const elements = [sticky('a', 0, 0, 100, 100), sticky('b', 50, 50, 100, 100)]
    const rect = normaliseRect({ x: -10, y: -10 }, { x: 110, y: 110 })
    expect(selectInRect(elements, rect, 'intersect')).toEqual(['a', 'b'])
    expect(selectInRect(elements, rect, 'contain')).toEqual(['a'])
  })

  it('selects an element under a zero-size marquee (a plain click)', () => {
    const elements = [sticky('a', 0, 0)]
    expect(selectInRect(elements, normaliseRect({ x: 50, y: 30 }, { x: 50, y: 30 }))).toEqual(['a'])
    expect(selectInRect(elements, normaliseRect({ x: 500, y: 30 }, { x: 500, y: 30 }))).toEqual([])
  })
})
