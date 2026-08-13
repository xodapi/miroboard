import { describe, expect, it } from 'vitest'
import type { DocHistory, HistorySnapshot } from '../format/types'
import { DEFAULT_RETENTION, enforceSizeBudget, retainForSave, thin } from './retention'

const now = new Date('2026-08-14T12:00:00.000Z')

function snapshot(id: string, ageHours: number, kind: HistorySnapshot['kind'] = 'auto', bytes = 12): HistorySnapshot {
  return {
    id,
    at: new Date(now.getTime() - ageHours * 60 * 60 * 1000).toISOString(),
    kind,
    ...(kind === 'named' ? { label: id } : {}),
    snapshot: 'x'.repeat(bytes),
    elementCount: 1,
  }
}

function history(snapshots: HistorySnapshot[]): DocHistory {
  return { yjsState: 'state', snapshots, retention: DEFAULT_RETENTION }
}

describe('history retention', () => {
  it('keeps recent autos, all named entries, and the document origin while thinning older autos', () => {
    const first = snapshot('first', 300)
    const autos = Array.from({ length: 30 }, (_, index) => snapshot(`auto-${index}`, 30 - index))
    const named = snapshot('labelled', 299, 'named')

    const retained = thin([first, named, ...autos], { ...DEFAULT_RETENTION, maxSnapshots: 24 }, now)

    expect(retained).toContain(first)
    expect(retained).toContain(named)
    expect(retained.filter(entry => entry.kind === 'auto').slice(-20)).toEqual(autos.slice(-20))
    expect(retained.length).toBeLessThanOrEqual(24)
  })

  it('never drops named or oldest entries when the snapshot count cannot meet the cap', () => {
    const first = snapshot('first', 400)
    const named = Array.from({ length: 125 }, (_, index) => snapshot(`named-${index}`, 200 - index, 'named'))

    const retained = thin([first, ...named], DEFAULT_RETENTION, now)

    expect(retained).toEqual([first, ...named])
  })

  it('drops only non-origin automatic checkpoints to meet the serialised history budget', () => {
    const first = snapshot('first', 40, 'auto', 90)
    const named = snapshot('named', 30, 'named', 90)
    const autos = Array.from({ length: 8 }, (_, index) => snapshot(`auto-${index}`, 8 - index, 'auto', 90))
    const policy = { ...DEFAULT_RETENTION, maxHistoryRatio: 3 }

    const retained = enforceSizeBudget(history([first, named, ...autos]), 120, policy)

    expect(retained.snapshots).toContain(first)
    expect(retained.snapshots).toContain(named)
    expect(retained.snapshots.length).toBeLessThan([first, named, ...autos].length)
    // Named snapshots and the origin intentionally remain even when their
    // combined bytes exceed the budget. The UI must report that condition.
    expect(retained.snapshots.filter(entry => entry.kind === 'auto')).toEqual([first])
  })

  it('applies thinning before the size budget on every save', () => {
    const snapshots = [
      snapshot('first', 400, 'auto', 90),
      ...Array.from({ length: 30 }, (_, index) => snapshot(`auto-${index}`, 30 - index, 'auto', 90)),
    ]
    const retained = retainForSave(history(snapshots), 220, { ...DEFAULT_RETENTION, keepLastAuto: 2, maxSnapshots: 5 })

    expect(retained.snapshots).toContain(snapshots[0])
    expect(retained.snapshots.length).toBeLessThanOrEqual(5)
    expect(new TextEncoder().encode(JSON.stringify(retained)).byteLength).toBeLessThanOrEqual(660)
  })
})
