/**
 * Groups: several elements that select, move, copy and delete as one unit.
 *
 * Membership is a shared `groupId` string on the elements themselves. There is
 * no group element — an unknown `kind` is dropped by hit-testing, viewport fit
 * and paste, so a container node would vanish on the way back in. The token is
 * persisted as `DocNode.parentId`. It is not a node id, and it must not be
 * stashed in profile extras: an element update clones the record and that map
 * does not survive the clone.
 *
 * Connectors are not members. A `bpmnFlow` serialises as an edge, and edges
 * have no `parentId`. A connector travels with a set only when both of its
 * endpoints are already in that set. Nested groups are out of scope: an element
 * has at most one token, and assigning a new one replaces the old.
 */
import type { BoardElement } from './types'
import { boundsOf } from '../collab/marquee'

/** Fewer than this and the token is not a group — a leftover of one is cleared. */
export const MIN_GROUP_SIZE = 2

/** Padding around member boxes when the group is drawn selected. */
export const GROUP_OUTLINE_PAD = 8

export interface GroupWrite {
  readonly id: string
  /**
   * The token to store. Absent means the key must be deleted, not set to
   * `undefined` — a present-but-undefined field still round-trips as a value
   * in some clones and would keep the element in the group.
   */
  readonly groupId?: string
}

export type GroupPlan =
  | { readonly kind: 'group'; readonly writes: readonly GroupWrite[] }
  | { readonly kind: 'already' }
  | { readonly kind: 'too-small' }

export interface GroupOutline {
  readonly groupId: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** The group token, or nothing. Connectors are never members. */
export function membership(element: { groupId?: string; bpmnFlow?: unknown }): string | undefined {
  if (element.bpmnFlow) return undefined
  if (typeof element.groupId !== 'string' || element.groupId.length === 0) return undefined
  return element.groupId
}

/**
 * Ids to select when `id` is clicked.
 *
 * Expands only when that element is already in a real group. An ungrouped
 * board keeps today's single-select: a click must not swallow the canvas.
 */
export function clickTargets(elements: readonly BoardElement[], id: string): string[] {
  const element = elements.find(candidate => candidate.id === id)
  const groupId = element ? membership(element) : undefined
  if (!groupId) return [id]
  const members = elements.filter(candidate => membership(candidate) === groupId).map(candidate => candidate.id)
  return members.length >= MIN_GROUP_SIZE ? members : [id]
}

/**
 * Shift-click: the whole group joins or leaves together. Toggling one member
 * would leave a group that the next plain click immediately reselects.
 */
export function toggleGrouped(selection: ReadonlySet<string>, elements: readonly BoardElement[], id: string): Set<string> {
  const targets = clickTargets(elements, id)
  const allIn = targets.every(target => selection.has(target))
  const next = new Set(selection)
  for (const target of targets) {
    if (allIn) next.delete(target)
    else next.add(target)
  }
  return next
}

/**
 * Expands a set to every member of any group it touches, then adds connectors
 * whose *both* endpoints are in that set.
 *
 * Order: requested ids stay in the order they were given — an ungrouped
 * multi-select must not be reshuffled — then missing members in document
 * order, then connectors in document order. A connector with only one end in
 * the set stays out, so a move cannot steal a flow that also leaves the group.
 */
export function expandIds(elements: readonly BoardElement[], ids: Iterable<string>): string[] {
  const requested = [...ids]
  const selected = new Set(requested)
  const groups = new Set<string>()
  for (const element of elements) {
    const groupId = membership(element)
    if (groupId && selected.has(element.id)) groups.add(groupId)
  }

  const result: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    result.push(id)
  }
  for (const id of requested) push(id)
  if (groups.size) {
    for (const element of elements) {
      const groupId = membership(element)
      if (groupId && groups.has(groupId)) push(element.id)
    }
  }
  const covered = new Set(result)
  for (const element of elements) {
    const flow = element.bpmnFlow
    if (flow && covered.has(flow.sourceId) && covered.has(flow.targetId)) push(element.id)
    const link = element.link
    if (element.notation?.relation && link?.sourceId && link.targetId && covered.has(link.sourceId) && covered.has(link.targetId)) {
      push(element.id)
    }
  }
  return result
}

/**
 * What Ctrl+G should write.
 *
 * Needs at least two non-connector elements. If those elements already are
 * exactly one group, the call is a no-op so a repeated shortcut does not spend
 * an undo step. Members stolen from a previous group leave it; if fewer than
 * two remain, those leftovers lose the token in the same write.
 */
export function planGroup(
  elements: readonly BoardElement[],
  selectedIds: Iterable<string>,
  nextGroupId: string,
): GroupPlan {
  if (nextGroupId.length === 0) return { kind: 'too-small' }
  const selected = new Set(selectedIds)
  const members = elements.filter(element => selected.has(element.id) && !element.bpmnFlow)
  if (members.length < MIN_GROUP_SIZE) return { kind: 'too-small' }

  const tokens = new Set(members.map(membership).filter((token): token is string => token !== undefined))
  if (tokens.size === 1) {
    const token = [...tokens][0]
    const exclusive = members.every(member => membership(member) === token)
      && elements.filter(element => membership(element) === token).length === members.length
    if (exclusive) return { kind: 'already' }
  }

  const memberIds = new Set(members.map(member => member.id))
  const writes: GroupWrite[] = dissolveAfter(elements, memberIds).filter(write => !memberIds.has(write.id))
  for (const member of members) {
    if (member.groupId !== nextGroupId) writes.push({ id: member.id, groupId: nextGroupId })
  }
  return writes.length ? { kind: 'group', writes } : { kind: 'already' }
}

/**
 * Ctrl+Shift+G. Touching any member clears the whole group, not just the
 * clicked one — a half-cleared token would still expand on the next click.
 */
export function planUngroup(elements: readonly BoardElement[], selectedIds: Iterable<string>): GroupWrite[] {
  const selected = new Set(selectedIds)
  const tokens = new Set<string>()
  for (const element of elements) {
    const token = membership(element)
    if (token && selected.has(element.id)) tokens.add(token)
  }
  if (!tokens.size) return []
  return elements
    .filter(element => {
      const token = membership(element)
      return token !== undefined && tokens.has(token)
    })
    .map(element => ({ id: element.id }))
}

/**
 * Members of a touched group that would be left with fewer than two companions
 * once `removed` is gone. Callers delete the key; they do not write `undefined`.
 */
export function dissolveAfter(elements: readonly BoardElement[], removed: ReadonlySet<string>): GroupWrite[] {
  const touched = new Set<string>()
  for (const element of elements) {
    const token = membership(element)
    if (token && removed.has(element.id)) touched.add(token)
  }
  const writes: GroupWrite[] = []
  for (const token of touched) {
    const remain = elements.filter(element => membership(element) === token && !removed.has(element.id))
    if (remain.length < MIN_GROUP_SIZE) {
      for (const element of remain) writes.push({ id: element.id })
    }
  }
  return writes
}

/**
 * Copies must not stay in the source group, and a copy of a single member must
 * not become a one-element group. Each distinct token that still has two or
 * more copies becomes a fresh token; anything else loses the key.
 */
export function retargetGroupIds<T extends { groupId?: string; bpmnFlow?: unknown }>(
  elements: readonly T[],
  makeId: (groupId: string) => string,
): T[] {
  const counts = new Map<string, number>()
  for (const element of elements) {
    const token = membership(element)
    if (token) counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  const mapped = new Map<string, string>()
  return elements.map(element => {
    const token = membership(element)
    const stray = element.groupId !== undefined && !token
    if (!token || (counts.get(token) ?? 0) < MIN_GROUP_SIZE) {
      if (!element.groupId && !stray) return element
      if (!('groupId' in element)) return element
      const next = { ...element }
      delete next.groupId
      return next
    }
    let fresh = mapped.get(token)
    if (!fresh) {
      fresh = makeId(token)
      mapped.set(token, fresh)
    }
    if (fresh === element.groupId) return element
    return { ...element, groupId: fresh }
  })
}

/**
 * Dashed bounds of every group that has a selected member. Drawn from the
 * member boxes, not from a container, and padded so it sits outside the
 * per-element selection chrome.
 */
export function groupOutlines(elements: readonly BoardElement[], selectedIds: Iterable<string>): GroupOutline[] {
  const selected = new Set(selectedIds)
  const seen = new Set<string>()
  const outlines: GroupOutline[] = []
  for (const element of elements) {
    const token = membership(element)
    if (!token || !selected.has(element.id) || seen.has(token)) continue
    seen.add(token)
    const members = elements.filter(candidate => membership(candidate) === token)
    if (members.length < MIN_GROUP_SIZE) continue
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let boxed = 0
    const byId = new Map(elements.map(candidate => [candidate.id, candidate]))
    for (const member of members) {
      const bounds = boundsOf(member, byId)
      if (!bounds) continue
      boxed += 1
      minX = Math.min(minX, bounds.minX)
      minY = Math.min(minY, bounds.minY)
      maxX = Math.max(maxX, bounds.maxX)
      maxY = Math.max(maxY, bounds.maxY)
    }
    if (!boxed) continue
    outlines.push({
      groupId: token,
      x: minX - GROUP_OUTLINE_PAD,
      y: minY - GROUP_OUTLINE_PAD,
      w: maxX - minX + GROUP_OUTLINE_PAD * 2,
      h: maxY - minY + GROUP_OUTLINE_PAD * 2,
    })
  }
  return outlines
}
