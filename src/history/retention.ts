import type { DocHistory, HistorySnapshot, RetentionPolicy } from '../format/types'

export const DEFAULT_RETENTION: RetentionPolicy = {
  keepAllNamed: true,
  keepLastAuto: 20,
  decayBucketsHours: [1, 6, 24, 168],
  maxSnapshots: 120,
  maxHistoryRatio: 3,
}

const encoder = new TextEncoder()

function timestamp(snapshot: HistorySnapshot): number {
  const value = Date.parse(snapshot.at)
  return Number.isNaN(value) ? 0 : value
}

function oldestSnapshot(snapshots: readonly HistorySnapshot[]): HistorySnapshot | undefined {
  return snapshots.reduce<HistorySnapshot | undefined>((oldest, candidate) =>
    oldest === undefined || timestamp(candidate) < timestamp(oldest) ? candidate : oldest,
  undefined)
}

function historyBytes(history: DocHistory): number {
  return encoder.encode(JSON.stringify(history)).byteLength
}

function without(snapshot: HistorySnapshot[], removed: HistorySnapshot): HistorySnapshot[] {
  const index = snapshot.findIndex(candidate => candidate.id === removed.id)
  return index < 0 ? snapshot : [...snapshot.slice(0, index), ...snapshot.slice(index + 1)]
}

function isSemanticallyImportant(snapshot: HistorySnapshot): boolean {
  return snapshot.kind === 'named' || snapshot.kind === 'restore-transition'
}

/**
 * Retains named and restore-transition checkpoints, the recent automatic window,
 * a progressively sparse representative in each older age bucket, and the document origin.
 */
export function thin(snapshots: HistorySnapshot[], policy: RetentionPolicy, now: Date): HistorySnapshot[] {
  const origin = oldestSnapshot(snapshots)
  const automatic = snapshots.filter(snapshot => snapshot.kind === 'auto')
    .sort((left, right) => timestamp(right) - timestamp(left))
  const keep = new Set<string>()

  for (const snapshot of snapshots) {
    if (isSemanticallyImportant(snapshot) && policy.keepAllNamed) keep.add(snapshot.id)
  }
  if (origin) keep.add(origin.id)
  for (const snapshot of automatic.slice(0, policy.keepLastAuto)) keep.add(snapshot.id)

  let lowerBound = policy.keepLastAuto > 0 && automatic[policy.keepLastAuto - 1]
    ? Math.max(0, now.getTime() - timestamp(automatic[policy.keepLastAuto - 1])) / 3_600_000
    : 0
  for (const upperBound of policy.decayBucketsHours) {
    const candidate = automatic.find(snapshot => {
      const age = Math.max(0, now.getTime() - timestamp(snapshot)) / 3_600_000
      return age > lowerBound && age <= upperBound
    })
    if (candidate) keep.add(candidate.id)
    lowerBound = upperBound
  }
  const beyondFinalBucket = automatic.find(snapshot =>
    (now.getTime() - timestamp(snapshot)) / 3_600_000 > lowerBound,
  )
  if (beyondFinalBucket) keep.add(beyondFinalBucket.id)

  let retained = snapshots.filter(snapshot => keep.has(snapshot.id))
  while (retained.length > policy.maxSnapshots) {
    const removable = retained
      .filter(snapshot => snapshot.kind === 'auto' && snapshot.id !== origin?.id)
      .sort((left, right) => timestamp(left) - timestamp(right))[0]
    if (!removable) break
    retained = without(retained, removable)
  }
  return retained
}

/** Removes only old automatic pointers, never semantic checkpoints or the first checkpoint. */
export function enforceSizeBudget(history: DocHistory, currentStateBytes: number, policy: RetentionPolicy): DocHistory {
  const maximum = Math.max(0, currentStateBytes * policy.maxHistoryRatio)
  let snapshots = [...history.snapshots]
  const origin = oldestSnapshot(snapshots)
  let candidate = { ...history, snapshots }

  while (historyBytes(candidate) > maximum) {
    const removable = snapshots
      .filter(snapshot => snapshot.kind === 'auto' && snapshot.id !== origin?.id)
      .sort((left, right) => timestamp(left) - timestamp(right))[0]
    if (!removable) break
    snapshots = without(snapshots, removable)
    candidate = { ...history, snapshots }
  }
  return candidate
}

/** The save pipeline must thin by age before evaluating the serialized byte budget. */
export function retainForSave(history: DocHistory, currentStateBytes: number, policy: RetentionPolicy, now = new Date()): DocHistory {
  return enforceSizeBudget(
    { ...history, snapshots: thin(history.snapshots, policy, now) },
    currentStateBytes,
    policy,
  )
}
