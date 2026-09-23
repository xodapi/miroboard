/**
 * Align a multi-selection to one shared edge or center.
 *
 * The reference is the union of the selected units, not the average of their
 * centers: a wide sticky and a narrow one meet on the box that already contains
 * both. A group is one rigid unit — members keep their gaps — and a unit with
 * any locked member stays put, still defining that edge. Equal spacing is a
 * different operation and is not computed here.
 *
 * Connectors are not units. Their drawn geometry comes from the endpoints, so
 * writing their stored x/y would dirty the file without moving the arrow.
 * Bounds are the stored frame (`boundsOf`), including a negative line, not the
 * axis-aligned box of a rotated shape.
 */
import { boundsOf, type Bounds } from '../collab/marquee'
import { expandIds, membership } from './group'
import { isLocked } from './lock'
import type { BoardElement } from './types'

export const ALIGN_AXES = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'] as const

export type AlignAxis = typeof ALIGN_AXES[number]

export interface AlignMove {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Frame {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

interface Unit {
  readonly members: readonly BoardElement[]
  readonly frame: Frame
  readonly locked: boolean
}

function frameOf(bounds: Bounds): Frame | null {
  const left = Math.min(bounds.minX, bounds.maxX)
  const right = Math.max(bounds.minX, bounds.maxX)
  const top = Math.min(bounds.minY, bounds.maxY)
  const bottom = Math.max(bounds.minY, bounds.maxY)
  if (![left, right, top, bottom].every(Number.isFinite)) return null
  return { left, right, top, bottom }
}

function unionFrames(frames: readonly Frame[]): Frame {
  return {
    left: Math.min(...frames.map(frame => frame.left)),
    right: Math.max(...frames.map(frame => frame.right)),
    top: Math.min(...frames.map(frame => frame.top)),
    bottom: Math.max(...frames.map(frame => frame.bottom)),
  }
}

function unitsOf(elements: readonly BoardElement[], ids: Iterable<string>): Unit[] {
  const expanded = expandIds(elements, ids)
  const covered = new Set(expanded)
  const consumed = new Set<string>()
  const units: Unit[] = []
  for (const id of expanded) {
    if (consumed.has(id)) continue
    const element = elements.find(candidate => candidate.id === id)
    if (!element || element.bpmnFlow) {
      consumed.add(id)
      continue
    }
    const token = membership(element)
    const members = token
      ? elements.filter(candidate => covered.has(candidate.id) && membership(candidate) === token && !candidate.bpmnFlow)
      : [element]
    for (const member of members) consumed.add(member.id)
    const frames: Frame[] = []
    for (const member of members) {
      const bounds = boundsOf(member)
      const frame = bounds ? frameOf(bounds) : null
      if (frame) frames.push(frame)
    }
    if (!frames.length) continue
    units.push({
      members,
      frame: unionFrames(frames),
      locked: members.some(isLocked),
    })
  }
  return units
}

/** How many rigid bodies this selection would align. One is a no-op. */
export function alignUnitCount(elements: readonly BoardElement[], ids: Iterable<string>): number {
  return unitsOf(elements, ids).length
}

function edge(axis: AlignAxis, frame: Frame): number {
  if (axis === 'left') return frame.left
  if (axis === 'right') return frame.right
  if (axis === 'centerX') return (frame.left + frame.right) / 2
  if (axis === 'top') return frame.top
  if (axis === 'bottom') return frame.bottom
  return (frame.top + frame.bottom) / 2
}

function horizontal(axis: AlignAxis): boolean {
  return axis === 'left' || axis === 'centerX' || axis === 'right'
}

/** Four decimal places, the same rounding the file uses for coordinates. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/**
 * Absolute positions to write. Empty when fewer than two units can be aligned,
 * or every movable unit is already on the target edge — callers must not open
 * a transaction for that.
 */
export function planAlign(
  elements: readonly BoardElement[],
  ids: Iterable<string>,
  axis: AlignAxis,
): AlignMove[] {
  const units = unitsOf(elements, ids)
  if (units.length < 2) return []
  const target = edge(axis, unionFrames(units.map(unit => unit.frame)))
  const alongX = horizontal(axis)
  const deltaById = new Map<string, { dx: number; dy: number }>()
  for (const unit of units) {
    if (unit.locked) continue
    const delta = target - edge(axis, unit.frame)
    if (delta === 0) continue
    const shift = alongX ? { dx: delta, dy: 0 } : { dx: 0, dy: delta }
    for (const member of unit.members) {
      if (member.bpmnFlow || isLocked(member)) continue
      deltaById.set(member.id, shift)
    }
  }
  const moves: AlignMove[] = []
  for (const element of elements) {
    const shift = deltaById.get(element.id)
    if (!shift) continue
    const x = round4(element.x + shift.dx)
    const y = round4(element.y + shift.dy)
    if (x === element.x && y === element.y) continue
    moves.push({ id: element.id, x, y })
  }
  return moves
}
