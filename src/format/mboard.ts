/**
 * Temporary Phase 1 bridge between the on-disk general graph and BoardElement.
 * Phase 3 converges the models and deletes this module. Keep translation mechanical.
 */
import { CURRENT_SCHEMA_VERSION, type DocEdge, type DocHistory, type DocMeta, type DocNode, type MboardFile, type ProfileConfig } from './types'

type Point = { x: number; y: number }
type BpmnNodeType = 'startEvent' | 'endEvent' | 'task' | 'xorGateway' | 'andGateway' | 'orGateway'

/** Local mirror of frozen App.tsx BoardElement. format/ must not import App.tsx. */
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
  bpmnFlow?: { sourceId: string; targetId: string; flowType?: 'sequence' | 'message'; condition?: string; probability?: number; isDefault?: boolean }
}

export type DocElement = { node: DocNode } | { edge: DocEdge }

export interface SerialiseInput {
  elements: BoardElement[]
  meta: DocMeta
  profileConfig: ProfileConfig
  history: DocHistory
}

export interface DeserialiseOutput {
  elements: BoardElement[]
  meta: DocMeta
  profileConfig: ProfileConfig
  history: DocHistory
}

function defined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function hasEntries(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0
}

function bpmnNodeData(element: BoardElement): Record<string, unknown> {
  return defined({
    nodeType: element.bpmnNodeType,
    durationMs: element.bpmnDurationMs,
    durationDistribution: element.bpmnDurationDistribution,
    durationMinMs: element.bpmnDurationMinMs,
    durationModeMs: element.bpmnDurationModeMs,
    durationMaxMs: element.bpmnDurationMaxMs,
    resourceRole: element.bpmnResourceRole,
    costPerHour: element.bpmnCostPerHour,
    resourceCapacity: element.bpmnResourceCapacity,
    priority: element.bpmnPriority,
  })
}

export function toDocElement(element: BoardElement): DocElement {
  if (element.bpmnFlow) {
    const { sourceId, targetId, flowType, condition, probability, isDefault } = element.bpmnFlow
    const bpmn = defined({ flowType, condition, probability, isDefault })
    const profileData: DocEdge['profileData'] = hasEntries(bpmn) ? { bpmn } : {}
    return {
      edge: defined({
        id: element.id,
        kind: 'connector',
        source: { nodeId: sourceId, anchor: 'auto' },
        target: { nodeId: targetId, anchor: 'auto' },
        style: { color: element.color, stroke: element.stroke ?? null, arrowHead: element.type === 'arrow' ? 'triangle' as const : 'none' as const },
        content: element.text === undefined ? undefined : { label: element.text },
        profileData,
      }),
    }
  }

  const bpmn = bpmnNodeData(element)
  const profileData: DocNode['profileData'] = hasEntries(bpmn) ? { bpmn } : {}
  return {
    node: defined({
      id: element.id,
      kind: element.type,
      parentId: null,
      frame: { x: element.x, y: element.y, w: element.w ?? null, h: element.h ?? null, rotation: element.rotation ?? 0 },
      z: element.zIndex ?? 0,
      style: { color: element.color, fill: element.fill ?? null, stroke: element.stroke ?? null },
      content: defined({ text: element.text, points: element.points, emoji: element.emoji }),
      profileData,
      createdBy: element.createdBy,
    }),
  }
}

export function fromDocNode(node: DocNode): BoardElement {
  const bpmn = node.profileData.bpmn ?? {}
  return defined({
    id: node.id,
    type: node.kind as BoardElement['type'],
    x: node.frame.x,
    y: node.frame.y,
    w: node.frame.w ?? undefined,
    h: node.frame.h ?? undefined,
    rotation: node.frame.rotation === 0 ? undefined : node.frame.rotation,
    zIndex: node.z,
    color: node.style.color,
    fill: node.style.fill ?? undefined,
    stroke: node.style.stroke ?? undefined,
    text: node.content.text,
    points: node.content.points,
    emoji: node.content.emoji,
    createdBy: node.createdBy,
    bpmnNodeType: bpmn.nodeType as BpmnNodeType | undefined,
    bpmnDurationMs: bpmn.durationMs as number | undefined,
    bpmnDurationDistribution: bpmn.durationDistribution as BoardElement['bpmnDurationDistribution'],
    bpmnDurationMinMs: bpmn.durationMinMs as number | undefined,
    bpmnDurationModeMs: bpmn.durationModeMs as number | undefined,
    bpmnDurationMaxMs: bpmn.durationMaxMs as number | undefined,
    bpmnResourceRole: bpmn.resourceRole as string | undefined,
    bpmnCostPerHour: bpmn.costPerHour as number | undefined,
    bpmnResourceCapacity: bpmn.resourceCapacity as number | undefined,
    bpmnPriority: bpmn.priority as number | undefined,
  }) as BoardElement
}

export function fromDocEdge(edge: DocEdge): BoardElement {
  const bpmn = edge.profileData.bpmn ?? {}
  return defined({
    id: edge.id,
    type: edge.style.arrowHead === 'triangle' ? 'arrow' : 'line',
    x: 0,
    y: 0,
    color: edge.style.color,
    stroke: edge.style.stroke ?? undefined,
    text: edge.content?.label,
    bpmnFlow: defined({
      sourceId: edge.source.nodeId,
      targetId: edge.target.nodeId,
      flowType: bpmn.flowType,
      condition: bpmn.condition,
      probability: bpmn.probability,
      isDefault: bpmn.isDefault,
    }),
  }) as BoardElement
}

function profiles(nodes: DocNode[], edges: DocEdge[]): string[] {
  return nodes.some(node => node.profileData.bpmn !== undefined) || edges.some(edge => edge.profileData.bpmn !== undefined)
    ? ['core', 'bpmn']
    : ['core']
}

export function serialise(input: SerialiseInput): MboardFile {
  const nodes: DocNode[] = []
  const edges: DocEdge[] = []
  for (const element of input.elements) {
    const converted = toDocElement(element)
    if ('node' in converted) nodes.push(converted.node)
    else edges.push(converted.edge)
  }
  return normalise({
    format: 'mboard',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { ...input.meta, profiles: profiles(nodes, edges) },
    nodes,
    edges,
    profileConfig: input.profileConfig,
    history: input.history,
    assets: {},
  })
}

export function deserialise(file: MboardFile): DeserialiseOutput {
  return {
    elements: [...file.nodes.map(fromDocNode), ...file.edges.map(fromDocEdge)],
    meta: file.meta,
    profileConfig: file.profileConfig,
    history: file.history,
  }
}

function canonical(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 10_000) / 10_000
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]))
  }
  return value
}

/** Produces a stable, non-mutating representation for byte-comparable saves. */
export function normalise(file: MboardFile): MboardFile {
  const canonicalFile = canonical(file) as MboardFile
  return {
    ...canonicalFile,
    nodes: [...canonicalFile.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...canonicalFile.edges].sort((left, right) => left.id.localeCompare(right.id)),
    assets: {},
  }
}
