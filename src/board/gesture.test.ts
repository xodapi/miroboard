import { describe, expect, it } from 'vitest'
import { dragFrame, MIN_ELEMENT_SIZE, resizeFrame, type DragInfo, type ResizeInfo } from './gesture'
import type { Point } from './types'

const p = (x: number, y: number): Point => ({ x, y })
const snap20 = (value: number) => Math.round(value / 20) * 20

function drag(overrides: Partial<DragInfo> = {}): DragInfo {
  return {
    startX: 100,
    startY: 100,
    items: [{ id: 'a', x: 100, y: 100 }],
    ...overrides,
  }
}

function resize(overrides: Partial<ResizeInfo> = {}): ResizeInfo {
  return {
    id: 'a',
    corner: 'se',
    startX: 200,
    startY: 160,
    elX: 100,
    elY: 100,
    elW: 100,
    elH: 60,
    ...overrides,
  }
}

describe('dragFrame', () => {
  it('moves a single element by the pointer delta', () => {
    expect(dragFrame(drag(), p(150, 120))).toEqual([{ id: 'a', updates: { x: 150, y: 120 } }])
  })

  it('publishes a park only once the pointer has moved', () => {
    const info = drag({
      items: [{ id: 'a', x: 10, y: 20, extras: { w: 30, h: 40, link: undefined } }],
    })
    expect(dragFrame(info, p(100, 100))).toEqual([{ id: 'a', updates: { x: 10, y: 20 } }])
    expect(dragFrame(info, p(110, 100))).toEqual([
      { id: 'a', updates: { w: 30, h: 40, link: undefined, x: 20, y: 20 } },
    ])
  })

  it('moves every element of a group by the same delta, keeping the layout', () => {
    const info = drag({
      items: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 400, y: 300 },
      ],
    })
    expect(dragFrame(info, p(130, 110))).toEqual([
      { id: 'a', updates: { x: 130, y: 110 } },
      { id: 'b', updates: { x: 430, y: 310 } },
    ])
  })

  it('a release with no movement is a no-op frame, not a jump', () => {
    expect(dragFrame(drag(), p(100, 100))).toEqual([{ id: 'a', updates: { x: 100, y: 100 } }])
  })

  it('snaps the whole group through its first element', () => {
    const info = drag({
      items: [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 405, y: 305 },
      ],
    })
    // 100 + 7 = 107 snaps to 100, so the delta is 0 and the group holds still
    expect(dragFrame(info, p(107, 107), snap20)).toEqual([
      { id: 'a', updates: { x: 100, y: 100 } },
      { id: 'b', updates: { x: 405, y: 305 } },
    ])
    // 100 + 14 = 114 snaps to 120, so both move by 20
    expect(dragFrame(info, p(114, 114), snap20)).toEqual([
      { id: 'a', updates: { x: 120, y: 120 } },
      { id: 'b', updates: { x: 425, y: 325 } },
    ])
  })

  it('an empty selection produces no frames', () => {
    expect(dragFrame(drag({ items: [] }), p(200, 200))).toEqual([])
  })
})

describe('resizeFrame', () => {
  it('grows from the south-east corner, leaving the origin fixed', () => {
    expect(resizeFrame(resize(), p(250, 200))).toEqual([
      { id: 'a', updates: { x: 100, y: 100, w: 150, h: 100 } },
    ])
  })

  it('moves the origin when dragging the north-west corner', () => {
    expect(resizeFrame(resize({ corner: 'nw', startX: 100, startY: 100 }), p(70, 80))).toEqual([
      { id: 'a', updates: { x: 70, y: 80, w: 130, h: 80 } },
    ])
  })

  it('handles the remaining two corners', () => {
    expect(resizeFrame(resize({ corner: 'ne', startX: 200, startY: 100 }), p(240, 70))).toEqual([
      { id: 'a', updates: { x: 100, y: 70, w: 140, h: 90 } },
    ])
    expect(resizeFrame(resize({ corner: 'sw', startX: 100, startY: 160 }), p(60, 200))).toEqual([
      { id: 'a', updates: { x: 60, y: 100, w: 140, h: 100 } },
    ])
  })

  it('never inverts or collapses a shape past the minimum size', () => {
    const frame = resizeFrame(resize(), p(0, 0))[0]
    expect(frame.updates.w).toBe(MIN_ELEMENT_SIZE)
    expect(frame.updates.h).toBe(MIN_ELEMENT_SIZE)
    expect(frame.updates.x).toBe(100)
    expect(frame.updates.y).toBe(100)
  })

  it('snaps the resulting box when snapping is on', () => {
    // 100+54 = 154 snaps to 160, 60+45 = 105 snaps to 100
    expect(resizeFrame(resize(), p(254, 205), snap20)).toEqual([
      { id: 'a', updates: { x: 100, y: 100, w: 160, h: 100 } },
    ])
  })
})
