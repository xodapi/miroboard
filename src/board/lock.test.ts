import { describe, expect, it } from 'vitest'
import { isLocked, selectionLockAction, withLock } from './lock'

const node = (id: string, over: { locked?: boolean; bpmnFlow?: { sourceId: string; targetId: string } } = {}) => ({
  id, ...over,
})

describe('isLocked', () => {
  it('is true only for an explicit true', () => {
    expect(isLocked({ locked: true })).toBe(true)
    expect(isLocked({})).toBe(false)
    expect(isLocked({ locked: false })).toBe(false)
    expect(isLocked(undefined)).toBe(false)
  })
})

describe('selectionLockAction', () => {
  it('locks when any target can still move, and unlocks only when every target is locked', () => {
    const elements = [node('a'), node('b', { locked: true }), node('flow', { bpmnFlow: { sourceId: 'a', targetId: 'b' } })]
    expect(selectionLockAction(elements, new Set(['a']))).toBe('lock')
    expect(selectionLockAction(elements, new Set(['a', 'b']))).toBe('lock')
    expect(selectionLockAction(elements, new Set(['b']))).toBe('unlock')
  })

  it('ignores a connector, which follows its endpoints', () => {
    const elements = [node('flow', { bpmnFlow: { sourceId: 'a', targetId: 'b' } })]
    expect(selectionLockAction(elements, new Set(['flow']))).toBeNull()
    expect(selectionLockAction(elements, new Set(['missing']))).toBeNull()
  })
})

describe('withLock', () => {
  it('writes true and deletes the key on unlock, so false is never stored', () => {
    const locked = withLock({ id: 'a' }, true)
    expect(locked).toEqual({ id: 'a', locked: true })
    const unlocked = withLock(locked, false)
    expect(unlocked).toEqual({ id: 'a' })
    expect(unlocked).not.toHaveProperty('locked')
  })

  it('returns the same object when the flag would not change', () => {
    const element = { id: 'a', locked: true as const }
    expect(withLock(element, true)).toBe(element)
    const open = { id: 'a' }
    expect(withLock(open, false)).toBe(open)
  })

  it('does not put the flag on a connector', () => {
    const flow = { id: 'f', bpmnFlow: { sourceId: 'a', targetId: 'b' } }
    expect(withLock(flow, true)).toBe(flow)
  })
})
