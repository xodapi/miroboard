/**
 * Marquee selection geometry.
 *
 * Pure and element-shape-aware: the board stores eight element kinds with
 * different bounding rules (a `path` keeps its points relative to its frame,
 * an `arrow` is defined by two corners, an emoji has an implicit 48px box).
 * Those rules live here so the canvas does not grow another switch, and so the
 * same bounds can be reused by search-jump, grouping and frame containment.
 *
 * The defaults deliberately mirror `fitToContent` in App.tsx (48px fallback) so
 * "what you can select" and "what fits on screen" agree.
 */

export interface Bounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface MarqueeElement {
  readonly id: string
  readonly type: string
  readonly x: number
  readonly y: number
  readonly w?: number
  readonly h?: number
  readonly points?: readonly { x: number; y: number }[]
  readonly bpmnFlow?: { sourceId: string; targetId: string }
  /** Freeform attachment. Resolved center-to-center, same as a BPMN flow. */
  readonly link?: { sourceId?: string; targetId?: string }
  /** World bends. The box has to cover them or a marquee misses a routed arrow. */
  readonly waypoints?: readonly { x: number; y: number }[]
}

export const DEFAULT_ELEMENT_SIZE = 48

/**
 * Center-to-center box of an attached arrow or line.
 *
 * Enough for marquee and search: the visual stroke sits on that segment, so
 * this module does not need outline geometry. A missing end uses the stored
 * frame. Null when nothing resolves, so the caller falls back to that frame.
 */
function segmentBounds(
  element: MarqueeElement,
  nodesById?: ReadonlyMap<string, MarqueeElement>,
): Bounds | null {
  const sourceId = element.bpmnFlow?.sourceId ?? element.link?.sourceId
  const targetId = element.bpmnFlow?.targetId ?? element.link?.targetId
  if (!sourceId && !targetId) return null
  const source = sourceId ? nodesById?.get(sourceId) : undefined
  const target = targetId ? nodesById?.get(targetId) : undefined
  // A connector with a missing end keeps the stored frame, as it always has.
  // A freeform link may have one free end; that end uses the stored point.
  if (element.bpmnFlow && (!source || !target)) return null
  if (!source && !target) return null
  return normaliseRect(
    source
      ? { x: source.x + (source.w ?? 0) / 2, y: source.y + (source.h ?? 0) / 2 }
      : { x: element.x, y: element.y },
    target
      ? { x: target.x + (target.w ?? 0) / 2, y: target.y + (target.h ?? 0) / 2 }
      : { x: element.x + (element.w ?? 0), y: element.y + (element.h ?? 0) },
  )
}

/** Normalises a drag from any corner into min/max world coordinates. */
export function normaliseRect(a: { x: number; y: number }, b: { x: number; y: number }): Bounds {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  }
}

/**
 * World bounds of an element, or null when it cannot be located.
 *
 * A BPMN flow arrow derives its geometry from its endpoints, so its stored
 * x/y/w/h are only a fallback; `nodesById` lets the caller resolve them.
 */
export function boundsOf(
  element: MarqueeElement,
  nodesById?: ReadonlyMap<string, MarqueeElement>,
): Bounds | null {
  switch (element.type) {
    case 'path': {
      const points = element.points ?? []
      if (!points.length) return null
      const xs = points.map(point => point.x)
      const ys = points.map(point => point.y)
      return {
        minX: element.x + Math.min(...xs),
        minY: element.y + Math.min(...ys),
        maxX: element.x + Math.max(...xs),
        maxY: element.y + Math.max(...ys),
      }
    }
    case 'line':
    case 'arrow': {
      const live = segmentBounds(element, nodesById)
      const base = live ?? normaliseRect(
        { x: element.x, y: element.y },
        { x: element.x + (element.w ?? 0), y: element.y + (element.h ?? 0) },
      )
      return includeWaypoints(base, element.waypoints)
    }
    default: {
      const w = element.w ?? DEFAULT_ELEMENT_SIZE
      const h = element.h ?? DEFAULT_ELEMENT_SIZE
      return { minX: element.x, minY: element.y, maxX: element.x + w, maxY: element.y + h }
    }
  }
}

function includeWaypoints(bounds: Bounds, points: readonly { x: number; y: number }[] | undefined): Bounds {
  if (!points?.length) return bounds
  let { minX, minY, maxX, maxY } = bounds
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { minX, minY, maxX, maxY }
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
}

export function contains(outer: Bounds, inner: Bounds): boolean {
  return outer.minX <= inner.minX && outer.minY <= inner.minY
    && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY
}

export type MarqueeMode = 'intersect' | 'contain'

/**
 * Ids of the elements a marquee selects, in the order they were passed in
 * (which is render order, so the resulting selection is stable).
 *
 * A click without movement produces a degenerate zero-size rect: in
 * 'intersect' mode that still selects an element whose bounds contain the
 * point, which is what makes a marquee drag and a plain click share one code
 * path.
 */
export function selectInRect(
  elements: readonly MarqueeElement[],
  rect: Bounds,
  mode: MarqueeMode = 'intersect',
): string[] {
  const nodesById = new Map(elements.map(element => [element.id, element]))
  const test = mode === 'contain' ? contains : intersects
  const picked: string[] = []
  for (const element of elements) {
    const bounds = boundsOf(element, nodesById)
    if (bounds && test(rect, bounds)) picked.push(element.id)
  }
  return picked
}
