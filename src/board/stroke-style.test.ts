import { describe, expect, it } from 'vitest'
import {
  LINE_DASHARRAY,
  arrowHeadOf,
  dashOf,
  strokeDasharray,
  withStrokeStyle,
} from './stroke-style'

const arrow: { id: string; type: 'arrow'; stroke: number; color: string; dash?: 'dashed' } = {
  id: 'a', type: 'arrow', stroke: 2, color: '#000',
}

describe('stroke style', () => {
  it('treats a missing dash as solid and an arrow as headed', () => {
    expect(dashOf({})).toBe('solid')
    expect(dashOf({ dash: 'dashed' })).toBe('dashed')
    expect(dashOf({ dash: 'dotted' })).toBe('solid')
    expect(arrowHeadOf({ type: 'arrow' })).toBe('triangle')
    expect(arrowHeadOf({ type: 'line' })).toBe('none')
    expect(strokeDasharray(arrow)).toBeUndefined()
    expect(strokeDasharray({ dash: 'dashed' })).toBe(LINE_DASHARRAY)
  })

  it('writes dashed, deletes it for solid, and turns the head off by changing type', () => {
    const dashed = withStrokeStyle(arrow, { dash: 'dashed', stroke: 7 })
    expect(dashed).toMatchObject({ type: 'arrow', dash: 'dashed', stroke: 7 })

    const solid = withStrokeStyle(dashed, { dash: 'solid', arrowHead: 'none' })
    expect(solid.type).toBe('line')
    expect(solid).not.toHaveProperty('dash')
    expect(solid.stroke).toBe(7)
  })

  it('returns the same object when the line already has that style', () => {
    const dashed = { ...arrow, dash: 'dashed' as const }
    expect(withStrokeStyle(dashed, { dash: 'dashed', arrowHead: 'triangle', stroke: 2 })).toBe(dashed)
    expect(withStrokeStyle(arrow, {})).toBe(arrow)
  })

  it('does not restyle a sticky, a pen stroke, or a rectangle', () => {
    const sticky = { type: 'sticky', color: '#FFD93D' }
    expect(withStrokeStyle(sticky, { dash: 'dashed', arrowHead: 'none', stroke: 12 })).toBe(sticky)
  })
})
