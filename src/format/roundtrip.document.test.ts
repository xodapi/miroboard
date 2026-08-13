import { describe, expect, it } from 'vitest'
import { deserialise, normalise, serialise, type BoardElement } from './mboard'
import type { DocEdge, DocHistory, DocMeta, MboardFile } from './types'

const history: DocHistory = {
  yjsState: null,
  snapshots: [],
  retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [1, 6, 24, 168], maxSnapshots: 120, maxHistoryRatio: 3 },
}

const fixtureNames = ['basic-fixed', 'batch-workload', 'fifo-vs-priority', 'parallel-queue', 'priority-queue', 'sla-calendar'] as const

function fixture(name: string, index: number): MboardFile {
  const meta: DocMeta = {
    id: `doc_${name}`,
    title: name,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    createdWith: { version: '0.16.0', commit: 'test' },
    profiles: ['core', 'bpmn'],
  }
  const elements: BoardElement[] = [
    { id: `${name}-top`, type: 'sticky', x: 132.4375, y: -54.875, w: 160.25, h: 120.5, rotation: -22.75, zIndex: 9, color: '#FF00AA', fill: 'rgb(255, 0, 170)', stroke: 2.5, text: 'Top' },
    { id: `${name}-under`, type: 'rect', x: 132.4375, y: -54.875, w: 160.25, h: 120.5, rotation: 0, zIndex: 3, color: '#00AAFF', fill: '#00AAFF', stroke: 1, text: 'Under', bpmnNodeType: 'task', bpmnDurationMs: index },
    { id: `${name}-flow`, type: 'arrow', x: 0, y: 0, color: '#112233', stroke: 1.5, text: 'route label', bpmnFlow: { sourceId: `${name}-top`, targetId: `${name}-under`, flowType: 'sequence', probability: 0, isDefault: false } },
  ]
  const saved = serialise({
    elements,
    meta,
    profileConfig: {},
    history,
  })
  const edge = saved.edges[0] as DocEdge & { content: { label: string; offset: { x: number; y: number } } }
  edge.waypoints = [{ x: 132.4375, y: -54.875 }, { x: 210.625, y: 5.125 }]
  edge.content = { label: 'route label', offset: { x: -12.5, y: 4.25 } }
  return saved
}

describe('document round-trip fidelity', () => {
  it.each(fixtureNames)('%s loads, saves, and reloads without semantic drift', (name) => {
    const loaded = fixture(name, fixtureNames.indexOf(name))
    const savedAgain = serialise(deserialise(loaded))

    expect(normalise(savedAgain)).toEqual(normalise(loaded))
  })

  it('preserves source array order, z order, fractional geometry, and original colour notation', () => {
    const loaded = fixture('ordering', 1)
    const savedAgain = serialise(deserialise(loaded))

    expect(savedAgain.nodes.map(node => [node.id, node.z])).toEqual(loaded.nodes.map(node => [node.id, node.z]))
    expect(savedAgain.nodes[0].frame).toEqual(loaded.nodes[0].frame)
    expect(savedAgain.nodes[0].style).toEqual(loaded.nodes[0].style)
  })

  it('preserves manually routed edge waypoints, label text, and label offset', () => {
    const loaded = fixture('edge-geometry', 1)
    const savedAgain = serialise(deserialise(loaded))

    expect(savedAgain.edges[0]).toEqual(loaded.edges[0])
  })
})
