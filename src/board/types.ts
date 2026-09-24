/**
 * The in-memory vocabulary of the board.
 *
 * These are the shapes App and every board component speak to each other in.
 * They are deliberately distinct from `src/format/types.ts`: that module
 * describes the on-disk document (nodes/edges, versioned, migration-targeted),
 * while `BoardElement` is the flat, render-ready form held in Yjs and drawn on
 * the canvas. `src/format/mboard.ts` bridges the two.
 */

export type Point = { x: number; y: number }

export type Tool =
  | 'select' | 'pan' | 'pen' | 'marker' | 'eraser' | 'sticky' | 'text'
  | 'rect' | 'circle' | 'arrow' | 'line' | 'laser' | 'emoji'
  | 'bpmnStart' | 'bpmnTask' | 'bpmnEnd' | 'bpmnGateway' | 'bpmnParallel' | 'bpmnSequence'

export type BpmnNodeType = 'startEvent' | 'endEvent' | 'task' | 'xorGateway' | 'andGateway' | 'orGateway'

/**
 * The same list at runtime, next to the type so the two cannot drift.
 *
 * Both untrusted entry points — the clipboard and an opened .mboard file —
 * used to cast this field instead of checking it. The Rust engine
 * deserialises it into a strict enum, so a single unrecognised value makes
 * the whole model fail to parse: one bad element and the board reports
 * "Не удалось проверить BPMN-модель." for every other node too.
 */
export const BPMN_NODE_TYPES: readonly BpmnNodeType[] = [
  'startEvent', 'endEvent', 'task', 'xorGateway', 'andGateway', 'orGateway',
]

export function isBpmnNodeType(value: unknown): value is BpmnNodeType {
  return typeof value === 'string' && (BPMN_NODE_TYPES as readonly string[]).includes(value)
}

export type WorkspaceMode = 'board' | 'bpmn' | 'simulation'

export type QueuePolicy = 'fifo' | 'priority'

export type ArrivalClassDraft = { count: string; intervalSec: string; priority: string }

export type RolePolicyDraft = { capacity: string; queuePolicy: QueuePolicy }

export type ImportedBpmnModel = {
  nodes: {
    id: string
    type: string
    name?: string
    x?: number
    y?: number
    width?: number
    height?: number
    durationMs?: number
    durationDistribution?: 'fixed' | 'uniform' | 'triangular'
    durationMinMs?: number
    durationModeMs?: number
    durationMaxMs?: number
    resourceRole?: string
    costPerHour?: number
    resourceCapacity?: number
    priority?: number
  }[]
  flows: {
    id: string
    sourceId: string
    targetId: string
    flowType?: 'sequence' | 'message'
    condition?: string
    probability?: number
    isDefault?: boolean
  }[]
  arrivalClasses?: { count: number; intervalMs: number; priority: number }[]
  resourceRoles?: { name: string; capacity: number; queuePolicy?: QueuePolicy }[]
}

export type BpmnSimulationResult = {
  seed: number
  runs: number
  completedRuns: number
  simulationInstances: number
  arrivalIntervalMs: number
  minDurationMs: number
  meanDurationMs: number
  standardDeviationMs: number
  p50DurationMs: number
  p90DurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  meanCost: number
  slaTargetMs?: number
  onTimeRate?: number
  roleUtilization: {
    role: string
    capacity: number
    meanWorkloadMs: number
    meanWaitingMs: number
    utilization: number
  }[]
  priorityClasses: { priority: number; instances: number; meanWaitingMs: number; meanDurationMs: number }[]
}

export type EducationalExample = {
  title: string
  explanation: string
  checks: string[]
  model: ImportedBpmnModel
}

export type ElementType = 'path' | 'sticky' | 'rect' | 'circle' | 'arrow' | 'line' | 'text' | 'emoji'

/**
 * The renderer's switch has no default case beyond `return null`, so an element
 * of an unknown type is invisible while still occupying the document and being
 * written back out on save. Both untrusted entry points must reject it.
 */
export const ELEMENT_TYPES: readonly ElementType[] = [
  'path', 'sticky', 'rect', 'circle', 'arrow', 'line', 'text', 'emoji',
]

export function isElementType(value: unknown): value is ElementType {
  return typeof value === 'string' && (ELEMENT_TYPES as readonly string[]).includes(value)
}

/**
 * Optional attachment of a freeform arrow or line. Not a BPMN edge: either end
 * may be absent, and an id that does not name a shape is ignored.
 */
export interface ElementLink {
  sourceId?: string
  targetId?: string
}

/** Keeps only non-empty string ids. Anything else is not an attachment. */
export function elementLink(value: unknown): ElementLink | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const link: ElementLink = {}
  if (typeof raw.sourceId === 'string' && raw.sourceId.length > 0) link.sourceId = raw.sourceId
  if (typeof raw.targetId === 'string' && raw.targetId.length > 0) link.targetId = raw.targetId
  return link.sourceId || link.targetId ? link : undefined
}

/** A freeform attachment. A connector follows `bpmnFlow`, not this. */
export function hasElementLink(element: { type?: string; bpmnFlow?: unknown; link?: ElementLink }): boolean {
  if (element.bpmnFlow) return false
  if (element.type && element.type !== 'arrow' && element.type !== 'line') return false
  return Boolean(element.link && (element.link.sourceId || element.link.targetId))
}

export interface BoardElement {
  id: string
  type: ElementType
  x: number
  y: number
  w?: number
  h?: number
  points?: Point[]
  text?: string
  color: string
  stroke?: number
  /**
   * Stroke pattern. Only `'dashed'` is stored; absence is a solid stroke.
   * Meaningful on an arrow or a line, including a BPMN connector.
   */
  dash?: 'dashed'
  fill?: string
  rotation?: number
  /**
   * When true, drag, nudge, resize and rotate leave the element where it is.
   * Absent means unlocked. Never set on a connector.
   */
  locked?: boolean
  createdBy?: string
  emoji?: string
  zIndex?: number
  /**
   * Shared group token. Absent when the element is ungrouped. Persisted as
   * `parentId`; not a node id, and never set on a connector.
   */
  groupId?: string
  bpmnNodeType?: BpmnNodeType
  bpmnDurationMs?: number
  bpmnDurationDistribution?: 'fixed' | 'uniform' | 'triangular'
  bpmnDurationMinMs?: number
  bpmnDurationModeMs?: number
  bpmnDurationMaxMs?: number
  bpmnResourceRole?: string
  bpmnCostPerHour?: number
  bpmnResourceCapacity?: number
  bpmnPriority?: number
  bpmnFlow?: {
    sourceId: string
    targetId: string
    flowType?: 'sequence' | 'message'
    condition?: string
    probability?: number
    isDefault?: boolean
  }
  /**
   * Shapes a freeform arrow or line follows. Absent when the mark is free.
   * Never set on a connector — that relationship is `bpmnFlow`.
   */
  link?: ElementLink
  /**
   * World bend points of an arrow or a line. Absent when the mark is straight.
   * A shape moving does not move these; moving the mark itself does.
   */
  waypoints?: Point[]
  /**
   * Caption shift from the middle of the route, in world pixels. Absent means
   * the caption sits on the route. Not a world point: moving the mark carries it.
   */
  labelOffset?: Point
}

export type ContextMenuAction = 'edit' | 'duplicate' | 'lock' | 'front' | 'back' | 'delete'

/** A destructive open that the user has already agreed to, waiting to run. */
export type PendingOpen = { proceed: () => Promise<void> }
