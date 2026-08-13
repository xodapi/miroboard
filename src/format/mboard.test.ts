import { describe, expect, it } from 'vitest'
import { deserialise, detectProfiles, fromDocNode, normalise, serialise, toDocElement, type BoardElement } from './mboard'
import type { DocHistory, DocMeta, ProfileConfig } from './types'

const meta: DocMeta = {
  id: 'doc_test',
  title: 'Test',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: '0.16.0', commit: 'test' },
  profiles: ['core'],
}

const history: DocHistory = {
  yjsState: null,
  snapshots: [],
  retention: {
    keepAllNamed: true,
    keepLastAuto: 20,
    decayBucketsHours: [1, 6, 24, 168],
    maxSnapshots: 120,
    maxHistoryRatio: 3,
  },
}

const plain: BoardElement = {
  id: 'sticky',
  type: 'sticky',
  x: 10.25,
  y: -20.5,
  w: 160,
  h: 120,
  rotation: 0,
  zIndex: 4,
  color: '#FFD93D',
  fill: '#FFD93D',
  text: 'A note',
}

describe('mboard adapter', () => {
  it('maps plain elements to nodes with null parentId and no BPMN profile', () => {
    expect(toDocElement(plain)).toEqual({
      node: {
        id: 'sticky',
        order: 0,
        kind: 'sticky',
        parentId: null,
        frame: { x: 10.25, y: -20.5, w: 160, h: 120, rotation: 0 },
        z: 4,
        style: { color: '#FFD93D', fill: '#FFD93D', stroke: null },
        content: { text: 'A note' },
        profileData: {},
      },
    })
  })

  it('reconstructs a node while omitting undefined in-memory optional values', () => {
    const converted = toDocElement({ ...plain, w: undefined, h: undefined, rotation: undefined })
    if (!('node' in converted)) throw new Error('expected node')

    expect(fromDocNode(converted.node)).toEqual({
      id: 'sticky',
      type: 'sticky',
      x: 10.25,
      y: -20.5,
      color: '#FFD93D',
      fill: '#FFD93D',
      text: 'A note',
      zIndex: 4,
    })
  })

  it('serialises nodes, derives profiles, and always emits empty assets', () => {
    const file = serialise({ elements: [plain], meta, profileConfig: {}, history })

    expect(file.assets).toEqual({})
    expect(file.meta.profiles).toEqual(['core'])
    expect(file.nodes[0].parentId).toBeNull()
    expect(file.edges).toEqual([])
  })

  it('detects BPMN from either graph collection, independently of element order', () => {
    const bpmnNode = toDocElement({ ...plain, id: 'task', bpmnNodeType: 'task' })
    const bpmnEdge = toDocElement({
      ...plain, id: 'flow', type: 'arrow',
      bpmnFlow: { sourceId: 'sticky', targetId: 'task', flowType: 'sequence' },
    })
    if (!('node' in bpmnNode) || !('edge' in bpmnEdge)) throw new Error('expected graph elements')

    expect(detectProfiles([bpmnNode.node], [])).toEqual(['core', 'bpmn'])
    expect(detectProfiles([], [bpmnEdge.edge])).toEqual(['core', 'bpmn'])
    const plainNode = toDocElement(plain)
    if (!('node' in plainNode)) throw new Error('expected node')
    expect(detectProfiles([plainNode.node], [])).toEqual(['core'])
  })

  it('deserialises the document content and retains metadata configuration and history', () => {
    const profileConfig: ProfileConfig = { mindmap: { layout: 'radial' } }
    const file = serialise({ elements: [plain], meta, profileConfig, history })

    expect(deserialise(file)).toEqual({
      elements: [{ ...plain, rotation: undefined, stroke: undefined }],
      meta: { ...meta, profiles: ['core'] },
      profileConfig,
      history,
    })
  })

  it('normalises deterministically without mutating the input', () => {
    const serialised = serialise({
      elements: [{ ...plain, id: 'z', x: 1.123456 }, { ...plain, id: 'a', x: 1.987654 }],
      meta,
      profileConfig: {},
      history,
    })
    const input = { ...serialised, nodes: [...serialised.nodes].reverse() }
    const normalised = normalise(input)

    expect(normalised.nodes.map(node => node.id)).toEqual(['a', 'z'])
    expect(normalised.nodes.map(node => node.frame.x)).toEqual([1.9877, 1.1235])
    expect(input.nodes.map(node => node.id)).toEqual(['z', 'a'])
    expect(normalise(normalised)).toEqual(normalised)
  })

  it('sorts edges by id as well as nodes', () => {
    const file = serialise({ elements: [plain], meta, profileConfig: {}, history })
    const edge = {
      id: 'edge-a', order: 1, kind: 'connector',
      source: { nodeId: 'sticky', anchor: 'auto' as const },
      target: { nodeId: 'sticky', anchor: 'auto' as const },
      style: { color: '#000', stroke: null, arrowHead: 'none' as const },
      profileData: {},
    }
    const input = { ...file, edges: [{ ...edge, id: 'edge-z' }, edge] }

    expect(normalise(input).edges.map(item => item.id)).toEqual(['edge-a', 'edge-z'])
  })
})
