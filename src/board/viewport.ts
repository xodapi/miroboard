import { clamp_scale } from '../wasm/board-core/board_core'
import type { BoardElement, Point } from './types'

export interface Transform {
  x: number
  y: number
  scale: number
}

/** One wheel notch. Asymmetric on purpose: 1.08 * 0.92 ≈ 0.99, close enough. */
const WHEEL_IN = 1.08
const WHEEL_OUT = 0.92

/** Padding around the content when fitting, and the chrome fit must clear. */
const FIT_PADDING = 64
const FIT_VERTICAL_CHROME = 170

/** Elements with no explicit size still occupy this much when fitting. */
const DEFAULT_EXTENT = 48

export function screenToWorld(transform: Transform, rect: { left: number; top: number }, sx: number, sy: number): Point {
  return {
    x: (sx - rect.left - transform.x) / transform.scale,
    y: (sy - rect.top - transform.y) / transform.scale,
  }
}

/**
 * Scales around a fixed screen point, so whatever is under the cursor stays
 * under the cursor.
 *
 * `world` must be the point resolved against the *current* transform — the
 * caller has it already, and recomputing it here would need the canvas rect.
 */
export function zoomAround(transform: Transform, factor: number, screen: Point, world: Point): Transform {
  const scale = clamp_scale(transform.scale * factor)
  return { scale, x: screen.x - world.x * scale, y: screen.y - world.y * scale }
}

/** Wheel notch to zoom factor. Direction only; magnitude is fixed per notch. */
export function wheelZoomFactor(deltaY: number): number {
  return -deltaY > 0 ? WHEEL_IN : WHEEL_OUT
}

export interface Viewport {
  width: number
  height: number
}

/**
 * The transform that brings `elements` into view, centred.
 *
 * Returns the identity transform for an empty board: there is nothing to frame,
 * and picking some arbitrary scale would be worse than going home.
 */
export function fitTransform(elements: BoardElement[], viewport: Viewport): Transform {
  if (!elements.length) return { x: 0, y: 0, scale: 1 }

  const minX = Math.min(...elements.map(element => element.x))
  const minY = Math.min(...elements.map(element => element.y))
  const maxX = Math.max(...elements.map(element => element.x + (element.w || DEFAULT_EXTENT)))
  const maxY = Math.max(...elements.map(element => element.y + (element.h || DEFAULT_EXTENT)))
  const width = maxX - minX
  const height = maxY - minY

  // max(…, 1) keeps a single zero-sized element from dividing by zero.
  const scale = clamp_scale(Math.min(
    (viewport.width - FIT_PADDING * 2) / Math.max(width, 1),
    (viewport.height - FIT_VERTICAL_CHROME) / Math.max(height, 1),
  ))

  return {
    scale,
    x: (viewport.width - width * scale) / 2 - minX * scale,
    y: (viewport.height - height * scale) / 2 - minY * scale,
  }
}

/**
 * The elements `fitToContent` should frame in a given mode.
 *
 * Board mode frames the freehand content, BPMN and simulation frame the process.
 * If that leaves nothing, fall back to everything rather than to an empty view —
 * a board holding only BPMN nodes still has to be reachable from board mode.
 */
export function elementsInScope(elements: BoardElement[], mode: 'board' | 'bpmn' | 'simulation'): BoardElement[] {
  const isBpmn = (element: BoardElement) => Boolean(element.bpmnNodeType || element.bpmnFlow)
  const scoped = mode === 'board' ? elements.filter(e => !isBpmn(e)) : elements.filter(isBpmn)
  return scoped.length ? scoped : elements
}
