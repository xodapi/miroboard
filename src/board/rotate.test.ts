import { describe, expect, it } from 'vitest'
import { canRotate, frameTransform, rotationFromPointer } from './rotate'

const center = { cx: 100, cy: 80 }

describe('rotationFromPointer', () => {
  it('is 0 when the pointer is straight above the centre', () => {
    expect(rotationFromPointer(center, { x: 100, y: 40 }, false)).toBe(0)
  })

  it('goes clockwise: right, down, left', () => {
    expect(rotationFromPointer(center, { x: 140, y: 80 }, false)).toBe(90)
    expect(rotationFromPointer(center, { x: 100, y: 120 }, false)).toBe(180)
    expect(rotationFromPointer(center, { x: 60, y: 80 }, false)).toBe(270)
  })

  it('snaps to 15° only while Shift is held', () => {
    // 10° clockwise from upright is just to the right of "above".
    const pointer = { x: 100 + Math.sin(10 * Math.PI / 180) * 40, y: 80 - Math.cos(10 * Math.PI / 180) * 40 }
    expect(rotationFromPointer(center, pointer, false)).toBe(10)
    expect(rotationFromPointer(center, pointer, true)).toBe(15)
  })

  it('stores upright as 0 rather than 360', () => {
    expect(rotationFromPointer(center, { x: 100.1, y: 40 }, true)).toBe(0)
  })
})

describe('frameTransform', () => {
  it('omits a zero rotation so an unrotated board does not change its markup', () => {
    expect(frameTransform({ x: 10, y: 20, w: 40, h: 30 })).toBe('translate(10,20)')
    expect(frameTransform({ x: 10, y: 20, w: 40, h: 30, rotation: 0 })).toBe('translate(10,20)')
  })

  it('spins around the local centre', () => {
    expect(frameTransform({ x: 10, y: 20, w: 40, h: 30, rotation: 90 })).toBe('translate(10,20) rotate(90 20 15)')
  })
})

describe('canRotate', () => {
  it('refuses connectors, whose position is the two endpoints', () => {
    expect(canRotate({ type: 'sticky' })).toBe(true)
    expect(canRotate({ type: 'arrow' })).toBe(false)
    expect(canRotate({ type: 'line' })).toBe(false)
    expect(canRotate({ type: 'arrow', bpmnFlow: { sourceId: 'a', targetId: 'b' } })).toBe(false)
  })
})
