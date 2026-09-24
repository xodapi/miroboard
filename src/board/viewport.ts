import { clamp_scale } from '../wasm/board-core/board_core'
import { hasLink, visualExtent } from './follow'
import { isElementType, type BoardElement, type Point } from './types'

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

/**
 * Pans so a world box sits in the middle of the viewport, keeping the scale.
 *
 * Search uses this. Changing the zoom to frame one sticky would throw away
 * the scale the user just set; they asked to *go to* the match, not to refit
 * the board.
 */
export function centerOn(transform: Transform, bounds: { x: number; y: number; w: number; h: number }, viewport: Viewport): Transform {
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  return {
    scale: transform.scale,
    x: viewport.width / 2 - cx * transform.scale,
    y: viewport.height / 2 - cy * transform.scale,
  }
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

  const byId = new Map(elements.map(element => [element.id, element]))
  const boxes = elements.map(element => {
    const bent = (element.type === 'arrow' || element.type === 'line') && Boolean(element.waypoints?.length) && !element.bpmnFlow
    if (!hasLink(element) && !bent) {
      return {
        x: element.x,
        y: element.y,
        w: element.w || DEFAULT_EXTENT,
        h: element.h || DEFAULT_EXTENT,
      }
    }
    const live = visualExtent(element, byId)
    return {
      x: live.x,
      y: live.y,
      w: live.w || DEFAULT_EXTENT,
      h: live.h || DEFAULT_EXTENT,
    }
  })
  const minX = Math.min(...boxes.map(box => box.x))
  const minY = Math.min(...boxes.map(box => box.y))
  const maxX = Math.max(...boxes.map(box => box.x + box.w))
  const maxY = Math.max(...boxes.map(box => box.y + box.h))
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
export function elementsInScope(elements: BoardElement[], mode: 'board' | 'bpmn' | 'simulation' | 'notation'): BoardElement[] {
  const isBpmn = (element: BoardElement) => Boolean(element.bpmnNodeType || element.bpmnFlow)
  const isNotation = (element: BoardElement) => Boolean(element.notation)
  // An element whose type this version does not render is skipped: fitting the
  // view to something invisible zooms the board out to frame empty space, and
  // the user cannot see what caused it. Such elements come from a newer
  // version's file and are preserved on save — they are simply not in scope
  // for a viewport that cannot draw them.
  const drawable = elements.filter(element => isElementType(element.type))
  const scoped = mode === 'board'
    ? drawable.filter(element => !isBpmn(element))
    : mode === 'notation'
      ? drawable.filter(isNotation)
      : drawable.filter(isBpmn)
  return scoped.length ? scoped : drawable
}
