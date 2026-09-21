import type { BoardElement, Point } from './types'

/**
 * Gesture geometry, extracted from App.tsx verbatim so it can be tested and so
 * the release path can reuse it.
 *
 * The reason this matters: a gesture used to be finished by reading React state
 * written during `pointermove`. State is only as fresh as the last committed
 * render, so a fast drag — down, move, up within one frame, which is what a
 * flick is — could end with the geometry from `pointerdown` and silently do
 * nothing. Both the move and the release handler now compute frames from these
 * pure functions plus the pointer's own coordinates, so the result depends on
 * where the pointer is, not on when React last rendered.
 */

/** One element's pending change during a gesture; committed once on release. */
export type GestureFrame = { id: string; updates: Partial<BoardElement> }

export type DragInfo = {
  startX: number
  startY: number
  items: { id: string; x: number; y: number }[]
}

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

export type ResizeInfo = {
  id: string
  corner: ResizeCorner
  startX: number
  startY: number
  elX: number
  elY: number
  elW: number
  elH: number
}

/** Elements never resize below this, so a corner drag cannot invert a shape. */
export const MIN_ELEMENT_SIZE = 30

/** Grid snapping when it is on; `undefined` leaves coordinates untouched. */
export type SnapFn = (value: number) => number

/**
 * One delta applied to every dragged element, so a multi-selection moves as a
 * group and keeps its internal layout. The delta is snapped through the first
 * element, which lands the whole group on the grid together.
 */
export function dragFrame(info: DragInfo, point: Point, snap?: SnapFn): GestureFrame[] {
  if (!info.items.length) return []
  const rawX = point.x - info.startX
  const rawY = point.y - info.startY
  const deltaX = snap ? snap(info.items[0].x + rawX) - info.items[0].x : rawX
  const deltaY = snap ? snap(info.items[0].y + rawY) - info.items[0].y : rawY
  return info.items.map(item => ({ id: item.id, updates: { x: item.x + deltaX, y: item.y + deltaY } }))
}

/** Corner resize: the dragged corner follows the pointer, the opposite one stays put. */
export function resizeFrame(info: ResizeInfo, point: Point, snap?: SnapFn): GestureFrame[] {
  const dx = point.x - info.startX
  const dy = point.y - info.startY
  let newX = info.elX, newY = info.elY
  let newW = info.elW, newH = info.elH
  if (info.corner === 'se') { newW = Math.max(MIN_ELEMENT_SIZE, info.elW + dx); newH = Math.max(MIN_ELEMENT_SIZE, info.elH + dy) }
  else if (info.corner === 'sw') { newX = info.elX + dx; newW = Math.max(MIN_ELEMENT_SIZE, info.elW - dx); newH = Math.max(MIN_ELEMENT_SIZE, info.elH + dy) }
  else if (info.corner === 'ne') { newY = info.elY + dy; newW = Math.max(MIN_ELEMENT_SIZE, info.elW + dx); newH = Math.max(MIN_ELEMENT_SIZE, info.elH - dy) }
  else if (info.corner === 'nw') { newX = info.elX + dx; newY = info.elY + dy; newW = Math.max(MIN_ELEMENT_SIZE, info.elW - dx); newH = Math.max(MIN_ELEMENT_SIZE, info.elH - dy) }
  if (snap) { newX = snap(newX); newY = snap(newY); newW = snap(newW); newH = snap(newH) }
  return [{ id: info.id, updates: { x: newX, y: newY, w: newW, h: newH } }]
}
