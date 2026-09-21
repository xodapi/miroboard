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
