import { describe, expect, it } from 'vitest'
import { normalise } from './mboard'
import type { MboardFile } from './types'

const file = (overrides: Partial<MboardFile> = {}): MboardFile => ({
  format: 'mboard',
  schemaVersion: 1,
  meta: { id: 'd', title: 't', createdAt: 'a', updatedAt: 'b', createdWith: { version: 'v', commit: 'c' }, profiles: ['core'] },
  nodes: [
    { id: 'z', order: 0, kind: 'sticky', parentId: null, frame: { x: 1.123456, y: 2.987654, w: null, h: null, rotation: 0 }, z: 0, style: { color: 'x', fill: null, stroke: null }, content: {}, profileData: {} },
    { id: 'a', order: 1, kind: 'sticky', parentId: null, frame: { x: -1.55555, y: 0, w: null, h: null, rotation: 0 }, z: 0, style: { color: 'x', fill: null, stroke: null }, content: {}, profileData: {} },
  ],
  edges: [],
  profileConfig: {},
  history: { yjsState: null, snapshots: [], retention: { keepAllNamed: true, keepLastAuto: 1, decayBucketsHours: [], maxSnapshots: 1, maxHistoryRatio: 3 } },
  assets: {},
  ...overrides,
})

describe('normalise', () => {
  it('is idempotent and canonically orders keys and graph collections', () => {
    const result = normalise(file({ nodes: [...file().nodes].reverse(), extra: { z: 1, a: undefined } } as MboardFile & { extra: unknown }))
    expect(result.nodes.map(node => node.id)).toEqual(['a', 'z'])
    expect(result.nodes[0].frame).toMatchObject({ x: -1.5555 })
    expect(result).toEqual(normalise(result))
    expect(Object.keys(result.meta)).toEqual(['createdAt', 'createdWith', 'id', 'profiles', 'title', 'updatedAt'])
    expect((result as MboardFile & { extra?: unknown }).extra).toEqual({ z: 1 })
  })

  it('rounds coordinates but leaves other numbers exact', () => {
    const input = file({ nodes: [{ ...file().nodes[0], frame: { ...file().nodes[0].frame, x: 1.23456 }, content: { points: [{ x: 2.34567, y: 3.45678 }] }, profileData: { bpmn: { durationMs: 1.23456 } } }] })
    const result = normalise(input)
    expect(result.nodes[0].frame.x).toBe(1.2346)
    expect(result.nodes[0].content.points?.[0]).toEqual({ x: 2.3457, y: 3.4568 })
    expect(result.nodes[0].profileData.bpmn.durationMs).toBe(1.23456)
  })
})
