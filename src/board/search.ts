/**
 * Find-on-board. Pure, so it can be tested without rendering the canvas.
 *
 * A board past a few dozen stickies is unnavigable without this: there is no
 * outline, and the only way to a node used to be panning. Search is local —
 * it reads the elements already in memory and never leaves the page.
 */
import type { BoardElement } from './types'

export interface SearchHit {
  readonly id: string
  /** The text the query matched, for the result label. */
  readonly label: string
}

export interface Bounds {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** A point-like element still needs a box the highlight and the jump can frame. */
const FALLBACK_EXTENT = 48

function includes(value: string | undefined, needle: string): boolean {
  return value != null && value.toLowerCase().includes(needle)
}

/**
 * Case-insensitive substring search over the text a person would look for:
 * the label, a BPMN role, a flow condition, an emoji. Empty query matches
 * nothing — matching everything would jump the view on the first keystroke
 * of an opened (still empty) box.
 */
export function searchBoard(elements: readonly BoardElement[], query: string): SearchHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const hits: SearchHit[] = []
  for (const element of elements) {
    const fields = [element.text, element.bpmnResourceRole, element.bpmnFlow?.condition, element.emoji]
    const matched = fields.find(field => includes(field, needle))
    if (matched) hits.push({ id: element.id, label: (element.text || matched).trim() || matched })
  }
  return hits
}

/** Wraps, so "next" on the last hit returns to the first. */
export function stepIndex(count: number, index: number, delta: number): number {
  if (count <= 0) return 0
  const normalised = ((index % count) + count) % count
  return (normalised + delta + count) % count
}

/**
 * Where a hit actually sits on the canvas.
 *
 * A BPMN flow stores x/y/w/h of 0 — its line is derived from the endpoints —
 * so framing the stored box would jump to the origin. Frame the segment
 * between the endpoints instead.
 */
export function hitBounds(element: BoardElement, byId: ReadonlyMap<string, BoardElement>): Bounds {
  const link = element.bpmnFlow ? undefined : element.link
  if (link && (link.sourceId || link.targetId)) {
    const source = link.sourceId ? byId.get(link.sourceId) : undefined
    const target = link.targetId ? byId.get(link.targetId) : undefined
    if (source || target) {
      const x1 = source ? source.x + (source.w ?? 0) / 2 : element.x
      const y1 = source ? source.y + (source.h ?? 0) / 2 : element.y
      const x2 = target ? target.x + (target.w ?? 0) / 2 : element.x + (element.w ?? 0)
      const y2 = target ? target.y + (target.h ?? 0) / 2 : element.y + (element.h ?? 0)
      return withWaypoints({
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.max(Math.abs(x2 - x1), FALLBACK_EXTENT),
        h: Math.max(Math.abs(y2 - y1), FALLBACK_EXTENT),
      }, element.waypoints)
    }
  }
  const flow = element.bpmnFlow
  if (flow) {
    const source = byId.get(flow.sourceId)
    const target = byId.get(flow.targetId)
    if (source && target) {
      const x1 = source.x + (source.w ?? 0) / 2
      const y1 = source.y + (source.h ?? 0) / 2
      const x2 = target.x + (target.w ?? 0) / 2
      const y2 = target.y + (target.h ?? 0) / 2
      return withWaypoints({
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.max(Math.abs(x2 - x1), FALLBACK_EXTENT),
        h: Math.max(Math.abs(y2 - y1), FALLBACK_EXTENT),
      }, element.waypoints)
    }
  }
  if (element.type === 'arrow' || element.type === 'line') {
    const x2 = element.x + (element.w ?? 0)
    const y2 = element.y + (element.h ?? 0)
    return withWaypoints({
      x: Math.min(element.x, x2),
      y: Math.min(element.y, y2),
      w: Math.max(Math.abs(element.w ?? 0), FALLBACK_EXTENT),
      h: Math.max(Math.abs(element.h ?? 0), FALLBACK_EXTENT),
    }, element.waypoints)
  }
  return {
    x: element.x,
    y: element.y,
    w: element.w || FALLBACK_EXTENT,
    h: element.h || FALLBACK_EXTENT,
  }
}

/** A bend outside the endpoint box still has to be framed, or search jumps short of it. */
function withWaypoints(bounds: Bounds, points: readonly { x: number; y: number }[] | undefined): Bounds {
  if (!points?.length) return bounds
  let minX = bounds.x
  let minY = bounds.y
  let maxX = bounds.x + bounds.w
  let maxY = bounds.y + bounds.h
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
