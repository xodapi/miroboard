import * as Y from 'yjs'

export type ElementRecord = { id: string }

/** True when every requested field already has the requested value. */
export function isShallowSubset<T extends object>(
  current: T,
  updates: Partial<T>,
): boolean {
  return Object.keys(updates).every(key => Object.is(
    (current as Record<string, unknown>)[key],
    (updates as Record<string, unknown>)[key],
  ))
}

/**
 * Apply one field-level element update, avoiding no-op Yjs transactions.
 *
 * `origin` labels the write for the UndoManager, the dirty tracker and the
 * checkpoint triggers. It defaults to `undefined` (Yjs's "unlabelled local
 * write") so existing call sites and tests keep working while they migrate to
 * the explicit origins in `src/collab/origins.ts`.
 */
export function commitElementUpdate<T extends ElementRecord>(
  doc: Y.Doc,
  elements: Y.Array<T>,
  id: string,
  updates: Partial<T>,
  origin?: unknown,
): boolean {
  const index = elements.toArray().findIndex(element => element.id === id)
  if (index < 0) return false
  const current = elements.get(index)
  if (isShallowSubset(current, updates)) return false
  doc.transact(() => {
    elements.delete(index, 1)
    elements.insert(index, [{ ...current, ...updates } as T])
  }, origin)
  return true
}

/**
 * Same as `commitElementUpdate`, except an explicit `undefined` deletes the key.
 *
 * Callers that spread a partial must not use this: a missing field and a field
 * set to `undefined` are different, and only the follow path means the latter.
 * A cleared `link` has to leave the record, not sit on it as `undefined`, or
 * the next clone keeps an attachment the user already dropped.
 */
export function commitElementPatch<T extends ElementRecord>(
  doc: Y.Doc,
  elements: Y.Array<T>,
  id: string,
  updates: Partial<T>,
  origin?: unknown,
): boolean {
  const index = elements.toArray().findIndex(element => element.id === id)
  if (index < 0) return false
  const current = elements.get(index)
  if (isShallowSubset(current, updates)) return false
  const next = { ...current, ...updates } as T
  for (const key of Object.keys(updates)) {
    if ((updates as Record<string, unknown>)[key] === undefined) {
      delete (next as Record<string, unknown>)[key]
    }
  }
  doc.transact(() => {
    elements.delete(index, 1)
    elements.insert(index, [next])
  }, origin)
  return true
}
