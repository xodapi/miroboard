import { describe, expect, it } from 'vitest'
import { formatSnapshotTimestamp } from './TimelinePanel'

describe('TimelinePanel helpers', () => {
  it('formats valid timestamps for the Russian timeline', () => {
    expect(formatSnapshotTimestamp('2026-08-14T10:00:00.000Z')).toContain('2026')
  })

  it('keeps invalid timestamps visible instead of hiding snapshot identity', () => {
    expect(formatSnapshotTimestamp('not-a-date')).toBe('not-a-date')
  })
})
