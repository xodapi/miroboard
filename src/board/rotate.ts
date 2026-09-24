import type { Point } from './types'

/**
 * Object rotation.
 *
 * The file already stores `rotation` and round-trips it. The canvas used to
 * ignore the field, so a saved angle came back upright. Zero means "no
 * rotation" and is omitted from the transform, which keeps an unrotated board
 * byte-identical in the DOM.
 *
 * The handle sits above the object. Angle 0 is that upright position; positive
 * angles go clockwise, matching SVG's `rotate()`.
 */

export type RotateInfo = {
  id: string
  cx: number
  cy: number
}

/** Connectors are positioned by their endpoints, not by a box that can spin. */
export function canRotate(element: { type: string; bpmnFlow?: unknown }): boolean {
  if (element.bpmnFlow) return false
  return element.type !== 'arrow' && element.type !== 'line'
}

export function frameTransform(element: { x: number; y: number; w?: number; h?: number; rotation?: number }): string {
  const translate = `translate(${element.x},${element.y})`
  if (!element.rotation) return translate
  return `${translate} rotate(${element.rotation} ${(element.w || 0) / 2} ${(element.h || 0) / 2})`
}

/**
 * Degrees clockwise from upright.
 *
 * Shift snaps to 15°, which is how a user lands on a right angle without
 * hunting. Anything within half a degree of upright becomes 0, so the file
 * does not grow a 359.8 that renders the same as none.
 */
export function rotationFromPointer(info: Pick<RotateInfo, 'cx' | 'cy'>, point: Point, snapToStep: boolean): number {
  const raw = Math.atan2(point.y - info.cy, point.x - info.cx) * 180 / Math.PI + 90
  const wrapped = ((raw % 360) + 360) % 360
  const stepped = snapToStep ? Math.round(wrapped / 15) * 15 : wrapped
  const normalised = ((stepped % 360) + 360) % 360
  if (normalised < 0.5 || normalised > 359.5) return 0
  return Math.round(normalised * 10) / 10
}
