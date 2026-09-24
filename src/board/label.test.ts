import { describe, expect, it } from 'vitest'
import { captionAnchor, captionPoint, readOffset } from './label'

describe('captionAnchor', () => {
  it('sits on the midpoint of a straight mark', () => {
    expect(captionAnchor([{ x: 0, y: 10 }, { x: 80, y: 10 }])).toEqual({ x: 40, y: 10 })
  })

  it('uses the middle segment of a bent route, not the bounding-box centre', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 40 },
      { x: 80, y: 40 },
      { x: 90, y: 0 },
    ]
    expect(captionAnchor(points)).toEqual({ x: 45, y: 40 })
  })

  it('has nowhere to sit without two ends', () => {
    expect(captionAnchor([])).toBeNull()
    expect(captionAnchor([{ x: 1, y: 2 }])).toBeNull()
  })
})

describe('captionPoint', () => {
  it('adds a shift and treats a missing shift as the route itself', () => {
    const anchor = { x: 10, y: 20 }
    expect(captionPoint(anchor)).toEqual(anchor)
    expect(captionPoint(anchor, { x: 3, y: -8 })).toEqual({ x: 13, y: 12 })
  })
})

describe('readOffset', () => {
  it('keeps a real shift and drops zero, so a caption on the route is absence', () => {
    expect(readOffset({ x: -4, y: 2.5 })).toEqual({ x: -4, y: 2.5 })
    expect(readOffset({ x: 0, y: 0 })).toBeUndefined()
    expect(readOffset({ x: 1, y: Number.NaN })).toBeUndefined()
    expect(readOffset(null)).toBeUndefined()
    expect(readOffset({ x: '1', y: 2 })).toBeUndefined()
  })
})
