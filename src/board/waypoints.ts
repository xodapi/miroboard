/**
 * Bend points shared by the file, the clipboard and the gesture.
 *
 * World coordinates, not offsets from the arrow's frame. A shape moving does
 * not move them; only a move of the mark itself does, and that caller adds
 * the same delta it added to `x`/`y`. This file stays free of the canvas and
 * of the WASM core so the format adapter can sanitise a point list without
 * pulling the renderer in.
 */
import type { Point } from './types'

/** Finite points only. An empty or unusable list is absence, not `[]`. */
export function readWaypoints(value: unknown): Point[] | undefined {
  if (!Array.isArray(value)) return undefined
  const points: Point[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as { x?: unknown; y?: unknown }
    if (typeof raw.x !== 'number' || typeof raw.y !== 'number') continue
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue
    points.push({ x: raw.x, y: raw.y })
  }
  return points.length ? points : undefined
}

/** A new list. Callers that have no bends should not call this. */
export function shiftPoints(points: readonly Point[], dx: number, dy: number): Point[] {
  return points.map(point => ({ x: point.x + dx, y: point.y + dy }))
}

/** Empty and absent are the same route: a straight mark. */
export function sameWaypoints(left: readonly Point[] | undefined, right: readonly Point[] | undefined): boolean {
  const a = left?.length ? left : []
  const b = right?.length ? right : []
  if (a.length !== b.length) return false
  return a.every((point, index) => point.x === b[index].x && point.y === b[index].y)
}
