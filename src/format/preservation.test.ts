import { describe, expect, it } from 'vitest'
import { deserialise, serialise } from './mboard'
import type { MboardFile } from './types'

const source = {
  format: 'mboard', schemaVersion: 1,
  meta: { id: 'd', title: 't', createdAt: 'a', updatedAt: 'b', createdWith: { version: 'v', commit: 'c' }, profiles: ['core'] },
  nodes: [{ id: 'n', kind: 'sticky', parentId: null, frame: { x: 1, y: 2, w: null, h: null, rotation: 0 }, z: 0, style: { color: 'x', fill: null, stroke: null }, content: { text: 'n' }, profileData: { bpmn: { nodeType: 'task', futureBpmn: { keep: true } }, mindmap: { layout: 'radial' } }, futureNode: { keep: 'node' } }],
  edges: [], profileConfig: {}, history: { yjsState: null, snapshots: [], retention: { keepAllNamed: true, keepLastAuto: 1, decayBucketsHours: [], maxSnapshots: 1, maxHistoryRatio: 3 } }, assets: {}, futureRoot: { keep: 'root' },
} as unknown as MboardFile & Record<string, unknown>

describe('unknown-data preservation', () => {
  it('preserves root, node, bpmn, and namespace extras through load/save', () => {
    const loaded = deserialise(source)
    const saved = serialise({ ...loaded, elements: loaded.elements })
    expect((saved as typeof source).futureRoot).toEqual(source.futureRoot)
    expect((saved.nodes[0] as unknown as { futureNode: unknown }).futureNode).toEqual((source.nodes[0] as typeof source.nodes[0] & { futureNode: unknown }).futureNode)
    expect(saved.nodes[0].profileData).toEqual(source.nodes[0].profileData)
  })
})
