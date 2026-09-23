import { describe, expect, it } from 'vitest'
import { planStack } from './stack'
import type { BoardElement } from './types'

const box = (id: string, over: Partial<BoardElement> = {}): BoardElement => ({
  id, type: 'rect', x: 0, y: 0, w: 20, h: 20, color: '#000', ...over,
})

describe('planStack', () => {
  it('sends a block to the back in document order, not selection order', () => {
    const elements = [box('a'), box('b'), box('c'), box('d')]
    const plan = planStack(elements, ['d', 'b'], 'back')
    expect(plan?.moving).toEqual(['b', 'd'])
    expect(plan?.stamps).toEqual([
      { id: 'b', zIndex: -2 },
      { id: 'd', zIndex: -1 },
    ])
  })

  it('raises above the highest staying z, and does nothing when already there', () => {
    const elements = [box('a', { zIndex: 4 }), box('b'), box('c', { zIndex: 9 })]
    expect(planStack(elements, ['a'], 'front')).toEqual({
      moving: ['a'],
      stamps: [{ id: 'a', zIndex: 10 }],
    })
    expect(planStack(elements, ['b', 'c'], 'front')).toBeNull()
    expect(planStack(elements, ['a'], 'back')).toBeNull()
    expect(planStack(elements, ['a', 'b', 'c'], 'front')).toBeNull()
    expect(planStack(elements, [], 'back')).toBeNull()
    expect(planStack(elements, ['missing'], 'front')).toBeNull()
  })

  it('pulls an unnamed group mate and a connector whose both ends are selected', () => {
    const flow = box('f', { type: 'arrow', bpmnFlow: { sourceId: 'a', targetId: 'b' } })
    const stray = box('g', { type: 'arrow', bpmnFlow: { sourceId: 'a', targetId: 'c' } })
    const elements = [
      box('a', { groupId: 'grp' }),
      flow,
      box('b', { groupId: 'grp' }),
      stray,
      box('c'),
    ]
    const plan = planStack(elements, ['a'], 'front')
    expect(plan?.moving).toEqual(['a', 'f', 'b'])
    expect(plan?.stamps.map(stamp => stamp.id)).toEqual(['a', 'b'])
  })
})
