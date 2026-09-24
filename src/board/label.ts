/**
 * Caption on an arrow or a line.
 *
 * The shift is relative to the middle of the route, not a world point. Moving
 * the mark carries the caption; moving a shape the mark follows does not.
 * A zero shift is absence, so a caption that sits on the route matches a file
 * from before the field existed.
 */
import type { Point } from './types'

/** Middle of the middle segment. A straight mark is the midpoint of its two ends. */
export function captionAnchor(points: readonly Point[]): Point | null {
  if (points.length < 2) return null
  const index = Math.floor((points.length - 1) / 2)
  const from = points[index]
  const to = points[index + 1]
  if (!from || !to) return null
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
}

/** Where the chip is drawn. Absent offset means it sits on the route. */
export function captionPoint(anchor: Point, offset?: Point): Point {
  if (!offset) return { x: anchor.x, y: anchor.y }
  return { x: anchor.x + offset.x, y: anchor.y + offset.y }
}

/** Finite non-zero shift only. Zero and garbage are absence. */
export function readOffset(value: unknown): Point | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as { x?: unknown; y?: unknown }
  if (typeof raw.x !== 'number' || typeof raw.y !== 'number') return undefined
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return undefined
  if (raw.x === 0 && raw.y === 0) return undefined
  return { x: raw.x, y: raw.y }
}
