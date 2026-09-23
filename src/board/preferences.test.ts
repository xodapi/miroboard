import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_UI_PREFERENCES,
  readUiPreferences,
  UI_PREFS_KEY,
  writeUiPreferences,
  type UiPreferences,
} from './preferences'

function memory(initial: Record<string, string> = {}): Storage {
  const data = { ...initial }
  return {
    get length() { return Object.keys(data).length },
    clear: () => { for (const key of Object.keys(data)) delete data[key] },
    getItem: (key: string) => data[key] ?? null,
    key: (index: number) => Object.keys(data)[index] ?? null,
    removeItem: (key: string) => { delete data[key] },
    setItem: (key: string, value: string) => { data[key] = value },
  }
}

describe('readUiPreferences', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(readUiPreferences(memory())).toEqual(DEFAULT_UI_PREFERENCES)
  })

  it('keeps a valid stored preference and fills holes from the defaults', () => {
    const storage = memory({ [UI_PREFS_KEY]: JSON.stringify({ darkMode: true, color: '#4D96FF' }) })
    expect(readUiPreferences(storage)).toEqual({
      ...DEFAULT_UI_PREFERENCES,
      darkMode: true,
      color: '#4D96FF',
    })
  })

  it('rejects a corrupt store, a non-object, and an out-of-range stroke', () => {
    expect(readUiPreferences(memory({ [UI_PREFS_KEY]: '{not json' }))).toEqual(DEFAULT_UI_PREFERENCES)
    expect(readUiPreferences(memory({ [UI_PREFS_KEY]: '[]' }))).toEqual(DEFAULT_UI_PREFERENCES)
    expect(readUiPreferences(memory({ [UI_PREFS_KEY]: JSON.stringify({ strokeWidth: 0, color: '' }) }))).toEqual(DEFAULT_UI_PREFERENCES)
  })

  it('does not throw when the store itself throws', () => {
    const storage = { getItem: () => { throw new Error('denied') } }
    expect(readUiPreferences(storage)).toEqual(DEFAULT_UI_PREFERENCES)
  })
})

describe('writeUiPreferences', () => {
  it('round-trips through the same key', () => {
    const storage = memory()
    const prefs: UiPreferences = { ...DEFAULT_UI_PREFERENCES, snapGrid: true, strokeWidth: 8 }
    writeUiPreferences(storage, prefs)
    expect(readUiPreferences(storage)).toEqual(prefs)
  })

  it('swallows a store that refuses the write', () => {
    const storage = { setItem: vi.fn(() => { throw new Error('quota') }) }
    expect(() => writeUiPreferences(storage, DEFAULT_UI_PREFERENCES)).not.toThrow()
  })
})
