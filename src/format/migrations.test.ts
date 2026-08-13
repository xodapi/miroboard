import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadMboard } from './schema'
import { runMigrations } from './migrations'

describe('format migrations', () => {
  it('executes the shipped v0 fixture migration and adds v1 fields', () => {
    const source = JSON.parse(readFileSync('examples/legacy/v0-synthetic.mboard', 'utf8')) as Record<string, unknown>
    const result = loadMboard(source)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migratedFrom).toBe(0)
    expect(result.file.schemaVersion).toBe(1)
    expect(result.file.profileConfig).toEqual({})
    expect(result.file.assets).toEqual({})
    expect(result.file.nodes.every(node => node.parentId === null)).toBe(true)
  })

  it('reports a missing link in the forward-only chain', () => {
    expect(() => runMigrations({ format: 'mboard', schemaVersion: 0 }, -1))
      .toThrow('No migration path from schemaVersion -1')
  })
})
