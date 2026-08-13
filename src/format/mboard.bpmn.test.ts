import { describe, expect, it } from 'vitest'
import { fromDocNode, serialise, toDocElement, type BoardElement } from './mboard'
import type { DocHistory, DocMeta } from './types'

const allBpmnFields: BoardElement = {
  id: 'task-1',
  type: 'sticky',
  x: 1,
  y: 2,
  color: '#4D96FF',
  bpmnNodeType: 'task',
  bpmnDurationMs: 1.5,
  bpmnDurationDistribution: 'triangular',
  bpmnDurationMinMs: 0,
  bpmnDurationModeMs: 2,
  bpmnDurationMaxMs: 3,
  bpmnResourceRole: 'операторы',
  bpmnCostPerHour: 0,
  bpmnResourceCapacity: 4,
  bpmnPriority: 0,
}

const meta: DocMeta = {
  id: 'doc_test', title: 'Test', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: '0.16.0', commit: 'test' }, profiles: ['core'],
}
const history: DocHistory = { yjsState: null, snapshots: [], retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [], maxSnapshots: 120, maxHistoryRatio: 3 } }

describe('BPMN node field mapping', () => {
  it('writes all ten BPMN node fields under case-sensitive profileData.bpmn keys', () => {
    const converted = toDocElement(allBpmnFields)
    if (!('node' in converted)) throw new Error('expected node')

    expect(converted.node.profileData).toEqual({
      bpmn: {
        nodeType: 'task',
        durationMs: 1.5,
        durationDistribution: 'triangular',
        durationMinMs: 0,
        durationModeMs: 2,
        durationMaxMs: 3,
        resourceRole: 'операторы',
        costPerHour: 0,
        resourceCapacity: 4,
        priority: 0,
      },
    })
    expect(converted.node).not.toHaveProperty('bpmnNodeType')
  })

  it('round-trips every BPMN node field with numbers and falsey numeric values intact', () => {
    const converted = toDocElement(allBpmnFields)
    if (!('node' in converted)) throw new Error('expected node')
    const restored = fromDocNode(converted.node)

    for (const key of [
      'bpmnNodeType', 'bpmnDurationMs', 'bpmnDurationDistribution', 'bpmnDurationMinMs',
      'bpmnDurationModeMs', 'bpmnDurationMaxMs', 'bpmnResourceRole', 'bpmnCostPerHour',
      'bpmnResourceCapacity', 'bpmnPriority',
    ] as const) {
      expect(restored[key]).toStrictEqual(allBpmnFields[key])
    }
    expect(typeof restored.bpmnDurationMs).toBe('number')
  })

  it('keeps unspecified optional BPMN fields absent and produces stable consecutive saves', () => {
    const partial = { ...allBpmnFields, bpmnDurationMs: undefined, bpmnDurationDistribution: undefined, bpmnDurationMinMs: undefined, bpmnDurationModeMs: undefined, bpmnDurationMaxMs: undefined, bpmnResourceRole: undefined, bpmnCostPerHour: undefined, bpmnResourceCapacity: undefined, bpmnPriority: undefined }
    const first = serialise({ elements: [partial], meta, profileConfig: {}, history })
    const second = serialise({ elements: [{ ...fromDocNode(first.nodes[0]) }], meta, profileConfig: {}, history })

    expect(first.nodes[0].profileData).toEqual({ bpmn: { nodeType: 'task' } })
    expect(second).toEqual(first)
  })
})
