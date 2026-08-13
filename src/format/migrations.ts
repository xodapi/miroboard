import { CURRENT_SCHEMA_VERSION } from './types'

export type Migration = {
  from: number
  to: number
  apply: (doc: Record<string, unknown>) => Record<string, unknown>
}

const v0ToV1: Migration = {
  from: 0,
  to: 1,
  apply: doc => ({
    ...doc,
    schemaVersion: 1,
    profileConfig: doc.profileConfig ?? {},
    assets: doc.assets ?? {},
    nodes: Array.isArray(doc.nodes)
      ? doc.nodes.map((node, index) => addV1NodeFields(node, index))
      : doc.nodes,
    edges: Array.isArray(doc.edges)
      ? doc.edges.map((edge, index) => addOrder(edge, index))
      : doc.edges,
  }),
}

function addV1NodeFields(node: unknown, index: number): unknown {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node
  const migrated = node as Record<string, unknown>
  return {
    ...migrated,
    ...('parentId' in migrated ? {} : { parentId: null }),
    ...('order' in migrated ? {} : { order: index }),
  }
}

function addOrder(element: unknown, index: number): unknown {
  if (!element || typeof element !== 'object' || Array.isArray(element) || 'order' in element) return element
  return { ...(element as Record<string, unknown>), order: index }
}

/** Migrations are deliberately ordered and always move toward the current version. */
export const MIGRATIONS: readonly Migration[] = [v0ToV1].sort((left, right) => left.from - right.from)

export function runMigrations(doc: Record<string, unknown>, from: number): Record<string, unknown> {
  let current = doc
  let version = from
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find(migration => migration.from === version)
    if (!step) throw new Error(`No migration path from schemaVersion ${version}`)
    if (step.to <= step.from) throw new Error(`Migration from schemaVersion ${step.from} does not advance`)
    current = step.apply(current)
    version = step.to
  }
  return current
}
