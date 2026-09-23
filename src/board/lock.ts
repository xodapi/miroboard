/**
 * Object lock.
 *
 * A locked object stays where it is. Drag, keyboard nudge, resize and rotate
 * all refuse it. Selection still works, so the same object can be unlocked.
 * The flag is `locked: true` on the element and the same field on the node;
 * absence means unlocked, and a connector cannot carry it because a connector
 * follows its endpoints rather than its own box.
 */

export function isLocked(element: { locked?: boolean } | null | undefined): boolean {
  return element?.locked === true
}

/**
 * What the lock control should do to this selection.
 *
 * Connectors are skipped: they have no box of their own. A mixed selection
 * locks, so one click protects everything that can still move. `null` means
 * there is nothing the control can act on.
 */
export function selectionLockAction(
  elements: readonly { id: string; locked?: boolean; bpmnFlow?: unknown }[],
  ids: ReadonlySet<string>,
): 'lock' | 'unlock' | null {
  const targets = elements.filter(element => ids.has(element.id) && !element.bpmnFlow)
  if (!targets.length) return null
  return targets.every(isLocked) ? 'unlock' : 'lock'
}

/**
 * Sets or clears the flag without leaving `locked: false` on the record.
 *
 * A leftover `false` would be written to the file, so an unlocked board would
 * no longer match a file from before the field existed. Connectors are
 * returned unchanged.
 */
export function withLock<T extends { id?: string; locked?: boolean; bpmnFlow?: unknown }>(element: T, locked: boolean): T {
  if (element.bpmnFlow) return element
  if (locked) {
    if (element.locked === true) return element
    return { ...element, locked: true }
  }
  if (!('locked' in element)) return element
  const next = { ...element }
  delete next.locked
  return next
}
