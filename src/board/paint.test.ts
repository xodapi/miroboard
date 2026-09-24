import { describe, expect, it } from 'vitest'
import { isNoFill, NO_FILL, paintChannels, paintPatch } from './paint'

describe('paintChannels', () => {
  it('paints a sticky interior and a BPMN glyph stroke, never both from one control', () => {
    expect(paintChannels({ type: 'sticky' })).toEqual(['fill'])
    expect(paintChannels({ type: 'sticky', bpmnNodeType: 'task' })).toEqual(['stroke'])
    expect(paintChannels({ type: 'rect' })).toEqual(['fill', 'stroke'])
    expect(paintChannels({ type: 'circle' })).toEqual(['fill', 'stroke'])
  })

  it('does not offer a palette for a connector or a stroke-only mark', () => {
    expect(paintChannels({ type: 'arrow', bpmnFlow: { sourceId: 'a', targetId: 'b' } })).toEqual([])
    expect(paintChannels({ type: 'line' })).toEqual([])
    expect(paintChannels({ type: 'text' })).toEqual([])
    expect(paintChannels({ type: 'path' })).toEqual([])
    expect(paintChannels(null)).toEqual([])
  })
})

describe('paintPatch', () => {
  it('writes exactly one field, so fill and stroke can differ', () => {
    expect(paintPatch('fill', '#FFD93D')).toEqual({ fill: '#FFD93D' })
    expect(paintPatch('fill', '#FFD93D')).not.toHaveProperty('color')
    expect(paintPatch('stroke', '#000000')).toEqual({ color: '#000000' })
    expect(paintPatch('stroke', '#000000')).not.toHaveProperty('fill')
    expect(paintPatch('fill', NO_FILL)).toEqual({ fill: 'transparent' })
  })
})

describe('isNoFill', () => {
  it('treats a missing fill and the explicit clear the same', () => {
    expect(isNoFill(undefined)).toBe(true)
    expect(isNoFill(null)).toBe(true)
    expect(isNoFill('')).toBe(true)
    expect(isNoFill('transparent')).toBe(true)
    expect(isNoFill('none')).toBe(true)
    expect(isNoFill('#FFD93D')).toBe(false)
  })
})
