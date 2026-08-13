import { CURRENT_SCHEMA_VERSION, type MboardFile } from './types'
import { runMigrations } from './migrations'

export type LoadFailure =
  | { kind: 'not-mboard' }
  | { kind: 'too-new'; found: number; supported: number }
  | { kind: 'invalid'; errors: string[] }

export type LoadResult =
  | { ok: true; file: MboardFile; migratedFrom?: number }
  | { ok: false; failure: LoadFailure }

type RecordValue = Record<string, unknown>

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function parseRaw(raw: unknown): { value: unknown } | { error: string } {
  if (typeof raw !== 'string') return { value: raw }
  try {
    return { value: JSON.parse(raw) }
  } catch {
    return { error: 'Invalid JSON: unable to parse document' }
  }
}

function requireField(value: RecordValue, field: string, errors: string[]): unknown {
  if (!(field in value)) {
    errors.push(`Missing required field: ${field}`)
    return undefined
  }
  return value[field]
}

function validateString(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== 'string') errors.push(`${path} must be a string`)
}

function validateNumber(value: unknown, path: string, errors: string[]): void {
  if (!isFiniteNumber(value)) errors.push(`${path} must be a finite number`)
}

function validateNullableNumber(value: unknown, path: string, errors: string[]): void {
  if (value !== null) validateNumber(value, path, errors)
}

function validateObject(value: unknown, path: string, errors: string[]): RecordValue | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  return value
}

function validateMeta(value: unknown, errors: string[]): void {
  const meta = validateObject(value, 'meta', errors)
  if (!meta) return
  for (const field of ['id', 'title', 'createdAt', 'updatedAt']) {
    validateString(requireField(meta, field, errors), `meta.${field}`, errors)
  }
  const createdWith = validateObject(requireField(meta, 'createdWith', errors), 'meta.createdWith', errors)
  if (createdWith) {
    validateString(requireField(createdWith, 'version', errors), 'meta.createdWith.version', errors)
    validateString(requireField(createdWith, 'commit', errors), 'meta.createdWith.commit', errors)
  }
  const profiles = requireField(meta, 'profiles', errors)
  if (!Array.isArray(profiles) || profiles.some(profile => typeof profile !== 'string')) {
    errors.push('meta.profiles must be an array of strings')
  }
}

function validateNode(value: unknown, index: number, errors: string[]): void {
  const path = `nodes[${index}]`
  const node = validateObject(value, path, errors)
  if (!node) return
  validateString(requireField(node, 'id', errors), `${path}.id`, errors)
  validateString(requireField(node, 'kind', errors), `${path}.kind`, errors)
  const parentId = requireField(node, 'parentId', errors)
  if (parentId !== null && typeof parentId !== 'string') errors.push(`${path}.parentId must be a string or null`)
  const frame = validateObject(requireField(node, 'frame', errors), `${path}.frame`, errors)
  if (frame) {
    for (const field of ['x', 'y', 'rotation']) validateNumber(requireField(frame, field, errors), `${path}.frame.${field}`, errors)
    for (const field of ['w', 'h']) validateNullableNumber(requireField(frame, field, errors), `${path}.frame.${field}`, errors)
  }
  validateNumber(requireField(node, 'z', errors), `${path}.z`, errors)
  const style = validateObject(requireField(node, 'style', errors), `${path}.style`, errors)
  if (style) {
    validateString(requireField(style, 'color', errors), `${path}.style.color`, errors)
    validateNullableNumber(requireField(style, 'stroke', errors), `${path}.style.stroke`, errors)
    const fill = requireField(style, 'fill', errors)
    if (fill !== null && typeof fill !== 'string') errors.push(`${path}.style.fill must be a string or null`)
  }
  validateObject(requireField(node, 'content', errors), `${path}.content`, errors)
  const profileData = validateObject(requireField(node, 'profileData', errors), `${path}.profileData`, errors)
  if (profileData && 'bpmn' in profileData) {
    const bpmn = validateObject(profileData.bpmn, `${path}.profileData.bpmn`, errors)
    if (bpmn && typeof bpmn.nodeType !== 'string') {
      errors.push(`${path} (${typeof node.id === 'string' ? node.id : '<invalid id>'}).profileData.bpmn.nodeType is required`)
    }
  }
}

function validateEndpoint(value: unknown, path: string, errors: string[]): void {
  const endpoint = validateObject(value, path, errors)
  if (!endpoint) return
  validateString(requireField(endpoint, 'nodeId', errors), `${path}.nodeId`, errors)
  validateString(requireField(endpoint, 'anchor', errors), `${path}.anchor`, errors)
}

function validateEdge(value: unknown, index: number, errors: string[]): void {
  const path = `edges[${index}]`
  const edge = validateObject(value, path, errors)
  if (!edge) return
  validateString(requireField(edge, 'id', errors), `${path}.id`, errors)
  validateString(requireField(edge, 'kind', errors), `${path}.kind`, errors)
  validateEndpoint(requireField(edge, 'source', errors), `${path}.source`, errors)
  validateEndpoint(requireField(edge, 'target', errors), `${path}.target`, errors)
  const style = validateObject(requireField(edge, 'style', errors), `${path}.style`, errors)
  if (style) {
    validateString(requireField(style, 'color', errors), `${path}.style.color`, errors)
    validateNullableNumber(requireField(style, 'stroke', errors), `${path}.style.stroke`, errors)
    const arrowHead = requireField(style, 'arrowHead', errors)
    if (arrowHead !== 'none' && arrowHead !== 'triangle') errors.push(`${path}.style.arrowHead must be "none" or "triangle"`)
  }
  validateObject(requireField(edge, 'profileData', errors), `${path}.profileData`, errors)
}

function validateHistory(value: unknown, errors: string[]): void {
  const history = validateObject(value, 'history', errors)
  if (!history) return
  const yjsState = requireField(history, 'yjsState', errors)
  if (yjsState !== null && typeof yjsState !== 'string') errors.push('history.yjsState must be a string or null')
  if (!Array.isArray(requireField(history, 'snapshots', errors))) errors.push('history.snapshots must be an array')
  validateObject(requireField(history, 'retention', errors), 'history.retention', errors)
}

function validateMboard(value: RecordValue): string[] {
  const errors: string[] = []
  validateMeta(requireField(value, 'meta', errors), errors)
  const nodes = requireField(value, 'nodes', errors)
  if (!Array.isArray(nodes)) errors.push('nodes must be an array')
  else nodes.forEach((node, index) => validateNode(node, index, errors))
  const edges = requireField(value, 'edges', errors)
  if (!Array.isArray(edges)) errors.push('edges must be an array')
  else edges.forEach((edge, index) => validateEdge(edge, index, errors))
  if (Array.isArray(nodes)) validateGraphIntegrity(nodes, Array.isArray(edges) ? edges : [], errors)
  validateObject(requireField(value, 'profileConfig', errors), 'profileConfig', errors)
  validateHistory(requireField(value, 'history', errors), errors)
  validateObject(requireField(value, 'assets', errors), 'assets', errors)
  return errors
}

function validateGraphIntegrity(nodes: unknown[], edges: unknown[], errors: string[]): void {
  const nodeIndexes = new Map<string, number>()
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node) || typeof node.id !== 'string') continue
    const firstIndex = nodeIndexes.get(node.id)
    if (firstIndex !== undefined) {
      errors.push(`nodes[${index}].id duplicates nodes[${firstIndex}].id: ${node.id}`)
      continue
    }
    nodeIndexes.set(node.id, index)
  }

  for (const [index, edge] of edges.entries()) {
    if (!isRecord(edge)) continue
    for (const endpointName of ['source', 'target'] as const) {
      const endpoint = edge[endpointName]
      if (!isRecord(endpoint) || typeof endpoint.nodeId !== 'string') continue
      if (!nodeIndexes.has(endpoint.nodeId)) {
        errors.push(`edges[${index}].${endpointName}.nodeId references unknown node id: ${endpoint.nodeId}`)
      }
    }
  }
}

/** Validates untrusted JSON without throwing or coercing values. */
export function loadMboard(raw: unknown): LoadResult {
  const parsed = parseRaw(raw)
  if ('error' in parsed) return { ok: false, failure: { kind: 'invalid', errors: [parsed.error] } }
  if (!isRecord(parsed.value) || parsed.value.format !== 'mboard') {
    return { ok: false, failure: { kind: 'not-mboard' } }
  }

  if (!('schemaVersion' in parsed.value)) {
    return { ok: false, failure: { kind: 'invalid', errors: ['Missing required field: schemaVersion'] } }
  }
  const version = parsed.value.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, failure: { kind: 'invalid', errors: ['schemaVersion must be a positive integer'] } }
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return { ok: false, failure: { kind: 'too-new', found: version, supported: CURRENT_SCHEMA_VERSION } }
  }

  for (const field of ['nodes', 'edges'] as const) {
    if (!(field in parsed.value)) {
      return { ok: false, failure: { kind: 'invalid', errors: [`Missing required field: ${field}`] } }
    }
  }

  let migrated: Record<string, unknown>
  try {
    migrated = runMigrations(parsed.value, version)
  } catch (error) {
    return { ok: false, failure: { kind: 'invalid', errors: [error instanceof Error ? error.message : String(error)] } }
  }
  const errors = validateMboard(migrated)
  return errors.length === 0
    ? { ok: true, file: migrated as unknown as MboardFile, ...(version < CURRENT_SCHEMA_VERSION ? { migratedFrom: version } : {}) }
    : { ok: false, failure: { kind: 'invalid', errors } }
}
