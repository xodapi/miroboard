import { snap_to_grid } from '../wasm/board-core/board_core'
import type { BoardElement, Point } from './types'

/**
 * Pure drawing geometry. Moved out of App.tsx verbatim so it can be unit-tested
 * on its own — these functions decide how a freehand stroke is simplified and
 * where a BPMN edge attaches, and neither was covered before.
 */

export function pointToLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

/** Ramer-Douglas-Peucker: drops the points a freehand stroke wobbled through. */
export function simplifyPath(points: Point[], tolerance = 2): Point[] {
  if (points.length <= 2) return points
  let maxDist = 0, maxIdx = 0
  const first = points[0], last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDistance(points[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance)
    const right = simplifyPath(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

/** Quadratic-bezier path data through the midpoints of consecutive points. */
export function smoothPathD(points: Point[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2
    const my = (points[i].y + points[i + 1].y) / 2
    d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`
  return d
}

export function snapVal(v: number, grid = 20) { return snap_to_grid(v, grid) }

/**
 * Where an edge meets a BPMN node's outline, given the direction it comes from.
 * Events are circles, gateways diamonds, tasks rectangles — each needs its own
 * boundary formula or edges visibly stop short of or overshoot the shape.
 */
type AnchorShape = {
  x: number
  y: number
  w?: number
  h?: number
  rotation?: number
  type?: string
  bpmnNodeType?: string
}

/**
 * World point into the element's local frame. Positive rotation is clockwise,
 * matching the SVG `rotate` the canvas already uses.
 */
export function worldToLocal(element: AnchorShape, point: Point): Point {
  const width = element.w ?? 0
  const height = element.h ?? 0
  const cx = width / 2
  const cy = height / 2
  const px = point.x - element.x
  const py = point.y - element.y
  const degrees = element.rotation || 0
  if (!degrees) return { x: px, y: py }
  const rad = degrees * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = px - cx
  const dy = py - cy
  return {
    x: cx + dx * cos + dy * sin,
    y: cy - dx * sin + dy * cos,
  }
}

/** Inverse of `worldToLocal`. */
export function localToWorld(element: AnchorShape, local: Point): Point {
  const width = element.w ?? 0
  const height = element.h ?? 0
  const cx = width / 2
  const cy = height / 2
  const degrees = element.rotation || 0
  if (!degrees) return { x: element.x + local.x, y: element.y + local.y }
  const rad = degrees * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = local.x - cx
  const dy = local.y - cy
  return {
    x: element.x + cx + dx * cos - dy * sin,
    y: element.y + cy + dx * sin + dy * cos,
  }
}

/**
 * Where a freeform link meets a shape's outline.
 *
 * Same boundary formulas as `bpmnEdgeAnchor` for an unrotated non-circle, plus
 * rotation and a real ellipse for `type: 'circle'`. BPMN connectors keep
 * calling `bpmnEdgeAnchor`; this one is only for freeform attachments.
 */
export function outlineAnchor(element: AnchorShape, towardX: number, towardY: number): Point {
  const localToward = worldToLocal(element, { x: towardX, y: towardY })
  return localToWorld(element, anchorInLocal(element, localToward.x, localToward.y))
}

function anchorInLocal(element: AnchorShape, towardX: number, towardY: number): Point {
  const width = element.w || 0
  const height = element.h || 0
  const cx = width / 2
  const cy = height / 2
  const dx = towardX - cx
  const dy = towardY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const halfWidth = width / 2
  const halfHeight = height / 2
  if (halfWidth === 0 || halfHeight === 0) return { x: cx, y: cy }
  let scale: number
  if (element.type === 'circle') {
    scale = 1 / Math.hypot(dx / halfWidth, dy / halfHeight)
  } else if (element.bpmnNodeType === 'startEvent' || element.bpmnNodeType === 'endEvent') {
    scale = Math.min(halfWidth, halfHeight) / Math.hypot(dx, dy)
  } else if (element.bpmnNodeType === 'xorGateway' || element.bpmnNodeType === 'andGateway' || element.bpmnNodeType === 'orGateway') {
    scale = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight)
  } else {
    scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight)
  }
  if (!Number.isFinite(scale)) return { x: cx, y: cy }
  return { x: cx + dx * scale, y: cy + dy * scale }
}

export function bpmnEdgeAnchor(element: BoardElement, towardX: number, towardY: number): Point {
  const width = element.w || 0
  const height = element.h || 0
  const centerX = element.x + width / 2
  const centerY = element.y + height / 2
  const dx = towardX - centerX
  const dy = towardY - centerY
  if (dx === 0 && dy === 0) return { x: centerX, y: centerY }
  const halfWidth = width / 2
  const halfHeight = height / 2
  let scale: number
  if (element.bpmnNodeType === 'startEvent' || element.bpmnNodeType === 'endEvent') {
    scale = Math.min(halfWidth, halfHeight) / Math.hypot(dx, dy)
  } else if (element.bpmnNodeType === 'xorGateway' || element.bpmnNodeType === 'andGateway' || element.bpmnNodeType === 'orGateway') {
    scale = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight)
  } else {
    scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight)
  }
  return { x: centerX + dx * scale, y: centerY + dy * scale }
}
