import { describe, expect, it } from 'vitest'
import type { BoardElement } from './types'
import {
  GROUP_OUTLINE_PAD,
  clickTargets,
  dissolveAfter,
  expandIds,
  groupOutlines,
  planGroup,
  planUngroup,
  retargetGroupIds,
  toggleGrouped,
} from './group'

function el(id: string, over: Partial<BoardElement> = {}): BoardElement {
  return { id, type: 'rect', x: 0, y: 0, w: 10, h: 10, color: '#000', ...over }
}

function flow(id: string, sourceId: string, targetId: string, over: Partial<BoardElement> = {}): BoardElement {
  return { id, type: 'arrow', x: 0, y: 0, color: '#000', bpmnFlow: { sourceId, targetId }, ...over }
}

describe('clickTargets', () => {
  it('does not expand an ungrouped click', () => {
    expect(clickTargets([el('a'), el('b')], 'a')).toEqual(['a'])
    expect(clickTargets([el('a')], 'missing')).toEqual(['missing'])
  })

  it('expands to every member, in document order, only when a real group exists', () => {
    const elements = [el('a', { groupId: 'g' }), el('b'), el('c', { groupId: 'g' })]
    expect(clickTargets(elements, 'c')).toEqual(['a', 'c'])
  })

  it('ignores a connector that happens to carry a token', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), flow('f', 'a', 'b', { groupId: 'g' })]
    expect(clickTargets(elements, 'f')).toEqual(['f'])
    expect(clickTargets(elements, 'a')).toEqual(['a', 'b'])
  })

  it('does not treat a leftover singleton as a group', () => {
    expect(clickTargets([el('a', { groupId: 'g' })], 'a')).toEqual(['a'])
  })
})

describe('toggleGrouped', () => {
  it('toggles one ungrouped id and leaves the rest', () => {
    const next = toggleGrouped(new Set(['a']), [el('a'), el('b')], 'b')
    expect([...next]).toEqual(['a', 'b'])
  })

  it('adds or removes the whole group, never one member', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c')]
    const added = toggleGrouped(new Set(['c']), elements, 'a')
    expect([...added].sort()).toEqual(['a', 'b', 'c'])
    const removed = toggleGrouped(added, elements, 'b')
    expect([...removed]).toEqual(['c'])
  })
})

describe('expandIds', () => {
  it('keeps an ungrouped selection in the order it was given', () => {
    expect(expandIds([el('a'), el('b'), el('c')], ['c', 'a'])).toEqual(['c', 'a'])
  })

  it('appends missing members in document order without reshuffling the request', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c')]
    expect(expandIds(elements, ['b'])).toEqual(['b', 'a'])
  })

  it('adds a notation edge only when both ends are in the set', () => {
    const edge = el('flow', {
      type: 'arrow',
      link: { sourceId: 'a', targetId: 'b' },
      notation: { id: 'eepc', symbol: 'controlFlow', relation: 'controlFlow' },
    })
    expect(expandIds([el('a'), el('b'), edge], ['a'])).toEqual(['a'])
    expect(expandIds([el('a'), el('b'), edge], ['a', 'b'])).toEqual(['a', 'b', 'flow'])
  })

  it('adds a connector only when both ends are in the set', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c'), flow('ab', 'a', 'b'), flow('ac', 'a', 'c')]
    expect(expandIds(elements, ['a'])).toEqual(['a', 'b', 'ab'])
    expect(expandIds([el('a'), el('b'), flow('ab', 'a', 'b')], ['a'])).toEqual(['a'])
    expect(expandIds([el('a'), el('b'), flow('ab', 'a', 'b')], ['b', 'a'])).toEqual(['b', 'a', 'ab'])
  })

  it('does not repeat an id that was already requested', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), flow('ab', 'a', 'b')]
    expect(expandIds(elements, ['ab', 'a'])).toEqual(['ab', 'a', 'b'])
  })
})

describe('planGroup', () => {
  it('refuses a selection of fewer than two non-connector elements', () => {
    expect(planGroup([el('a'), flow('f', 'a', 'a')], ['a', 'f'], 'grp')).toEqual({ kind: 'too-small' })
    expect(planGroup([el('a'), el('b')], [], 'grp')).toEqual({ kind: 'too-small' })
    expect(planGroup([el('a'), el('b')], ['a', 'b'], '')).toEqual({ kind: 'too-small' })
  })

  it('assigns one fresh token and does not put it on a connector', () => {
    const elements = [el('a'), el('b'), flow('f', 'a', 'b')]
    expect(planGroup(elements, ['a', 'b', 'f'], 'grp_1')).toEqual({
      kind: 'group',
      writes: [{ id: 'a', groupId: 'grp_1' }, { id: 'b', groupId: 'grp_1' }],
    })
  })

  it('is a no-op when the selection is already exactly that group', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c')]
    expect(planGroup(elements, ['a', 'b'], 'grp_new')).toEqual({ kind: 'already' })
  })

  it('clears leftovers when stealing members leaves fewer than two', () => {
    const elements = [el('a', { groupId: 'old' }), el('b', { groupId: 'old' }), el('c')]
    expect(planGroup(elements, ['a', 'c'], 'grp_new')).toEqual({
      kind: 'group',
      writes: [
        { id: 'b' },
        { id: 'a', groupId: 'grp_new' },
        { id: 'c', groupId: 'grp_new' },
      ],
    })
  })

  it('leaves an old group intact when two or more members stay behind', () => {
    const elements = [el('a', { groupId: 'old' }), el('b', { groupId: 'old' }), el('c', { groupId: 'old' }), el('d')]
    const plan = planGroup(elements, ['a', 'd'], 'grp_new')
    expect(plan).toEqual({
      kind: 'group',
      writes: [{ id: 'a', groupId: 'grp_new' }, { id: 'd', groupId: 'grp_new' }],
    })
  })
})

describe('planUngroup', () => {
  it('clears every member of a touched group, not only the selected one', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c', { groupId: 'other' })]
    expect(planUngroup(elements, ['a'])).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('clears nothing when the selection is ungrouped', () => {
    expect(planUngroup([el('a'), el('b', { groupId: 'g' })], ['a'])).toEqual([])
  })
})

describe('dissolveAfter', () => {
  it('clears a group that would be left with one member', () => {
    const elements = [el('a', { groupId: 'g' }), el('b', { groupId: 'g' }), el('c', { groupId: 'g' })]
    expect(dissolveAfter(elements, new Set(['a', 'b']))).toEqual([{ id: 'c' }])
    expect(dissolveAfter(elements, new Set(['a', 'b', 'c']))).toEqual([])
    expect(dissolveAfter(elements, new Set(['a']))).toEqual([])
  })
})

describe('retargetGroupIds', () => {
  it('gives each copied group a fresh token and leaves a lone copy ungrouped', () => {
    const copies = [
      el('a2', { groupId: 'g' }),
      el('b2', { groupId: 'g' }),
      el('c2', { groupId: 'other' }),
    ]
    const next = retargetGroupIds(copies, token => `${token}-copy`)
    expect(next.map(element => element.groupId)).toEqual(['g-copy', 'g-copy', undefined])
    expect(next[2]).not.toHaveProperty('groupId')
    expect(copies[0].groupId).toBe('g')
  })

  it('keeps two source groups apart', () => {
    const next = retargetGroupIds(
      [el('a', { groupId: 'g1' }), el('b', { groupId: 'g1' }), el('c', { groupId: 'g2' }), el('d', { groupId: 'g2' })],
      token => `new-${token}`,
    )
    expect(next.map(element => element.groupId)).toEqual(['new-g1', 'new-g1', 'new-g2', 'new-g2'])
  })

  it('strips a token that was sitting on a connector', () => {
    const next = retargetGroupIds([flow('f', 'a', 'b', { groupId: 'g' })], () => 'unused')
    expect(next[0]).not.toHaveProperty('groupId')
  })
})

describe('groupOutlines', () => {
  it('frames every member when any one of them is selected, and ignores ungrouped selections', () => {
    const elements = [
      el('a', { x: 0, y: 10, w: 10, h: 10, groupId: 'g' }),
      el('b', { x: 30, y: 40, w: 10, h: 20, groupId: 'g' }),
      el('c', { x: 100, y: 100, w: 10, h: 10 }),
    ]
    expect(groupOutlines(elements, ['b'])).toEqual([{
      groupId: 'g',
      x: 0 - GROUP_OUTLINE_PAD,
      y: 10 - GROUP_OUTLINE_PAD,
      w: 40 + GROUP_OUTLINE_PAD * 2,
      h: 50 + GROUP_OUTLINE_PAD * 2,
    }])
    expect(groupOutlines(elements, ['c'])).toEqual([])
    expect(groupOutlines(elements, [])).toEqual([])
  })
})
