import * as Y from 'yjs'
import { PASTE_OFFSET, preparePaste } from '../collab/clipboard'
import { LOCAL_EDIT } from '../collab/origins'
import { commitElementPatch, commitElementUpdate } from '../persistence/updates'
import { planAlign, type AlignAxis } from './arrange'
import { parkForMove, patchesForRemoval, withDrawnLine } from './follow'
import { shiftPoints } from './waypoints'
import { dissolveAfter, expandIds, type GroupWrite } from './group'
import { isLocked, withLock } from './lock'
import { planStack, type StackEdge } from './stack'
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
  // A freeform link is not an edge. Freeze the visual end and drop only the
  // ids that are leaving; the arrow stays. A bpmnFlow was already added to
  // `removing` above and is deleted with its endpoint, which the format requires.
  const linkPatches = patchesForRemoval(list, removing)
  doc.transact(() => {
    applyMembership(elements, clears)
    for (const patch of linkPatches) {
      if (removing.has(patch.id)) continue
      commitElementPatch(doc, elements, patch.id, patch.updates, origin)
    }
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
  const all = elements.toArray()
  const picked = all.filter(element => wanted.has(element.id) && !isLocked(element))
  if (!picked.length) return 0
  const moving = new Set(picked.map(element => element.id))

  doc.transact(() => {
    for (const element of picked) {
      // An attached end whose shape is not coming along freezes here, in the
      // same transaction as the nudge. A shape moving without its arrow is
      // not parked: the arrow is not in `picked`, and render follows it.
      const parked = parkForMove(element, all, moving)
      // Bends are world points. The park may rebase x/y onto the visual end
      // without moving them; the nudge delta is what has to carry them along.
      const bends = element.waypoints?.length ? shiftPoints(element.waypoints, delta.x, delta.y) : undefined
      commitElementPatch(doc, elements, element.id, {
        ...parked.extras,
        x: parked.x + delta.x,
        y: parked.y + delta.y,
        ...(bends ? { waypoints: bends } : {}),
      }, origin)
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
    const byId = new Map(moves.map(move => [move.id, move]))
    for (let index = 0; index < elements.length; index += 1) {
      const current = elements.get(index)
      const move = byId.get(current.id)
      if (!move) continue
      const dx = move.x - current.x
      const dy = move.y - current.y
      const bends = current.waypoints?.length ? shiftPoints(current.waypoints, dx, dy) : undefined
      const updates: Partial<BoardElement> = bends ? { x: move.x, y: move.y, waypoints: bends } : { x: move.x, y: move.y }
      if (commitElementUpdate(doc, elements, move.id, updates, origin)) changed += 1
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
 * Copies a selection by one shared offset, in one transaction.
 *
 * The offset is the same one paste uses. A per-copy offset sheared a group:
 * the second copy landed twice as far as the first, so the gap between them
 * changed. Coincident copies stay coincident; the selection count is how you
 * tell them apart.
 *
 * A group mate comes along even if it was not named. A connector comes only
 * when both ends are in the set, and its endpoints are remapped onto the
 * copies, so the fragment stays connected to itself. A connector whose end is
 * outside the set is omitted: keeping it would dangle, and dropping only the
 * flow would leave a freeform arrow. `createdBy` names whoever made the copy.
 * Callers that want the original author omit the option. Returns the new ids
 * in document order so the caller can select the copies.
 */
export function duplicateElements(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  nextId: () => string,
  origin: unknown = LOCAL_EDIT,
  createdBy?: string,
): string[] {
  const list = elements.toArray()
  const present = new Set(list.map(element => element.id))
  const wanted = new Set(expandIds(list, ids).filter(id => present.has(id)))
  if (!wanted.size) return []
  // Document order, not the order the ids arrived in, so the copies paint in
  // the same relation as their sources.
  const byId = new Map(list.map(element => [element.id, element]))
  const picked = list.filter(element => {
    if (!wanted.has(element.id)) return false
    const flow = element.bpmnFlow
    if (!flow) return true
    return wanted.has(flow.sourceId) && wanted.has(flow.targetId)
  }).map(element => withDrawnLine(element, byId))
  if (!picked.length) return []

  const copies = preparePaste(picked, {
    makeId: () => nextId(),
    offset: { x: PASTE_OFFSET, y: PASTE_OFFSET },
    createdBy,
  })
  if (!copies.length) return []
  doc.transact(() => { elements.push(copies) }, origin)
  return copies.map(element => element.id)
}

/**
 * Moves a selection to the front or the back of the paint order, in one transaction.
 *
 * Paint order is array order. The block keeps the order it already had — a
 * later item in the selection does not leapfrog an earlier one — and a group
 * mate comes along even if it was not named. `z` is stamped so a consumer that
 * sorts by it agrees with the array; a connector has no `z` and is not stamped.
 * Already the prefix or the suffix opens no transaction.
 */
export function restackElements(
  doc: Y.Doc,
  elements: Elements,
  ids: Iterable<string>,
  edge: StackEdge,
  origin: unknown = LOCAL_EDIT,
): number {
  const plan = planStack(elements.toArray(), ids, edge)
  if (!plan) return 0
  const moving = new Set(plan.moving)
  const stamps = new Map(plan.stamps.map(stamp => [stamp.id, stamp.zIndex]))
  doc.transact(() => {
    const block: BoardElement[] = []
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const current = elements.get(index)
      if (!moving.has(current.id)) continue
      elements.delete(index, 1)
      const zIndex = stamps.get(current.id)
      block.push(zIndex === undefined || current.zIndex === zIndex ? current : { ...current, zIndex })
    }
    block.reverse()
    if (edge === 'front') elements.push(block)
    else elements.insert(0, block)
  }, origin)
  return plan.moving.length
}

/**
 * Raises one element above the rest. A grouped element takes its group.
 * Already on top opens no transaction.
 */
export function bringToFront(doc: Y.Doc, elements: Elements, id: string, origin: unknown = LOCAL_EDIT): boolean {
  return restackElements(doc, elements, [id], 'front', origin) > 0
}
