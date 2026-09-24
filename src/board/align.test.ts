import { describe, expect, it } from 'vitest'
import { snapDragFrames, snapResize, snapResizeFrames, snapTranslation } from './align'
import type { BoardElement } from './types'

const box = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h })

describe('snapTranslation', () => {
  it('does nothing when there is nothing to align to, or the threshold is closed', () => {
    expect(snapTranslation(box(0, 0), [], 8)).toEqual({ dx: 0, dy: 0, guides: [] })
    expect(snapTranslation(box(10, 10), [box(18, 10)], 0).dx).toBe(0)
  })

  it('snaps an edge to a neighbour edge and reports the guide', () => {
    const snap = snapTranslation(box(90, 200), [box(0, 0)], 12)
    expect(snap.dx).toBeCloseTo(10)
    expect(snap.dy).toBe(0)
    expect(snap.guides).toEqual([{ orientation: 'vertical', position: 100 }])
  })

  it('snaps centres when that is closer than any edge', () => {
    // Moving centre is at x=40. Stationary centre is at x=50. Both edges are
    // 20px away, outside the threshold, so the centre is the only candidate.
    const snap = snapTranslation(box(20, 0, 40, 40), [box(0, 200, 100, 40)], 12)
    expect(snap.dx).toBeCloseTo(10)
    expect(snap.guides[0]).toEqual({ orientation: 'vertical', position: 50 })
  })

  it('picks the closer candidate and ignores one past the threshold', () => {
    // Narrow boxes: a 100px default width would put the moving right edge on
    // the far box's left edge and hide the case this test is about.
    const snap = snapTranslation(box(0, 40, 20, 20), [box(6, 0, 20, 20), box(100, 200, 20, 20)], 8)
    // Centre (10) to the near left edge (6) is 4px; left-to-left is 6px.
    // The box at x=100 is outside the threshold and must not win.
    expect(snap.dx).toBeCloseTo(-4)
    expect(snap.guides).toEqual([{ orientation: 'vertical', position: 6 }])
  })

  it('snaps both axes when both are within range', () => {
    const snap = snapTranslation(box(95, 195), [box(0, 0, 100, 200)], 8)
    expect(snap.dx).toBeCloseTo(5)
    expect(snap.dy).toBeCloseTo(5)
    expect(snap.guides).toHaveLength(2)
  })
})

describe('snapDragFrames', () => {
  const elements: BoardElement[] = [
    { id: 'a', type: 'sticky', x: 0, y: 0, w: 100, h: 60, color: '#000' },
    { id: 'b', type: 'sticky', x: 108, y: 40, w: 100, h: 60, color: '#000' },
    { id: 'c', type: 'sticky', x: 400, y: 400, w: 80, h: 80, color: '#000' },
  ]

  it('moves the whole selection by one delta, and does not use itself as a guide', () => {
    const frames = [
      { id: 'b', updates: { x: 108, y: 40 } },
      { id: 'c', updates: { x: 208, y: 40 } },
    ]
    const snapped = snapDragFrames(frames, elements, new Set(['b', 'c']), 8)
    // The group's left edge is 108, neighbour's right edge is 100. Delta -8.
    // Threshold 8 keeps the vertical axis out: the group top is 10px from the
    // neighbour's centre, which must not steal the drag.
    expect(snapped.frames.map(frame => frame.updates.x)).toEqual([100, 200])
    expect(snapped.frames.every(frame => frame.updates.y === 40)).toBe(true)
    expect(snapped.guides).toEqual([{ orientation: 'vertical', position: 100 }])
  })

  it('leaves the frames untouched when nothing is close', () => {
    const frames = [{ id: 'c', updates: { x: 400, y: 400 } }]
    const snapped = snapDragFrames(frames, elements, new Set(['c']), 8)
    expect(snapped.frames).toEqual(frames)
    expect(snapped.guides).toEqual([])
  })
})

describe('snapResize', () => {
  it('snaps the moving edge and leaves the anchored corner where it was', () => {
    // South-east drag: left and top stay. The right edge is 2px short of the neighbour.
    // The neighbour is far above, so the bottom edge has nothing to snap to.
    const snapped = snapResize({ x: 0, y: 200, w: 98, h: 40 }, 'se', [{ x: 100, y: 0, w: 80, h: 50 }], 8)
    expect(snapped.box).toEqual({ x: 0, y: 200, w: 100, h: 40 })
    expect(snapped.guides).toEqual([{ orientation: 'vertical', position: 100 }])
  })

  it('moves the left edge without shifting the right one', () => {
    const snapped = snapResize({ x: 12, y: 0, w: 80, h: 40 }, 'sw', [{ x: 0, y: 200, w: 10, h: 10 }], 8)
    expect(snapped.box.x).toBe(10)
    expect(snapped.box.x + snapped.box.w).toBe(92)
    expect(snapped.guides).toEqual([{ orientation: 'vertical', position: 10 }])
  })

  it('refuses a snap that would shrink the element below the minimum', () => {
    // The only candidate is 4px away, but taking it would make the box 20px wide.
    const box = { x: 0, y: 0, w: 24, h: 40 }
    const snapped = snapResize(box, 'se', [{ x: 20, y: 200, w: 0, h: 40 }], 8, 30)
    expect(snapped.box).toEqual(box)
    expect(snapped.guides).toEqual([])
  })

  it('does not treat a connector or itself as a guide', () => {
    const elements: BoardElement[] = [
      { id: 'box', type: 'rect', x: 0, y: 0, w: 98, h: 40, color: '#000' },
      { id: 'flow', type: 'arrow', x: 100, y: 0, w: 40, h: 0, color: '#000', bpmnFlow: { sourceId: 'a', targetId: 'b' } },
    ]
    const snapped = snapResizeFrames(
      [{ id: 'box', updates: { x: 0, y: 0, w: 98, h: 40 } }],
      elements,
      'box',
      'se',
      8,
    )
    expect(snapped.frames[0].updates).toEqual({ x: 0, y: 0, w: 98, h: 40 })
    expect(snapped.guides).toEqual([])
  })
})
