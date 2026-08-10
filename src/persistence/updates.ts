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

/** Apply one field-level element update, avoiding no-op Yjs transactions. */
export function commitElementUpdate<T extends ElementRecord>(
  doc: Y.Doc,
  elements: Y.Array<T>,
  id: string,
  updates: Partial<T>,
): boolean {
  const index = elements.toArray().findIndex(element => element.id === id)
  if (index < 0) return false
  const current = elements.get(index)
  if (isShallowSubset(current, updates)) return false
  doc.transact(() => {
    elements.delete(index, 1)
    elements.insert(index, [{ ...current, ...updates } as T])
  })
  return true
}
