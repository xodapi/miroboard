import { describe, expect, it } from 'vitest'
import {
  EMPTY_SELECTION, addToSelection, clearSelection, idsOf, isSelected, primaryOf, removeFromSelection,
  retainExisting, selectMany, selectOnly, toggleInSelection, unionSelection,
} from './selection'

describe('selection', () => {
  it('starts empty and reports membership safely', () => {
    expect(clearSelection().size).toBe(0)
    expect(EMPTY_SELECTION.size).toBe(0)
    expect(isSelected(EMPTY_SELECTION, 'a')).toBe(false)
    expect(isSelected(EMPTY_SELECTION, null)).toBe(false)
    expect(isSelected(EMPTY_SELECTION, undefined)).toBe(false)
    expect(isSelected(selectOnly('a'), 'a')).toBe(true)
  })

  it('treats every operation as immutable', () => {
    const base = selectOnly('a')
    const added = addToSelection(base, 'b')
    expect([...base]).toEqual(['a'])
    expect(idsOf(added)).toEqual(['a', 'b'])
    expect(removeFromSelection(added, 'a')).toEqual(new Set(['b']))
    expect(added).not.toBe(base)
  })

  it('returns the same instance when nothing changes (no wasted re-renders)', () => {
    const base = selectMany(['a', 'b'])
    expect(addToSelection(base, 'a')).toBe(base)
    expect(removeFromSelection(base, 'c')).toBe(base)
    expect(retainExisting(base, ['a', 'b', 'c'])).toBe(base)
  })

  it('implements shift-click as a toggle', () => {
    let selection = clearSelection()
    selection = toggleInSelection(selection, 'a')
    selection = toggleInSelection(selection, 'b')
    expect(idsOf(selection)).toEqual(['a', 'b'])
    selection = toggleInSelection(selection, 'a')
    expect(idsOf(selection)).toEqual(['b'])
  })

  it('unions for a shift-marquee without duplicating', () => {
    const selection = unionSelection(selectMany(['a', 'b']), ['b', 'c'])
    expect(idsOf(selection)).toEqual(['a', 'b', 'c'])
  })

  it('exposes a primary element only for a single selection', () => {
    expect(primaryOf(clearSelection())).toBeNull()
    expect(primaryOf(selectOnly('a'))).toBe('a')
    expect(primaryOf(selectMany(['a', 'b']))).toBeNull()
  })

  it('drops ids that no longer exist on the board', () => {
    const selection = selectMany(['a', 'b', 'c'])
    expect(idsOf(retainExisting(selection, ['a', 'c']))).toEqual(['a', 'c'])
    expect(retainExisting(selection, new Set(['a', 'b', 'c']))).toBe(selection)
    expect(retainExisting(selection, []).size).toBe(0)
  })

  it('keeps insertion order so operations are deterministic', () => {
    const selection = selectMany(['z', 'a', 'm'])
    expect(idsOf(selection)).toEqual(['z', 'a', 'm'])
    expect(idsOf(addToSelection(selection, 'b'))).toEqual(['z', 'a', 'm', 'b'])
  })
})
