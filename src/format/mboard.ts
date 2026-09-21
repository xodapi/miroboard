/**
 * Temporary Phase 1 bridge between the on-disk general graph and BoardElement.
 * Phase 3 converges the models and deletes this module. Keep translation mechanical.
 */
import { CURRENT_SCHEMA_VERSION, type DocEdge, type DocHistory, type DocMeta, type DocNode, type MboardFile, type ProfileConfig } from './types'
// board/types.ts is a dependency-free type module, not App.tsx: importing the
// node-type list from there keeps one list instead of a third copy to drift.
import { isBpmnNodeType, type BpmnNodeType } from '../board/types'

type Point = { x: number; y: number }

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
  waypoints?: Point[]
  labelOffset?: Point
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

const elementExtras = new WeakMap<object, Record<string, unknown>>()
const documentExtras = new WeakMap<object, Record<string, unknown>>()

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
        order: 0,
        kind: 'connector',
        source: { nodeId: sourceId, anchor: 'auto' },
        target: { nodeId: targetId, anchor: 'auto' },
        style: { color: element.color, stroke: element.stroke ?? null, arrowHead: element.type === 'arrow' ? 'triangle' as const : 'none' as const },
        waypoints: element.waypoints,
        content: element.text === undefined && element.labelOffset === undefined
          ? undefined
          : defined({ label: element.text, offset: element.labelOffset }),
        profileData,
      }),
    }
  }

  const bpmn = bpmnNodeData(element)
  const profileData: DocNode['profileData'] = hasEntries(bpmn) ? { bpmn } : {}
  return {
    node: defined({
      id: element.id,
      order: 0,
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
  const element = defined({
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
    // Checked rather than cast: the Rust engine's enum refuses to deserialise
    // an unknown value, taking validation of the whole model down with it. The
    // original is preserved below, so a nodeType from a newer version survives
    // a load/save cycle even though this client will not act on it.
    bpmnNodeType: isBpmnNodeType(bpmn.nodeType) ? bpmn.nodeType : undefined,
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
  const extras: Record<string, unknown> = {
    ...unknownKeys(node as unknown as Record<string, unknown>, NODE_KEYS),
    profileData: profileExtras(node.profileData),
  }
  // A nodeType this version does not recognise is dropped from the in-memory
  // element but kept in the extras, so saving writes back what was opened.
  // FORMAT.md makes unknown-data preservation a guarantee of the v1 format,
  // and rejecting a value for our own engine must not turn into deleting the
  // user's data.
  if (bpmn.nodeType !== undefined && !isBpmnNodeType(bpmn.nodeType)) {
    const profileData = extras.profileData as Record<string, Record<string, unknown>>
    extras.profileData = { ...profileData, bpmn: { ...profileData.bpmn, nodeType: bpmn.nodeType } }
  }
  elementExtras.set(element, extras)
  return element
}

export function fromDocEdge(edge: DocEdge): BoardElement {
  const bpmn = edge.profileData.bpmn ?? {}
  const element = defined({
    id: edge.id,
    type: edge.style.arrowHead === 'triangle' ? 'arrow' : 'line',
    x: 0,
    y: 0,
    color: edge.style.color,
    stroke: edge.style.stroke ?? undefined,
    text: edge.content?.label,
    waypoints: edge.waypoints,
    labelOffset: edge.content?.offset,
    bpmnFlow: defined({
      sourceId: edge.source.nodeId,
      targetId: edge.target.nodeId,
      flowType: bpmn.flowType,
      condition: bpmn.condition,
      probability: bpmn.probability,
      isDefault: bpmn.isDefault,
    }),
  }) as BoardElement
  elementExtras.set(element, { ...unknownKeys(edge as unknown as Record<string, unknown>, EDGE_KEYS), profileData: profileExtras(edge.profileData) })
  return element
}

/**
 * Projection used by the element round-trip property.
 *
 * Nodes use the in-memory convention that zero rotation and zero z are
 * defaults. Edges are rendered from their endpoints, so their x/y are not
 * semantic and are intentionally excluded. All other BoardElement fields are
 * compared, including edge routing and label placement.
 */
export function canonicalElement(element: BoardElement): BoardElement {
  const result = { ...element } as BoardElement
  if (result.rotation === 0) delete result.rotation
  if (result.zIndex === undefined) result.zIndex = 0
  if (result.bpmnFlow) {
    result.x = 0
    result.y = 0
  }
  if (result.bpmnFlow) {
    delete result.w
    delete result.h
    delete result.rotation
    delete result.zIndex
    delete result.fill
    delete result.createdBy
    delete result.emoji
    delete result.points
  }
  return result
}

/** Derives the active document profiles from namespaced element data. */
export function detectProfiles(nodes: DocNode[], edges: DocEdge[]): string[] {
  return nodes.some(node => node.profileData.bpmn !== undefined) || edges.some(edge => edge.profileData.bpmn !== undefined)
    ? ['core', 'bpmn']
    : ['core']
}

export function serialise(input: SerialiseInput): MboardFile {
  const nodes: DocNode[] = []
  const edges: DocEdge[] = []
  input.elements.forEach((element, index) => {
    const converted = toDocElement(element)
    if ('node' in converted) nodes.push({ ...mergeUnknown(converted.node, elementExtras.get(input.elements[index])) as DocNode, order: index })
    else edges.push({ ...mergeUnknown(converted.edge, elementExtras.get(input.elements[index])) as DocEdge, order: index })
  })
  const rootExtras = documentExtras.get(input.meta) ?? {}
  const pairedHistory = input.history.yjsState
    ? input.history.snapshots.length > 0
      ? input.history
      : { ...input.history, yjsState: null }
    : { ...input.history, snapshots: [] }
  return normalise({
    ...rootExtras,
    format: 'mboard',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { ...input.meta, profiles: detectProfiles(nodes, edges) },
    nodes,
    edges,
    profileConfig: input.profileConfig,
    history: pairedHistory,
    assets: {},
  })
}

export function deserialise(file: MboardFile): DeserialiseOutput {
  const elements = [...file.nodes, ...file.edges]
    .sort((left, right) => left.order - right.order)
    .map(element => 'frame' in element ? fromDocNode(element) : fromDocEdge(element))
  documentExtras.set(file.meta, unknownKeys(file as unknown as Record<string, unknown>, ROOT_KEYS))
  return {
    elements,
    meta: file.meta,
    profileConfig: file.profileConfig,
    history: file.history,
  }
}

const ROOT_KEYS = new Set(['format', 'schemaVersion', 'meta', 'nodes', 'edges', 'profileConfig', 'history', 'assets'])
const NODE_KEYS = new Set(['id', 'order', 'kind', 'parentId', 'frame', 'z', 'style', 'content', 'profileData', 'createdBy'])
const EDGE_KEYS = new Set(['id', 'order', 'kind', 'source', 'target', 'waypoints', 'style', 'content', 'profileData'])

function unknownKeys(value: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !known.has(key)))
}

function mergeUnknown<T>(value: T, extras: Record<string, unknown> | undefined): T {
  if (!extras) return value
  const valueRecord = value as Record<string, unknown>
  const merged = { ...extras, ...valueRecord } as Record<string, unknown>
  if (extras.profileData && valueRecord.profileData) {
    merged.profileData = { ...extras.profileData as Record<string, unknown>, ...valueRecord.profileData as Record<string, unknown> }
    const oldBpmn = (extras.profileData as Record<string, unknown>).bpmn
    const newBpmn = (valueRecord.profileData as Record<string, unknown>).bpmn
    // A preserved bpmn namespace must survive even when this version produced
    // no bpmn data of its own: an element whose only BPMN field was a nodeType
    // we do not recognise round-trips to profileData: {} otherwise, silently
    // deleting it from the user's file.
    if (oldBpmn && newBpmn) (merged.profileData as Record<string, unknown>).bpmn = { ...oldBpmn as Record<string, unknown>, ...newBpmn as Record<string, unknown> }
    else if (oldBpmn && hasEntries(oldBpmn as Record<string, unknown>)) (merged.profileData as Record<string, unknown>).bpmn = oldBpmn
  }
  return merged as T
}
function profileExtras(profileData: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(profileData).map(([namespace, data]) => [
    namespace,
    namespace === 'bpmn' ? unknownKeys(data, new Set(['nodeType', 'durationMs', 'durationDistribution', 'durationMinMs', 'durationModeMs', 'durationMaxMs', 'resourceRole', 'costPerHour', 'resourceCapacity', 'priority', 'flowType', 'condition', 'probability', 'isDefault'])) : data,
  ]))
}

function canonical(value: unknown, key?: string, ancestors = new WeakSet<object>()): unknown {
  if (typeof value === 'number' && ['x', 'y', 'w', 'h', 'rotation'].includes(key ?? '')) return Math.round(value * 10_000) / 10_000
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('Cannot normalise cyclic structure')
    ancestors.add(value)
    try {
      return value.map(item => canonical(item, key, ancestors))
    } finally {
      ancestors.delete(value)
    }
  }
  if (value && typeof value === 'object') {
    if (ancestors.has(value)) throw new TypeError('Cannot normalise cyclic structure')
    ancestors.add(value)
    try {
      return Object.fromEntries(Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([childKey, item]) => [childKey, canonical(item, childKey, ancestors)]))
    } finally {
      ancestors.delete(value)
    }
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
