import * as Y from 'yjs'
import { LOCAL_EDIT } from '../collab/origins'
import { commitElementUpdate } from '../persistence/updates'
import type { BoardElement } from './types'

/**
 * Every write to the document, as plain functions over a Yjs array.
 *
 * Two rules hold across all of them, and they are the reason this is a module
 * rather than a pile of callbacks in the component:
 *
 * 1. One user action is one transaction. That makes it one undo step, one
 *    automatic-checkpoint increment and one update broadcast to peers. A loop
 *    of single-element writes silently breaks all three — nudging eight
 *    selected elements used to cost eight undo steps.
 * 2. Every write carries an origin. The UndoManager, the dirty tracker and the
 *    checkpoint triggers all filter on it; an unlabelled write is invisible to
 *    them in ways that surface much later.
 *
 * They take the array explicitly and return what changed, so they can be tested
 * against a bare Y.Doc — the previous bulk-operations tests had to re-implement
 * these in the test file and describe themselves as "mirrors" of App.tsx.
 */

export type Elements = Y.Array<BoardElement>

/** Offset between a copy and its source, multiplied by the copy index. */
const DUPLICATE_OFFSET = 20

export function addElement(doc: Y.Doc, elements: Elements, element: BoardElement, origin: unknown = LOCAL_EDIT): void {
  doc.transact(() => { elements.push([element]) }, origin)
}

export function updateElement(
  doc: Y.Doc,
  elements: Elements,
  id: string,
  updates: Partial<BoardElement>,
  origin: unknown = LOCAL_EDIT,
): boolean {
  return commitElementUpdate(doc, elements, id, updates, origin)
}

/** Returns false when the id is not on the board, so callers can skip follow-up state. */
export function deleteElement(doc: Y.Doc, elements: Elements, id: string, origin: unknown = LOCAL_EDIT): boolean {
  const index = elements.toArray().findIndex(element => element.id === id)
  if (index < 0) return false
  doc.transact(() => { elements.delete(index, 1) }, origin)
  return true
}

/**
 * Deletes a whole selection in one transaction.
 *
 * Walks backwards so each delete cannot shift the indices of the ones still to
 * come — the forward loop is the classic way this silently skips elements.
 * Returns how many were removed; zero means no transaction was opened at all,
 * which keeps a delete of nothing from marking the document dirty.
 */
export function deleteElements(doc: Y.Doc, elements: Elements, ids: Iterable<string>, origin: unknown = LOCAL_EDIT): number {
  const wanted = new Set(ids)
  if (!wanted.size) return 0

  const present = elements.toArray().filter(element => wanted.has(element.id)).length
  if (!present) return 0

  doc.transact(() => {
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      if (wanted.has(elements.get(index).id)) elements.delete(index, 1)
    }
  }, origin)
  return present
}

/**
 * Applies the same field updates to several elements in one transaction.
 *
 * Skips elements already holding the requested values, so a no-op update does
 * not open an empty transaction.
 */
export function updateElements(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  updates: Partial<BoardElement>,
  origin: unknown = LOCAL_EDIT,
): number {
  const wanted = [...new Set(ids)]
  if (!wanted.length) return 0

  let changed = 0
  doc.transact(() => {
    for (const id of wanted) {
      if (commitElementUpdate(doc, elements, id, updates, origin)) changed += 1
    }
  }, origin)
  return changed
}

/**
 * Moves a selection by a delta, in one transaction.
 *
 * Reads each element's current position from the document rather than from a
 * caller-supplied snapshot, so a held arrow key cannot compound against stale
 * coordinates.
 */
export function moveElements(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  delta: { x: number; y: number },
  origin: unknown = LOCAL_EDIT,
): number {
  const wanted = new Set(ids)
  if (!wanted.size) return 0
  if (delta.x === 0 && delta.y === 0) return 0

  const picked = elements.toArray().filter(element => wanted.has(element.id))
  if (!picked.length) return 0

  doc.transact(() => {
    for (const element of picked) {
      commitElementUpdate(doc, elements, element.id, { x: element.x + delta.x, y: element.y + delta.y }, origin)
    }
  }, origin)
  return picked.length
}

/**
 * Copies a selection, offsetting each copy a little further than the last.
 *
 * The growing offset is deliberate: duplicating three stacked elements with a
 * fixed offset lands all three copies on the same spot. Returns the new ids in
 * source order so the caller can select the copies.
 */
export function duplicateElements(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  nextId: () => string,
  origin: unknown = LOCAL_EDIT,
): string[] {
  const wanted = new Set(ids)
  const picked = elements.toArray().filter(element => wanted.has(element.id))
  if (!picked.length) return []

  const created: string[] = []
  doc.transact(() => {
    picked.forEach((element, index) => {
      const offset = DUPLICATE_OFFSET * (index + 1)
      const id = nextId()
      created.push(id)
      elements.push([{ ...element, id, x: element.x + offset, y: element.y + offset }])
    })
  }, origin)
  return created
}

/**
 * Raises an element above the rest.
 *
 * Paint order is array order, so this moves the element to the end. The zIndex
 * stamp is a tiebreaker for consumers that sort rather than rely on position.
 */
export function bringToFront(doc: Y.Doc, elements: Elements, id: string, origin: unknown = LOCAL_EDIT): boolean {
  const index = elements.toArray().findIndex(element => element.id === id)
  if (index < 0) return false
  // Already last: moving it would be a no-op transaction that still dirties the
  // document and costs an undo step.
  if (index === elements.length - 1) return false

  const element = elements.get(index)
  doc.transact(() => {
    elements.delete(index, 1)
    elements.push([{ ...element, zIndex: Date.now() }])
  }, origin)
  return true
}

/** Replaces the board contents wholesale — loading a document or a template. */
export function replaceAll(doc: Y.Doc, elements: Elements, next: BoardElement[], origin: unknown): void {
  doc.transact(() => {
    if (elements.length) elements.delete(0, elements.length)
    if (next.length) elements.push(next)
  }, origin)
}
