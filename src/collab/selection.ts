/**
 * Selection as a value.
 *
 * The board used to hold `selectedId: string | null`, which made multi-select
 * impossible and, with it, grouping, marquee, bulk operations and any notion of
 * "what this participant is currently touching" for presence. Selection lives
 * here as pure functions over a `Set<string>` so it can be unit-tested without
 * React and reused by the collaboration layer later.
 *
 * Invariant: the set never contains ids that are not on the board. Callers
 * enforce it with `retainExisting` after elements change.
 */

export type Selection = ReadonlySet<string>

export const EMPTY_SELECTION: Selection = new Set<string>()

export function isSelected(selection: Selection, id: string | null | undefined): boolean {
  return id != null && selection.has(id)
}

export function selectOnly(id: string): Selection {
  return new Set([id])
}

export function selectMany(ids: readonly string[]): Selection {
  return new Set(ids)
}

/** Adds an id, returning a new set (the caller stores it in state). */
export function addToSelection(selection: Selection, id: string): Selection {
  if (selection.has(id)) return selection
  const next = new Set(selection)
  next.add(id)
  return next
}

export function removeFromSelection(selection: Selection, id: string): Selection {
  if (!selection.has(id)) return selection
  const next = new Set(selection)
  next.delete(id)
  return next
}

/** Shift-click semantics: toggle membership, keep everything else. */
export function toggleInSelection(selection: Selection, id: string): Selection {
  return selection.has(id) ? removeFromSelection(selection, id) : addToSelection(selection, id)
}

/** Union, used when a marquee is dragged with Shift held. */
export function unionSelection(selection: Selection, ids: Iterable<string>): Selection {
  const next = new Set(selection)
  for (const id of ids) next.add(id)
  return next
}

export function clearSelection(): Selection {
  return EMPTY_SELECTION
}

/** Drops ids that no longer exist on the board. */
export function retainExisting(selection: Selection, existingIds: Iterable<string>): Selection {
  const existing = existingIds instanceof Set ? existingIds : new Set(existingIds)
  let changed = false
  const next = new Set<string>()
  for (const id of selection) {
    if (existing.has(id)) next.add(id)
    else changed = true
  }
  return changed ? next : selection
}

/**
 * The element the property panels and the resize handles act on: the most
 * recently added member when exactly one is selected, otherwise nothing.
 * Keeping this rule in one place is what stops panels from editing a
 * half-defined "primary" element during a multi-select.
 */
export function primaryOf(selection: Selection): string | null {
  if (selection.size !== 1) return null
  for (const id of selection) return id
  return null
}

/** Insertion-ordered ids, which is the order operations are applied in. */
export function idsOf(selection: Selection): string[] {
  return [...selection]
}
