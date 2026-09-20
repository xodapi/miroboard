/**
 * The board clipboard: copy, cut and paste of whole selections.
 *
 * Why this is a module and not a few lines in App.tsx:
 *
 * - Pasting is untrusted input. A payload can arrive from another tab, another
 *   browser, or a text file the user kept for later, so every field has to be
 *   validated before it reaches the document. Validation that lives next to
 *   React state cannot be tested; here it can.
 * - A paste has to become *new* elements with *new* ids. Ids are the identity
 *   used by Yjs, by undo, and by `bpmnFlow.sourceId`/`targetId`, so remapping
 *   them wrongly either collides with the source elements or silently rewires
 *   flows onto unrelated nodes.
 * - Collaboration will later carry the same payload across the wire. Keeping
 *   the format in one place means the network encoding and the clipboard
 *   encoding cannot drift apart.
 *
 * Format: a self-describing JSON document written to the clipboard as
 * `text/plain`, so it survives `file://` deployments (where the async Clipboard
 * API is frequently unavailable) and can be inspected by a human. The declared
 * media type travels *inside* the payload as `kind`, which is what a future
 * native clipboard integration would use for a real custom MIME type.
 */
import type { BoardElement } from '../format/mboard'

/** Declared media type of a miroboard clipboard payload. */
export const CLIPBOARD_MIME = 'application/x-miroboard+json'

/** Bumped when the payload shape changes in a way old readers cannot handle. */
export const CLIPBOARD_VERSION = 1

/** Guard against a pathological payload freezing the tab on paste. */
export const MAX_PASTE_ELEMENTS = 5_000

/** Offset applied to pasted elements so they do not land exactly on the source. */
export const PASTE_OFFSET = 20

export interface ClipboardPayload {
  kind: typeof CLIPBOARD_MIME
  version: number
  elements: BoardElement[]
}

const ELEMENT_TYPES: ReadonlySet<BoardElement['type']> = new Set([
  'path', 'sticky', 'rect', 'circle', 'arrow', 'line', 'text', 'emoji',
])

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function toPoint(value: unknown): { x: number; y: number } | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) return null
  return { x: candidate.x, y: candidate.y }
}

function toPoints(value: unknown): { x: number; y: number }[] | undefined {
  if (!Array.isArray(value)) return undefined
  const points = value.map(toPoint).filter((point): point is { x: number; y: number } => point !== null)
  return points.length ? points : undefined
}

/**
 * Validates one element of an incoming payload.
 *
 * Deliberately tolerant about *optional* fields and strict about the ones the
 * renderer cannot live without: `id`, `type`, `x`, `y`. Anything of the wrong
 * shape is dropped rather than coerced, except `color`, which every element
 * must carry and which defaults to transparent — an invisible element can be
 * deleted, a crashed render cannot.
 */
export function sanitiseElement(value: unknown): BoardElement | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!isNonEmptyString(raw.id)) return null
  if (typeof raw.type !== 'string' || !ELEMENT_TYPES.has(raw.type as BoardElement['type'])) return null
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return null

  const element: BoardElement = {
    id: raw.id,
    type: raw.type as BoardElement['type'],
    x: raw.x,
    y: raw.y,
    color: typeof raw.color === 'string' ? raw.color : 'transparent',
  }

  if (isFiniteNumber(raw.w)) element.w = raw.w
  if (isFiniteNumber(raw.h)) element.h = raw.h
  if (isFiniteNumber(raw.stroke)) element.stroke = raw.stroke
  if (isFiniteNumber(raw.rotation)) element.rotation = raw.rotation
  if (isFiniteNumber(raw.zIndex)) element.zIndex = raw.zIndex
  if (typeof raw.text === 'string') element.text = raw.text
  if (typeof raw.fill === 'string') element.fill = raw.fill
  if (typeof raw.emoji === 'string') element.emoji = raw.emoji
  if (typeof raw.createdBy === 'string') element.createdBy = raw.createdBy
  const points = toPoints(raw.points)
  if (points) element.points = points
  const waypoints = toPoints(raw.waypoints)
  if (waypoints) element.waypoints = waypoints
  const labelOffset = toPoint(raw.labelOffset)
  if (labelOffset) element.labelOffset = labelOffset

  if (typeof raw.bpmnNodeType === 'string') element.bpmnNodeType = raw.bpmnNodeType as BoardElement['bpmnNodeType']
  for (const key of [
    'bpmnDurationMs', 'bpmnDurationMinMs', 'bpmnDurationModeMs', 'bpmnDurationMaxMs',
    'bpmnCostPerHour', 'bpmnResourceCapacity', 'bpmnPriority',
  ] as const) {
    if (isFiniteNumber(raw[key])) element[key] = raw[key]
  }
  if (raw.bpmnDurationDistribution === 'fixed' || raw.bpmnDurationDistribution === 'uniform' || raw.bpmnDurationDistribution === 'triangular') {
    element.bpmnDurationDistribution = raw.bpmnDurationDistribution
  }
  if (typeof raw.bpmnResourceRole === 'string') element.bpmnResourceRole = raw.bpmnResourceRole

  if (typeof raw.bpmnFlow === 'object' && raw.bpmnFlow !== null) {
    const flow = raw.bpmnFlow as Record<string, unknown>
    if (isNonEmptyString(flow.sourceId) && isNonEmptyString(flow.targetId)) {
      const bpmnFlow: NonNullable<BoardElement['bpmnFlow']> = { sourceId: flow.sourceId, targetId: flow.targetId }
      if (flow.flowType === 'sequence' || flow.flowType === 'message') bpmnFlow.flowType = flow.flowType
      if (typeof flow.condition === 'string') bpmnFlow.condition = flow.condition
      if (isFiniteNumber(flow.probability)) bpmnFlow.probability = flow.probability
      if (typeof flow.isDefault === 'boolean') bpmnFlow.isDefault = flow.isDefault
      element.bpmnFlow = bpmnFlow
    }
  }

  return element
}

/** Builds the clipboard payload for a selection, preserving z-order. */
export function serialiseSelection(elements: readonly BoardElement[]): string {
  const payload: ClipboardPayload = {
    kind: CLIPBOARD_MIME,
    version: CLIPBOARD_VERSION,
    elements: elements.map(element => ({ ...element })),
  }
  return JSON.stringify(payload)
}

/**
 * Parses clipboard text.
 *
 * Returns `null` for anything that is not a miroboard payload — the caller must
 * treat that as "nothing to paste" and never as an error, because the system
 * clipboard is shared with every other application. Returns `[]` for a valid
 * but empty payload, which is a real state worth distinguishing.
 */
export function parseClipboard(raw: string | null | undefined): BoardElement[] | null {
  if (!isNonEmptyString(raw)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const payload = parsed as Record<string, unknown>
  if (payload.kind !== CLIPBOARD_MIME) return null
  if (payload.version !== CLIPBOARD_VERSION) return null
  if (!Array.isArray(payload.elements)) return null

  const elements: BoardElement[] = []
  const seen = new Set<string>()
  for (const candidate of payload.elements.slice(0, MAX_PASTE_ELEMENTS)) {
    const element = sanitiseElement(candidate)
    // A payload with duplicate ids would paste two elements fighting over one
    // identity; keep the first and drop the rest.
    if (!element || seen.has(element.id)) continue
    seen.add(element.id)
    elements.push(element)
  }
  return elements
}

export interface PasteOptions {
  /** Creates the id for a pasted element. Defaults to a counter-based id. */
  makeId?: (sourceId: string, index: number) => string
  /** Displacement applied to every pasted element. */
  offset?: { x: number; y: number }
  /** Attribution for the new elements — the pasting participant, not the original author. */
  createdBy?: string
}

/**
 * Turns clipboard elements into new board elements.
 *
 * Every element gets a fresh id, and `bpmnFlow` endpoints are remapped through
 * the same table, so a copied process fragment stays connected to *itself*
 * after the paste. A flow whose endpoints are not both inside the payload is
 * dropped: keeping it would either dangle or, worse, reconnect to an unrelated
 * board element that happens to carry the same id.
 */
export function preparePaste(elements: readonly BoardElement[], options: PasteOptions = {}): BoardElement[] {
  const offset = options.offset ?? { x: PASTE_OFFSET, y: PASTE_OFFSET }
  const makeId = options.makeId ?? ((sourceId, index) => `${sourceId}-copy-${index}`)

  const idMap = new Map<string, string>()
  elements.forEach((element, index) => {
    idMap.set(element.id, makeId(element.id, index))
  })

  return elements.map(element => {
    const pasted: BoardElement = {
      ...element,
      id: idMap.get(element.id) ?? element.id,
      x: element.x + offset.x,
      y: element.y + offset.y,
    }
    if (options.createdBy !== undefined) pasted.createdBy = options.createdBy
    if (element.bpmnFlow) {
      const sourceId = idMap.get(element.bpmnFlow.sourceId)
      const targetId = idMap.get(element.bpmnFlow.targetId)
      if (sourceId && targetId) pasted.bpmnFlow = { ...element.bpmnFlow, sourceId, targetId }
      else delete pasted.bpmnFlow
    }
    return pasted
  })
}

/**
 * Copy and paste in one step: what Ctrl+V does with the selection in hand.
 * Exported separately so callers (and tests) do not have to compose the two.
 */
export function roundTrip(elements: readonly BoardElement[], options: PasteOptions = {}): BoardElement[] {
  const parsed = parseClipboard(serialiseSelection(elements))
  if (!parsed) return []
  return preparePaste(parsed, options)
}
