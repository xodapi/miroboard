import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_NAME, LEGACY_AUTHOR_ID_KEY, PARTICIPANT_COLORS, PROFILE_STORAGE_KEY,
  colorForId, createProfile, initialOf, readProfile, withColor, withName, writeProfile,
} from './user-profile'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, String(value)) },
    removeItem: (key: string) => { map.delete(key) },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  } as Storage
}

describe('user profile', () => {
  let storage: Storage
  beforeEach(() => { storage = memoryStorage() })

  it('creates a profile with a stable derived colour', () => {
    const profile = createProfile('author-1')
    expect(profile).toEqual({ id: 'author-1', name: DEFAULT_PROFILE_NAME, color: colorForId('author-1') })
    expect(PARTICIPANT_COLORS).toContain(profile.color)
    expect(colorForId('author-1')).toBe(colorForId('author-1'))
  })

  it('adopts the legacy anonymous author id on first read', () => {
    storage.setItem(LEGACY_AUTHOR_ID_KEY, 'legacy-uuid')
    const profile = readProfile(storage, () => 'fresh-id')
    expect(profile.id).toBe('legacy-uuid')
    expect(profile.name).toBe(DEFAULT_PROFILE_NAME)
    expect(profile.color).toBe(colorForId('legacy-uuid'))
  })

  it('generates and keeps an id when nothing is stored', () => {
    const first = readProfile(storage, () => 'generated-1')
    expect(first.id).toBe('generated-1')
    writeProfile(storage, first)
    const second = readProfile(storage, () => 'generated-2')
    expect(second).toEqual(first)
  })

  it('round-trips a custom name and colour', () => {
    writeProfile(storage, createProfile('a1', 'Алиса', '#00A8A8'))
    const profile = readProfile(storage, () => 'x')
    expect(profile).toEqual({ id: 'a1', name: 'Алиса', color: '#00A8A8' })
  })

  it('recovers from corrupted or missing fields without throwing', () => {
    storage.setItem(PROFILE_STORAGE_KEY, '{not json')
    expect(readProfile(storage, () => 'fallback').id).toBe('fallback')

    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ id: 'kept', name: 42, color: null }))
    const repaired = readProfile(storage, () => 'fallback')
    expect(repaired).toEqual({ id: 'kept', name: DEFAULT_PROFILE_NAME, color: colorForId('kept') })

    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ name: 'no id' }))
    expect(readProfile(storage, () => 'fallback2').id).toBe('fallback2')
  })

  it('survives a storage that throws (private mode)', () => {
    const hostile = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    } as unknown as Storage
    expect(() => writeProfile(hostile, createProfile('a'))).not.toThrow()
    expect(readProfile(hostile, () => 'still-works').id).toBe('still-works')
  })

  it('normalises empty names and never changes the id', () => {
    const profile = createProfile('a1', 'Алиса')
    expect(withName(profile, '   ')).toEqual({ ...profile, name: DEFAULT_PROFILE_NAME })
    expect(withName(profile, '  Боб  ').name).toBe('Боб')
    expect(withColor(profile, '#FF5D5D')).toEqual({ ...profile, color: '#FF5D5D' })
    expect(withColor(withName(profile, 'Боб'), '#FF5D5D').id).toBe('a1')
  })

  it('derives a single avatar initial', () => {
    expect(initialOf('Алиса')).toBe('А')
    expect(initialOf('  bob  ')).toBe('B')
    expect(initialOf('')).toBe('•')
    expect(initialOf('🚀 start')).toBe('🚀')
  })
})
