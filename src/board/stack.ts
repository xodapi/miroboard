/**
 * Paint order of a selection.
 *
 * The canvas paints the Yjs array from front to back of the list: later items
 * cover earlier ones. The file restores that as `order`, not as `z`. Writing
 * `zIndex: 0` and leaving the array alone — what "send to back" used to do —
 * changes nothing on screen and nothing in the saved order.
 *
 * The moved block keeps the order it already had, and so does everything that
 * stays. A group travels together, and a connector travels only when both of
 * its ends are in the set. A lock freezes the box, not the layer.
 */
import { expandIds } from './group'
import type { BoardElement } from './types'

export type StackEdge = 'front' | 'back'

export interface StackStamp {
  readonly id: string
  readonly zIndex: number
}

export interface StackPlan {
  /** Ids to move, in current document order. */
  readonly moving: readonly string[]
  /** Node stamps so a consumer that sorts by `z` agrees with array order. */
  readonly stamps: readonly StackStamp[]
}

function zOf(element: BoardElement): number {
  return typeof element.zIndex === 'number' && Number.isFinite(element.zIndex) ? element.zIndex : 0
}

function alreadyStacked(elements: readonly BoardElement[], moving: ReadonlySet<string>, edge: StackEdge): boolean {
  const slice = edge === 'front'
    ? elements.slice(elements.length - moving.size)
    : elements.slice(0, moving.size)
  return slice.length === moving.size && slice.every(element => moving.has(element.id))
}

/**
 * The block to move, or null when it is already the prefix or the suffix.
 * Callers must not open a transaction for null.
 */
export function planStack(
  elements: readonly BoardElement[],
  ids: Iterable<string>,
  edge: StackEdge,
): StackPlan | null {
  const present = new Set(elements.map(element => element.id))
  const movingIds = expandIds(elements, ids).filter(id => present.has(id))
  if (!movingIds.length) return null
  const moving = new Set(movingIds)
  if (alreadyStacked(elements, moving, edge)) return null

  const block = elements.filter(element => moving.has(element.id))
  const staying = elements.filter(element => !moving.has(element.id) && !element.bpmnFlow)
  const stayingZ = staying.map(zOf)
  const stamps: StackStamp[] = []
  if (edge === 'front') {
    let next = (stayingZ.length ? Math.max(...stayingZ) : 0) + 1
    for (const element of block) {
      if (element.bpmnFlow) continue
      stamps.push({ id: element.id, zIndex: next })
      next += 1
    }
  } else {
    const floor = stayingZ.length ? Math.min(...stayingZ) : 0
    const nodes = block.filter(element => !element.bpmnFlow)
    let next = floor - nodes.length
    for (const element of block) {
      if (element.bpmnFlow) continue
      stamps.push({ id: element.id, zIndex: next })
      next += 1
    }
  }
  return { moving: block.map(element => element.id), stamps }
}
