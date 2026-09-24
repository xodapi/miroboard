/**
 * The stroke an arrow or a line actually draws, including manual bends.
 *
 * Bends are world points. Moving a shape does not rewrite them — the ends
 * re-aim at the first and last bend, so a route the user drew stays put.
 * Moving the mark itself is not done here: the drag and the nudge add the
 * same delta to `x`/`y` and to the bends.
 */
import type { BoardElement, Point } from './types'
import { bpmnEdgeAnchor } from './geometry'
import { lineEnds } from './follow'
import { readWaypoints } from './waypoints'

/** A press on the midpoint grip must move before it becomes a bend. */
export const BEND_ARM_PX = 4

/** Releasing a bend this close to the chord it came from deletes it. */
export const BEND_SCREEN_PX = 8

export type Stroke = {
  /** World point the group is translated to. The other points are not local. */
  start: Point
  /** World points from the source end through the bends to the target end. */
  points: Point[]
}

function centerOf(element: BoardElement): Point {
  return { x: element.x + (element.w ?? 0) / 2, y: element.y + (element.h ?? 0) / 2 }
}

function bpmnEnds(element: BoardElement, byId: ReadonlyMap<string, BoardElement>, bends: readonly Point[]): { start: Point; end: Point } {
  const flow = element.bpmnFlow
  const source = flow ? byId.get(flow.sourceId) : undefined
  const target = flow ? byId.get(flow.targetId) : undefined
  const sourceCenter = source ? centerOf(source) : undefined
  const targetCenter = target ? centerOf(target) : undefined
  // No bend: aim at the other centre, which is what a straight connector has
  // always done. A bend pulls that end toward the route instead of the centre.
  const towardEnd = bends[0] ?? targetCenter
  const towardStart = bends[bends.length - 1] ?? sourceCenter
  const start = source && towardEnd
    ? bpmnEdgeAnchor(source, towardEnd.x, towardEnd.y)
    : { x: element.x, y: element.y }
  const end = target && towardStart
    ? bpmnEdgeAnchor(target, towardStart.x, towardStart.y)
    : { x: element.x + (element.w ?? 0), y: element.y + (element.h ?? 0) }
  return { start, end }
}

/**
 * Null when the element is not an arrow or a line. A straight mark is two
 * points; bends sit between them and are not derived from the frame.
 */
export function strokeOf(element: BoardElement, byId: ReadonlyMap<string, BoardElement>): Stroke | null {
  if (element.type !== 'arrow' && element.type !== 'line') return null
  const bends = readWaypoints(element.waypoints) ?? []
  const ends = element.bpmnFlow
    ? bpmnEnds(element, byId, bends)
    : lineEnds(element, byId, bends.length ? { source: bends[0], target: bends[bends.length - 1] } : undefined)
  if (!ends) return null
  return { start: ends.start, points: [ends.start, ...bends, ends.end] }
}

/** Axis-aligned box of a stroke, or null when there is nothing to frame. */
export function boxOf(points: readonly Point[]): { x: number; y: number; w: number; h: number } | null {
  if (!points.length) return null
  let minX = points[0].x
  let minY = points[0].y
  let maxX = points[0].x
  let maxY = points[0].y
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Distance to the segment, not the infinite line: past an end it is the end. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

export type BendDrag = {
  /** Index in the waypoint list. For a new bend, the segment it was pulled from. */
  index: number
  origin: readonly Point[]
  /** The chord the bend was taken from, captured at press so anchors cannot move it. */
  chord: readonly [Point, Point]
  created: boolean
}

function insertWaypoint(points: readonly Point[], index: number, point: Point): Point[] {
  const next = points.map(item => ({ x: item.x, y: item.y }))
  const at = Math.max(0, Math.min(index, next.length))
  next.splice(at, 0, { x: point.x, y: point.y })
  return next
}

function replaceWaypoint(points: readonly Point[], index: number, point: Point): Point[] {
  if (index < 0 || index >= points.length) return points.map(item => ({ x: item.x, y: item.y }))
  return points.map((item, at) => (at === index ? { x: point.x, y: point.y } : { x: item.x, y: item.y }))
}

function dropWaypoint(points: readonly Point[], index: number): Point[] | undefined {
  const next = points.filter((_, at) => at !== index)
  return next.length ? next : undefined
}

/** The list to draw while the pointer is down. Does not straighten. */
export function draftBend(drag: BendDrag, point: Point): Point[] {
  return drag.created
    ? insertWaypoint(drag.origin, drag.index, point)
    : replaceWaypoint(drag.origin, drag.index, point)
}

/**
 * What to store on release. A bend that lands back on its chord is not a bend:
 * keeping it would leave a dot the user cannot see a reason for.
 */
export function commitBend(drag: BendDrag, point: Point, slop: number): Point[] | undefined {
  const drafted = draftBend(drag, point)
  const placed = drafted[drag.index]
  if (!placed) return drafted.length ? drafted : undefined
  if (distanceToSegment(placed, drag.chord[0], drag.chord[1]) <= slop) return dropWaypoint(drafted, drag.index)
  return drafted
}
