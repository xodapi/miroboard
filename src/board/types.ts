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

export interface BoardElement {
  id: string
  type: 'path' | 'sticky' | 'rect' | 'circle' | 'arrow' | 'line' | 'text' | 'emoji'
  x: number
  y: number
  w?: number
  h?: number
  points?: Point[]
  text?: string
  color: string
  stroke?: number
  fill?: string
  rotation?: number
  createdBy?: string
  emoji?: string
  zIndex?: number
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
}

export type ContextMenuAction = 'edit' | 'duplicate' | 'front' | 'back' | 'delete'

/** A destructive open that the user has already agreed to, waiting to run. */
export type PendingOpen = { proceed: () => Promise<void> }
