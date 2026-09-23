import * as Y from 'yjs'
import { LOCAL_EDIT } from '../collab/origins'
import { commitElementUpdate } from '../persistence/updates'
import { planAlign, type AlignAxis } from './arrange'
import { dissolveAfter, expandIds, retargetGroupIds, type GroupWrite } from './group'
import { isLocked, withLock } from './lock'
import { withStrokeStyle, type StrokeStylePatch } from './stroke-style'
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

/**
 * Returns false when the id is not on the board, so callers can skip follow-up state.
 *
 * A grouped element takes the rest of its group with it, and any connector
 * that touched a removed endpoint is removed too — leaving it would save a
 * dangling edge, which the format rejects.
 */
export function deleteElement(doc: Y.Doc, elements: Elements, id: string, origin: unknown = LOCAL_EDIT): boolean {
  if (!elements.toArray().some(element => element.id === id)) return false
  return commitRemoval(doc, elements, [id], origin) > 0
}

/**
 * Deletes a whole selection in one transaction.
 *
 * The selection is expanded first: a grouped member takes its group, and a
 * connector that lost an endpoint is removed with it. The walk itself goes
 * backwards so each delete cannot shift the indices of the ones still to come.
 * Returns how many were removed; zero means no transaction was opened at all,
 * which keeps a delete of nothing from marking the document dirty.
 */
export function deleteElements(doc: Y.Doc, elements: Elements, ids: Iterable<string>, origin: unknown = LOCAL_EDIT): number {
  const wanted = [...ids]
  if (!wanted.length) return 0
  return commitRemoval(doc, elements, wanted, origin)
}

/**
 * One transaction: drop group tokens that would be left with a single member,
 * then delete. The count is how many elements were actually removed, including
 * group mates and connectors that lost an endpoint — not only the ids the
 * caller named.
 */
function commitRemoval(doc: Y.Doc, elements: Elements, ids: Iterable<string>, origin: unknown): number {
  const list = elements.toArray()
  const present = new Set(list.map(element => element.id))
  const removing = new Set(expandIds(list, ids).filter(id => present.has(id)))
  if (!removing.size) return 0
  for (const element of list) {
    const flow = element.bpmnFlow
    if (flow && !removing.has(element.id) && (removing.has(flow.sourceId) || removing.has(flow.targetId))) {
      removing.add(element.id)
    }
  }
  const clears = dissolveAfter(list, removing)
  doc.transact(() => {
    applyMembership(elements, clears)
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      if (removing.has(elements.get(index).id)) elements.delete(index, 1)
    }
  }, origin)
  return removing.size
}

/**
 * Writes group membership in one transaction.
 *
 * A write without `groupId` deletes the key. Setting it to `undefined` would
 * leave the field on the record, and the next clone would keep the element
 * grouped. A no-op — every named element already holds the requested token —
 * opens no transaction.
 */
export function writeGroupMembership(
  doc: Y.Doc,
  elements: Elements,
  writes: readonly GroupWrite[],
  origin: unknown = LOCAL_EDIT,
): number {
  if (!writes.length) return 0
  const byId = new Map(writes.map(write => [write.id, write.groupId]))
  const willChange = elements.toArray().some(element => byId.has(element.id) && withMembership(element, byId.get(element.id)) !== element)
  if (!willChange) return 0
  let changed = 0
  doc.transact(() => {
    changed = applyMembership(elements, writes)
  }, origin)
  return changed
}

function applyMembership(elements: Elements, writes: readonly GroupWrite[]): number {
  if (!writes.length) return 0
  const byId = new Map(writes.map(write => [write.id, write.groupId]))
  let changed = 0
  for (let index = 0; index < elements.length; index += 1) {
    const current = elements.get(index)
    if (!byId.has(current.id)) continue
    const next = withMembership(current, byId.get(current.id))
    if (next === current) continue
    elements.delete(index, 1)
    elements.insert(index, [next])
    changed += 1
  }
  return changed
}

function withMembership(element: BoardElement, groupId: string | undefined): BoardElement {
  if (element.bpmnFlow || !groupId) {
    if (!('groupId' in element)) return element
    const next = { ...element }
    delete next.groupId
    return next
  }
  if (element.groupId === groupId) return element
  return { ...element, groupId }
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

  // A locked element stays put even when the rest of the selection moves.
  // Skipping it here covers the arrow keys; the pointer path never puts a
  // locked id into the gesture in the first place.
  const picked = elements.toArray().filter(element => wanted.has(element.id) && !isLocked(element))
  if (!picked.length) return 0

  doc.transact(() => {
    for (const element of picked) {
      commitElementUpdate(doc, elements, element.id, { x: element.x + delta.x, y: element.y + delta.y }, origin)
    }
  }, origin)
  return picked.length
}

/**
 * Aligns a selection to one shared edge or center, in one transaction.
 *
 * Each element gets its own x/y: a shared delta cannot express "this one to
 * the left, that one stays". A group moves as a rigid body, a locked unit
 * stays and still defines the edge, and a connector is not written — its
 * arrow follows the endpoints. Already aligned, or fewer than two units,
 * opens no transaction.
 */
export function alignElements(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  axis: AlignAxis,
  origin: unknown = LOCAL_EDIT,
): number {
  const moves = planAlign(elements.toArray(), ids, axis)
  if (!moves.length) return 0
  let changed = 0
  doc.transact(() => {
    for (const move of moves) {
      if (commitElementUpdate(doc, elements, move.id, { x: move.x, y: move.y }, origin)) changed += 1
    }
  }, origin)
  return changed
}

/**
 * Locks or unlocks a selection in one transaction.
 *
 * Unlock deletes the key rather than writing `false`, so an unlocked element
 * serialises exactly as it did before the field existed. A connector is
 * skipped. A no-op opens no transaction.
 */
export function setLocked(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  locked: boolean,
  origin: unknown = LOCAL_EDIT,
): number {
  const wanted = new Set(ids)
  if (!wanted.size) return 0
  const willChange = elements.toArray().some(element => wanted.has(element.id) && withLock(element, locked) !== element)
  if (!willChange) return 0

  let changed = 0
  doc.transact(() => {
    for (let index = 0; index < elements.length; index += 1) {
      const current = elements.get(index)
      if (!wanted.has(current.id)) continue
      const next = withLock(current, locked)
      if (next === current) continue
      elements.delete(index, 1)
      elements.insert(index, [next])
      changed += 1
    }
  }, origin)
  return changed
}

/**
 * Restyles arrows and lines in one transaction.
 *
 * Solid deletes `dash` rather than writing a sentinel, and a headless mark
 * becomes `type: 'line'` — that is the on-disk arrowhead, for both a freeform
 * node and a BPMN edge. A rectangle is skipped. A no-op opens no transaction.
 */
export function setStrokeStyle(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  patch: StrokeStylePatch,
  origin: unknown = LOCAL_EDIT,
): number {
  const wanted = new Set(ids)
  if (!wanted.size) return 0
  const willChange = elements.toArray().some(element => wanted.has(element.id) && withStrokeStyle(element, patch) !== element)
  if (!willChange) return 0

  let changed = 0
  doc.transact(() => {
    for (let index = 0; index < elements.length; index += 1) {
      const current = elements.get(index)
      if (!wanted.has(current.id)) continue
      const next = withStrokeStyle(current, patch)
      if (next === current) continue
      elements.delete(index, 1)
      elements.insert(index, [next])
      changed += 1
    }
  }, origin)
  return changed
}

/**
 * Copies a selection, offsetting each copy a little further than the last.
 *
 * The growing offset is deliberate: duplicating three stacked elements with a
 * fixed offset lands all three copies on the same spot. Returns the new ids in
 * source order so the caller can select the copies.
 *
 * `createdBy` names whoever made the copy, not the author of the original.
 * Duplicating is creating — the profile panel tells the user their id signs the
 * objects they create — and pasting (`preparePaste`) already re-stamps the same
 * way. Without this, duplicating something out of a colleague's file credited
 * the new object to them. Callers that genuinely want to keep the original
 * author simply omit the option.
 */
export function duplicateElements(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  nextId: () => string,
  origin: unknown = LOCAL_EDIT,
  createdBy?: string,
): string[] {
  const wanted = new Set(ids)
  const picked = elements.toArray().filter(element => wanted.has(element.id))
  if (!picked.length) return []

  const created: string[] = []
  const copies: BoardElement[] = []
  picked.forEach((element, index) => {
    const offset = DUPLICATE_OFFSET * (index + 1)
    const id = nextId()
    created.push(id)
    const copy: BoardElement = { ...element, id, x: element.x + offset, y: element.y + offset }
    if (createdBy !== undefined) copy.createdBy = createdBy
    copies.push(copy)
  })
  // A copied group must not stay in the source group, or the next click on a
  // copy would select the originals too. Lone copies drop the token.
  const stamped = retargetGroupIds(copies, () => nextId())
  doc.transact(() => { elements.push(stamped) }, origin)
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
