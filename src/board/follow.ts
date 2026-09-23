/**
 * Freeform arrows and lines that follow a shape.
 *
 * This is not a BPMN flow. The mark stays a node, one end may be free, and
 * deleting the shape leaves the arrow where it was drawn. `bpmnEdgeAnchor`
 * stays the connector formula; freeform ends use `outlineAnchor`, which
 * respects rotation and a real ellipse.
 */
import { outlineAnchor, worldToLocal } from './geometry'
import { elementLink, hasElementLink, type BoardElement, type ElementLink, type Point } from './types'

export const ATTACH_SCREEN_PX = 8

export type LinkEnds = ElementLink

export function hasLink(element: { bpmnFlow?: unknown; link?: ElementLink }): boolean {
  return hasElementLink(element)
}

/** A shape a freeform end may stick to. Not a path, an arrow, a line, or a connector. */
export function isAttachable(element: BoardElement): boolean {
  if (element.bpmnFlow) return false
  return element.type === 'sticky' || element.type === 'rect' || element.type === 'circle'
    || element.type === 'text' || element.type === 'emoji'
}

function centerOf(element: BoardElement): Point {
  return { x: element.x + (element.w ?? 0) / 2, y: element.y + (element.h ?? 0) / 2 }
}

function freePoint(element: BoardElement, which: 'source' | 'target'): Point {
  if (which === 'source') return { x: element.x, y: element.y }
  return { x: element.x + (element.w ?? 0), y: element.y + (element.h ?? 0) }
}

function endId(element: BoardElement, which: 'source' | 'target'): string | undefined {
  if (element.bpmnFlow) return undefined
  const id = which === 'source' ? element.link?.sourceId : element.link?.targetId
  return id || undefined
}

function endShape(
  element: BoardElement,
  which: 'source' | 'target',
  byId: ReadonlyMap<string, BoardElement>,
): BoardElement | undefined {
  const id = endId(element, which)
  if (!id) return undefined
  const node = byId.get(id)
  if (!node || node.id === element.id || !isAttachable(node)) return undefined
  return node
}

function anchoredEnd(
  element: BoardElement,
  which: 'source' | 'target',
  byId: ReadonlyMap<string, BoardElement>,
): Point | null {
  const node = endShape(element, which, byId)
  if (!node) return null
  const other = endShape(element, which === 'source' ? 'target' : 'source', byId)
  const toward = other ? centerOf(other) : freePoint(element, which === 'source' ? 'target' : 'source')
  return outlineAnchor(node, toward.x, toward.y)
}

/**
 * The segment to draw. A dangling id, or an end with no link, uses the stored
 * frame. Null when the element is not an arrow or a line.
 */
export function lineEnds(
  element: BoardElement,
  byId: ReadonlyMap<string, BoardElement>,
): { start: Point; end: Point } | null {
  if (element.type !== 'arrow' && element.type !== 'line') return null
  return {
    start: anchoredEnd(element, 'source', byId) ?? freePoint(element, 'source'),
    end: anchoredEnd(element, 'target', byId) ?? freePoint(element, 'target'),
  }
}

/** True when `point` lies in the shape, inflated by `slop` world pixels. */
export function containsPoint(element: BoardElement, point: Point, slop = 0): boolean {
  const local = worldToLocal(element, point)
  const width = element.w ?? 0
  const height = element.h ?? 0
  const cx = width / 2
  const cy = height / 2
  if (element.type === 'circle') {
    const rx = Math.abs(width) / 2 + slop
    const ry = Math.abs(height) / 2 + slop
    if (rx <= 0 || ry <= 0) return false
    const nx = (local.x - cx) / rx
    const ny = (local.y - cy) / ry
    return nx * nx + ny * ny <= 1
  }
  if (element.bpmnNodeType === 'startEvent' || element.bpmnNodeType === 'endEvent') {
    const radius = Math.min(Math.abs(width), Math.abs(height)) / 2 + slop
    if (radius <= 0) return false
    return Math.hypot(local.x - cx, local.y - cy) <= radius
  }
  if (element.bpmnNodeType === 'xorGateway' || element.bpmnNodeType === 'andGateway' || element.bpmnNodeType === 'orGateway') {
    const halfW = Math.abs(width) / 2 + slop
    const halfH = Math.abs(height) / 2 + slop
    if (halfW <= 0 || halfH <= 0) return false
    return Math.abs(local.x - cx) / halfW + Math.abs(local.y - cy) / halfH <= 1
  }
  const minX = Math.min(0, width) - slop
  const maxX = Math.max(0, width) + slop
  const minY = Math.min(0, height) - slop
  const maxY = Math.max(0, height) + slop
  return local.x >= minX && local.x <= maxX && local.y >= minY && local.y <= maxY
}

/** Topmost attachable shape under `point`, skipping `exceptId`. */
export function shapeAt(
  elements: readonly BoardElement[],
  point: Point,
  exceptId: string | undefined,
  slop: number,
): BoardElement | undefined {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (element.id === exceptId || !isAttachable(element)) continue
    if (containsPoint(element, point, slop)) return element
  }
  return undefined
}

/**
 * Attachment to write when an arrow or line is released.
 *
 * Hits the release point, not the last stored box. Both ends on the same
 * shape attach to neither — a loop is not a link. A zero-length stroke
 * attaches to nothing. Undefined means "leave it free".
 */
export function planLink(
  element: BoardElement,
  elements: readonly BoardElement[],
  end: Point,
  slop: number,
): LinkEnds | undefined {
  if (element.bpmnFlow) return undefined
  if (element.type !== 'arrow' && element.type !== 'line') return undefined
  const start = { x: element.x, y: element.y }
  if (start.x === end.x && start.y === end.y) return undefined
  const source = shapeAt(elements, start, element.id, slop)
  const target = shapeAt(elements, end, element.id, slop)
  if (source && target && source.id === target.id) return undefined
  if (!source && !target) return undefined
  return elementLink({ sourceId: source?.id, targetId: target?.id })
}

export type ParkedMove = {
  x: number
  y: number
  /**
   * Present only when an end must freeze. `link: undefined` clears the key.
   * Spread this, then overwrite x/y with the drag delta.
   */
  extras?: Partial<BoardElement>
}

/**
 * What to store when `element` itself is about to move.
 *
 * An end whose shape is also moving stays attached — the render follows both.
 * An end whose shape stays behind is frozen to the visual point and dropped,
 * so the line translates instead of stretching back to a shape the user left.
 * A shape moving without the arrow is not this function's job: the arrow is
 * not in the moving set, and render follows it.
 */
export function parkForMove(
  element: BoardElement,
  elements: readonly BoardElement[],
  movingIds: ReadonlySet<string>,
): ParkedMove {
  if (!hasLink(element)) return { x: element.x, y: element.y }
  const sourceId = element.link?.sourceId
  const targetId = element.link?.targetId
  const sourceKept = Boolean(sourceId && movingIds.has(sourceId))
  const targetKept = Boolean(targetId && movingIds.has(targetId))
  if (sourceKept === Boolean(sourceId) && targetKept === Boolean(targetId)) {
    return { x: element.x, y: element.y }
  }
  const byId = new Map(elements.map(item => [item.id, item]))
  const ends = lineEnds(element, byId)
  if (!ends) return { x: element.x, y: element.y }
  const link = elementLink({
    sourceId: sourceKept ? sourceId : undefined,
    targetId: targetKept ? targetId : undefined,
  })
  return {
    x: ends.start.x,
    y: ends.start.y,
    extras: {
      w: ends.end.x - ends.start.x,
      h: ends.end.y - ends.start.y,
      link,
    },
  }
}

/**
 * Geometry a copy should carry when its shapes may not come along.
 * The link ids are left for the paste remapper; the frame is the visual segment.
 */
export function withDrawnLine(
  element: BoardElement,
  byId: ReadonlyMap<string, BoardElement>,
): BoardElement {
  if (!hasLink(element)) return element
  const ends = lineEnds(element, byId)
  if (!ends) return element
  return {
    ...element,
    x: ends.start.x,
    y: ends.start.y,
    w: ends.end.x - ends.start.x,
    h: ends.end.y - ends.start.y,
  }
}

/**
 * Freezes ends whose shapes are about to disappear. The arrow itself is not
 * removed — a freeform link is not an edge.
 */
export function patchesForRemoval(
  elements: readonly BoardElement[],
  removing: ReadonlySet<string>,
): { id: string; updates: Partial<BoardElement> }[] {
  const byId = new Map(elements.map(item => [item.id, item]))
  const patches: { id: string; updates: Partial<BoardElement> }[] = []
  for (const element of elements) {
    if (removing.has(element.id) || !hasLink(element)) continue
    const sourceGone = Boolean(element.link?.sourceId && removing.has(element.link.sourceId))
    const targetGone = Boolean(element.link?.targetId && removing.has(element.link.targetId))
    if (!sourceGone && !targetGone) continue
    const ends = lineEnds(element, byId)
    if (!ends) continue
    patches.push({
      id: element.id,
      updates: {
        x: ends.start.x,
        y: ends.start.y,
        w: ends.end.x - ends.start.x,
        h: ends.end.y - ends.start.y,
        link: elementLink({
          sourceId: sourceGone ? undefined : element.link?.sourceId,
          targetId: targetGone ? undefined : element.link?.targetId,
        }),
      },
    })
  }
  return patches
}

/** Axis-aligned box of the live segment, or the stored frame when nothing is attached. */
export function visualExtent(
  element: BoardElement,
  byId: ReadonlyMap<string, BoardElement>,
): { x: number; y: number; w?: number; h?: number } {
  if (!hasLink(element)) return { x: element.x, y: element.y, w: element.w, h: element.h }
  const ends = lineEnds(element, byId)
  if (!ends) return { x: element.x, y: element.y, w: element.w, h: element.h }
  const minX = Math.min(ends.start.x, ends.end.x)
  const minY = Math.min(ends.start.y, ends.end.y)
  return {
    x: minX,
    y: minY,
    w: Math.abs(ends.end.x - ends.start.x),
    h: Math.abs(ends.end.y - ends.start.y),
  }
}
