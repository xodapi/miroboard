import { describe, expect, it } from 'vitest'
import { fromDocEdge, serialise, toDocElement, type BoardElement } from './mboard'
import type { DocHistory, DocMeta } from './types'

const meta: DocMeta = {
  id: 'doc_test', title: 'Test', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: '0.16.0', commit: 'test' }, profiles: ['core'],
}
const history: DocHistory = { yjsState: null, snapshots: [], retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [], maxSnapshots: 120, maxHistoryRatio: 3 } }

describe('BPMN flow edge mapping', () => {
  it('turns bpmnFlow into a structural edge and maps its four semantic values', () => {
    const flow: BoardElement = {
      id: 'flow-1', type: 'arrow', x: 20, y: 30, color: '#000000', stroke: 2, text: 'approve',
      bpmnFlow: { sourceId: 'task-a', targetId: 'task-b', flowType: 'sequence', condition: 'ok', probability: 0, isDefault: false },
    }
    const converted = toDocElement(flow)

    expect(converted).toEqual({
      edge: {
        id: 'flow-1', order: 0, kind: 'connector',
        source: { nodeId: 'task-a', anchor: 'auto' }, target: { nodeId: 'task-b', anchor: 'auto' },
        style: { color: '#000000', stroke: 2, arrowHead: 'triangle' },
        content: { label: 'approve' },
        profileData: { bpmn: { flowType: 'sequence', condition: 'ok', probability: 0, isDefault: false } },
      },
    })
  })

  it('reconstructs BPMN flow semantics and uses a canonical edge position', () => {
    const converted = toDocElement({
      id: 'flow-1', type: 'line', x: 20, y: 30, color: '#000000',
      bpmnFlow: { sourceId: 'task-a', targetId: 'task-b', flowType: 'message', isDefault: false },
    })
    if (!('edge' in converted)) throw new Error('expected edge')

    expect(fromDocEdge(converted.edge)).toEqual({
      id: 'flow-1', type: 'line', x: 0, y: 0, color: '#000000',
      bpmnFlow: { sourceId: 'task-a', targetId: 'task-b', flowType: 'message', isDefault: false },
    })
  })

  it('keeps arrows and lines without bpmnFlow as document nodes', () => {
    const arrow: BoardElement = { id: 'arrow', type: 'arrow', x: 1, y: 2, color: '#000' }
    const line: BoardElement = { id: 'line', type: 'line', x: 3, y: 4, color: '#111' }
    const file = serialise({ elements: [arrow, line], meta, profileConfig: {}, history })

    expect(file.nodes.map(node => node.kind)).toEqual(['arrow', 'line'])
    expect(file.edges).toEqual([])
  })

  it('serialises BPMN flows into the document edges collection', () => {
    const flow: BoardElement = {
      id: 'flow-1', type: 'arrow', x: 0, y: 0, color: '#000',
      bpmnFlow: { sourceId: 'a', targetId: 'b', flowType: 'sequence' },
    }
    const file = serialise({ elements: [flow], meta, profileConfig: {}, history })

    expect(file.nodes).toEqual([])
    expect(file.edges).toHaveLength(1)
  })
})
