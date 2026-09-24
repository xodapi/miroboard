/**
 * Smart guides while dragging.
 *
 * Grid snap lands objects on a lattice. What a person actually wants, next to
 * another sticky, is "flush with its edge" or "centred on it". The guides are
 * ephemeral — same family as a drag preview. They are not written into the
 * document, so they never become history, an undo step, or bytes in the file.
 */
import type { BoardElement } from './types'
import { MIN_ELEMENT_SIZE, type GestureFrame, type ResizeCorner } from './gesture'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface Guide {
  readonly orientation: 'vertical' | 'horizontal'
  /** World coordinate of the line. */
  readonly position: number
}

export interface TranslationSnap {
  readonly dx: number
  readonly dy: number
  readonly guides: readonly Guide[]
}

/** Screen pixels. The caller divides by the current scale to get world units. */
export const ALIGN_SCREEN_PX = 8

interface AxisSnap {
  readonly delta: number
  readonly at: number
}

function axisPositions(origin: number, extent: number): number[] {
  const end = origin + extent
  const min = Math.min(origin, end)
  const max = Math.max(origin, end)
  return [min, (min + max) / 2, max]
}

function nearest(moving: number[], stationary: number[], threshold: number): AxisSnap | null {
  let best: AxisSnap | null = null
  for (const from of moving) {
    for (const to of stationary) {
      const delta = to - from
      if (Math.abs(delta) > threshold) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, at: to }
    }
  }
  return best
}

/** Snaps one box to the edges and centres of the others. Axes are independent. */
export function snapTranslation(moving: Rect, others: readonly Rect[], threshold: number): TranslationSnap {
  if (!(threshold > 0) || others.length === 0) return { dx: 0, dy: 0, guides: [] }
  const mx = axisPositions(moving.x, moving.w)
  const my = axisPositions(moving.y, moving.h)
  const xs: number[] = []
  const ys: number[] = []
  for (const other of others) {
    xs.push(...axisPositions(other.x, other.w))
    ys.push(...axisPositions(other.y, other.h))
  }
  const x = nearest(mx, xs, threshold)
  const y = nearest(my, ys, threshold)
  const guides: Guide[] = []
  if (x) guides.push({ orientation: 'vertical', position: x.at })
  if (y) guides.push({ orientation: 'horizontal', position: y.at })
  return { dx: x?.delta ?? 0, dy: y?.delta ?? 0, guides }
}

function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    const xs = axisPositions(rect.x, rect.w)
    const ys = axisPositions(rect.y, rect.h)
    minX = Math.min(minX, xs[0])
    maxX = Math.max(maxX, xs[2])
    minY = Math.min(minY, ys[0])
    maxY = Math.max(maxY, ys[2])
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Applies one translation to every dragged frame, so a multi-selection keeps
 * its internal layout and snaps as a single box. Elements being dragged are
 * not guides for themselves.
 */
export function snapDragFrames(
  frames: readonly GestureFrame[],
  elements: readonly BoardElement[],
  movingIds: ReadonlySet<string>,
  threshold: number,
): { frames: GestureFrame[]; guides: readonly Guide[] } {
  if (!frames.length || !(threshold > 0)) return { frames: [...frames], guides: [] }
  const byId = new Map(elements.map(element => [element.id, element]))
  const moving: Rect[] = frames.map(frame => {
    const element = byId.get(frame.id)
    return {
      x: frame.updates.x ?? element?.x ?? 0,
      y: frame.updates.y ?? element?.y ?? 0,
      w: frame.updates.w ?? element?.w ?? 0,
      h: frame.updates.h ?? element?.h ?? 0,
    }
  })
  const box = unionRect(moving)
  if (!box) return { frames: [...frames], guides: [] }
  const others = elements
    .filter(element => !movingIds.has(element.id))
    .map(element => ({ x: element.x, y: element.y, w: element.w ?? 0, h: element.h ?? 0 }))
  const snap = snapTranslation(box, others, threshold)
  if (snap.dx === 0 && snap.dy === 0) return { frames: [...frames], guides: [] }
  return {
    guides: snap.guides,
    frames: frames.map(frame => {
      const element = byId.get(frame.id)
      return {
        id: frame.id,
        updates: {
          ...frame.updates,
          x: (frame.updates.x ?? element?.x ?? 0) + snap.dx,
          y: (frame.updates.y ?? element?.y ?? 0) + snap.dy,
        },
      }
    }),
  }
}

/** The edge a corner drag is allowed to move. The opposite edge stays put. */
function freeEdges(corner: ResizeCorner): { x: 'left' | 'right'; y: 'top' | 'bottom' } {
  if (corner === 'se') return { x: 'right', y: 'bottom' }
  if (corner === 'sw') return { x: 'left', y: 'bottom' }
  if (corner === 'ne') return { x: 'right', y: 'top' }
  return { x: 'left', y: 'top' }
}

/**
 * Snaps the moving edges of a resize to a neighbour's edge or centre.
 *
 * The anchored corner does not move, and a snap that would shrink the element
 * below the minimum size is refused — otherwise the guide would lie about a
 * box the gesture cannot actually produce.
 */
export function snapResize(
  box: Rect,
  corner: ResizeCorner,
  others: readonly Rect[],
  threshold: number,
  minSize = MIN_ELEMENT_SIZE,
): { box: Rect; guides: readonly Guide[] } {
  if (!(threshold > 0) || others.length === 0) return { box, guides: [] }
  const free = freeEdges(corner)
  const xs: number[] = []
  const ys: number[] = []
  for (const other of others) {
    if (other.w === 0 && other.h === 0) continue
    xs.push(...axisPositions(other.x, other.w))
    ys.push(...axisPositions(other.y, other.h))
  }
  const movingX = free.x === 'left' ? box.x : box.x + box.w
  const movingY = free.y === 'top' ? box.y : box.y + box.h
  const xSnap = nearest([movingX], xs, threshold)
  const ySnap = nearest([movingY], ys, threshold)
  let { x, y, w, h } = box
  const guides: Guide[] = []
  if (xSnap) {
    if (free.x === 'right') {
      const nextW = xSnap.at - x
      if (nextW >= minSize) {
        w = nextW
        guides.push({ orientation: 'vertical', position: xSnap.at })
      }
    } else {
      const right = x + w
      const nextW = right - xSnap.at
      if (nextW >= minSize) {
        x = xSnap.at
        w = nextW
        guides.push({ orientation: 'vertical', position: xSnap.at })
      }
    }
  }
  if (ySnap) {
    if (free.y === 'bottom') {
      const nextH = ySnap.at - y
      if (nextH >= minSize) {
        h = nextH
        guides.push({ orientation: 'horizontal', position: ySnap.at })
      }
    } else {
      const bottom = y + h
      const nextH = bottom - ySnap.at
      if (nextH >= minSize) {
        y = ySnap.at
        h = nextH
        guides.push({ orientation: 'horizontal', position: ySnap.at })
      }
    }
  }
  if (!guides.length) return { box, guides: [] }
  return { box: { x, y, w, h }, guides }
}

/**
 * Applies edge alignment to a single-element resize frame. The element being
 * resized is not a guide for itself. Connectors are not boxes, so they are
 * not guides either — a flow stored at the origin would otherwise pull every
 * nearby corner there.
 */
export function snapResizeFrames(
  frames: readonly GestureFrame[],
  elements: readonly BoardElement[],
  resizingId: string,
  corner: ResizeCorner,
  threshold: number,
): { frames: GestureFrame[]; guides: readonly Guide[] } {
  const frame = frames.find(item => item.id === resizingId) ?? frames[0]
  if (!frame || !(threshold > 0)) return { frames: [...frames], guides: [] }
  const element = elements.find(item => item.id === frame.id)
  const box: Rect = {
    x: frame.updates.x ?? element?.x ?? 0,
    y: frame.updates.y ?? element?.y ?? 0,
    w: frame.updates.w ?? element?.w ?? 0,
    h: frame.updates.h ?? element?.h ?? 0,
  }
  const others = elements
    .filter(item => item.id !== frame.id && !item.bpmnFlow)
    .map(item => ({ x: item.x, y: item.y, w: item.w ?? 0, h: item.h ?? 0 }))
  const snapped = snapResize(box, corner, others, threshold)
  if (!snapped.guides.length) return { frames: [...frames], guides: [] }
  return {
    guides: snapped.guides,
    frames: frames.map(item => item.id === frame.id
      ? { id: item.id, updates: { ...item.updates, x: snapped.box.x, y: snapped.box.y, w: snapped.box.w, h: snapped.box.h } }
      : item),
  }
}
