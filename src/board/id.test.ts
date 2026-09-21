import { afterEach, describe, expect, it } from 'vitest'
import { genId } from './id'

const realCrypto = globalThis.crypto

function stubCrypto(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true })
}

afterEach(() => {
  stubCrypto(realCrypto)
})

describe('genId', () => {
  it('produces distinct RFC4122-shaped ids by default', () => {
    const ids = new Set(Array.from({ length: 500 }, () => genId()))
    expect(ids.size).toBe(500)
    const [sample] = ids
    expect(sample).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('falls back to getRandomValues where randomUUID is missing', () => {
    const bytes = new Uint8Array(16).fill(0xab)
    stubCrypto({ getRandomValues: (target: Uint8Array) => { target.set(bytes); return target } })
    expect(genId()).toBe('ab'.repeat(8))
  })

  it('still produces usable, distinct ids with no Web Crypto at all', () => {
    stubCrypto(undefined)
    const ids = new Set(Array.from({ length: 200 }, () => genId()))
    expect(ids.size).toBeGreaterThan(190)
    for (const id of ids) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(8)
    }
  })
})
