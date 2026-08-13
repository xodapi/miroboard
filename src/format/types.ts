/** Bumped only for breaking changes to the on-disk document format. */
export const CURRENT_SCHEMA_VERSION = 1 as const

export interface MboardFile {
  format: 'mboard'
  schemaVersion: number
  meta: DocMeta
  nodes: DocNode[]
  edges: DocEdge[]
  profileConfig: ProfileConfig
  history: DocHistory
  assets: Record<string, never>
}

export interface DocMeta {
  id: string
  title: string
  /** Optional user-authored description, preserved verbatim when present. */
  description?: string | null
  createdAt: string
  updatedAt: string
  createdWith: { version: string; commit: string }
  profiles: string[]
}

export interface Frame {
  x: number
  y: number
  w: number | null
  h: number | null
  rotation: number
}

export interface NodeStyle {
  color: string
  fill: string | null
  stroke: number | null
}

export interface NodeContent {
  text?: string
  points?: { x: number; y: number }[]
  emoji?: string
}

export interface DocNode {
  id: string
  /** Original in-memory element index, used to restore rendering order on load. */
  order: number
  kind: string
  parentId: string | null
  frame: Frame
  z: number
  style: NodeStyle
  content: NodeContent
  profileData: Record<string, Record<string, unknown>>
  createdBy?: string
}

export interface EndpointRef {
  nodeId: string
  anchor: 'auto' | string
}

export interface EdgeStyle {
  color: string
  stroke: number | null
  arrowHead: 'none' | 'triangle'
}

export interface DocEdge {
  id: string
  /** Original in-memory element index, used to restore rendering order on load. */
  order: number
  kind: string
  source: EndpointRef
  target: EndpointRef
  waypoints?: { x: number; y: number }[]
  style: EdgeStyle
  content?: { label?: string; offset?: { x: number; y: number } }
  profileData: Record<string, Record<string, unknown>>
}

export interface ProfileConfig {
  bpmn?: BpmnProfileConfig
  [namespace: string]: unknown
}

export interface BpmnProfileConfig {
  simulation: {
    seed: string
    runs: string
    slaTargetSec: string
    instances: string
    arrivalIntervalSec: string
    calendarStartHour: string
    calendarEndHour: string
    arrivalClasses: { count: string; intervalSec: string; priority: string }[]
    rolePolicies: Record<string, { capacity: string; queuePolicy: 'fifo' | 'priority' }>
  }
}

export interface DocHistory {
  yjsState: string | null
  snapshots: HistorySnapshot[]
  retention: RetentionPolicy
}

export interface HistorySnapshot {
  id: string
  at: string
  kind: 'auto' | 'named'
  label?: string
  snapshot: string
  elementCount: number
}

export type RetentionPolicy = Readonly<{
  keepAllNamed: true
  keepLastAuto: number
  decayBucketsHours: number[]
  maxSnapshots: number
  maxHistoryRatio: number
}>
