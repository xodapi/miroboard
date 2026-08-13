import { describe, expect, it } from 'vitest'
import { deserialise, serialise, type BoardElement } from './mboard'
import type { DocHistory, DocMeta } from './types'

const history: DocHistory = {
  yjsState: null,
  snapshots: [],
  retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [1, 6, 24, 168], maxSnapshots: 120, maxHistoryRatio: 3 },
}

const meta: DocMeta = {
  id: 'doc-ordering',
  title: 'Ordering',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: 'test', commit: 'ordering' },
  profiles: ['core', 'bpmn'],
}

const elements: BoardElement[] = [
  { id: 'start', type: 'circle', x: 0, y: 0, color: '#000', bpmnNodeType: 'startEvent' },
  { id: 'prepare', type: 'sticky', x: 100, y: 0, color: '#000', bpmnNodeType: 'task' },
  { id: 'review', type: 'sticky', x: 200, y: 0, color: '#000', bpmnNodeType: 'task' },
  { id: 'end', type: 'circle', x: 300, y: 0, color: '#000', bpmnNodeType: 'endEvent' },
]

describe('document element ordering', () => {
  it('survives save-load-save-load even though saved nodes are normalised by id', () => {
    const firstSave = serialise({ elements, meta, profileConfig: {}, history })
    expect(firstSave.nodes.map(node => node.id)).toEqual(['end', 'prepare', 'review', 'start'])
    expect(firstSave.nodes.map(node => node.order)).toEqual([3, 1, 2, 0])

    const firstLoad = deserialise(firstSave)
    const secondSave = serialise(firstLoad)
    const secondLoad = deserialise(secondSave)

    expect(firstLoad.elements.map(element => element.id)).toEqual(['start', 'prepare', 'review', 'end'])
    expect(secondLoad.elements.map(element => element.id)).toEqual(['start', 'prepare', 'review', 'end'])
  })
})
