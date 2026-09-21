import { describe, expect, it } from 'vitest'
import { canonicalElement, deserialise, fromDocEdge, fromDocNode, serialise, toDocElement, type BoardElement } from './mboard'

const node: BoardElement = {
  id: 'fractional-sticky',
  type: 'sticky',
  x: 132.4375,
  y: -54.875,
  w: 160.25,
  h: 120.5,
  rotation: -22.75,
  zIndex: 17,
  color: '#FF00AA',
  fill: 'rgb(255, 0, 170)',
  stroke: 2.5,
  text: 'Текст remains verbatim',
  createdBy: 'author-1',
  bpmnNodeType: 'task',
  bpmnDurationMs: 0,
  bpmnPriority: 0,
}

const edge: BoardElement = {
  id: 'routed-flow',
  type: 'arrow',
  x: 999,
  y: -999,
  color: '#00AAFF',
  stroke: 1.5,
  text: 'Approve',
  bpmnFlow: {
    sourceId: 'fractional-sticky',
    targetId: 'target',
    flowType: 'sequence',
    condition: 'amount > 100',
    probability: 0,
    isDefault: false,
  },
}

describe('canonicalElement', () => {
  it('round-trips every documented node field without coordinate or style drift', () => {
    const doc = toDocElement(node)
    if (!('node' in doc)) throw new Error('expected node')

    expect(canonicalElement(fromDocNode(doc.node))).toEqual(canonicalElement(node))
  })

  it('retains routed edge geometry and labels in a document conversion', () => {
    const doc = toDocElement(edge)
    if (!('edge' in doc)) throw new Error('expected edge')
    const routed = {
      ...doc.edge,
      waypoints: [{ x: 132.4375, y: -54.875 }, { x: 205.125, y: 89.5 }],
      content: { label: 'Approve', offset: { x: -12.25, y: 4.5 } },
    }

    const converted = toDocElement(fromDocEdge(routed))
    expect(converted).toEqual({ edge: routed })
  })

  it('documents every deliberate projection for graph edges', () => {
    const doc = toDocElement(edge)
    if (!('edge' in doc)) throw new Error('expected edge')

    expect(canonicalElement(fromDocEdge(doc.edge))).toEqual(canonicalElement(edge))
    expect(canonicalElement(edge)).toMatchObject({ x: 0, y: 0 })
  })

  it('normalises only documented defaults', () => {
    const defaults: BoardElement = {
      id: 'default-node',
      type: 'rect',
      x: 0,
      y: 0,
      color: '#ABCDEF',
      rotation: 0,
    }
    const doc = toDocElement(defaults)
    if (!('node' in doc)) throw new Error('expected node')

    expect(canonicalElement(fromDocNode(doc.node))).toEqual(canonicalElement(defaults))
    expect(canonicalElement(defaults)).toMatchObject({ zIndex: 0 })
    expect(canonicalElement(defaults)).not.toHaveProperty('rotation')
  })

  it('drops an unrecognised bpmnNodeType from an opened file', () => {
    // An .mboard file is untrusted input: it can be hand-edited, or written by
    // a newer version. The Rust engine deserialises this field into a strict
    // enum, so one unknown value stops the whole model from parsing.
    const doc = toDocElement({ ...node, bpmnNodeType: 'task' })
    if (!('node' in doc)) throw new Error('expected node')
    const tampered = {
      ...doc.node,
      profileData: { ...doc.node.profileData, bpmn: { ...doc.node.profileData.bpmn, nodeType: 'wishfulGateway' } },
    }

    expect(fromDocNode(tampered)).not.toHaveProperty('bpmnNodeType')
  })

  it('keeps an unrecognised bpmnNodeType in the file while refusing it in memory', () => {
    // Two obligations that pull in opposite directions. The Rust engine needs
    // a value it can deserialise, so the element must not carry an unknown
    // nodeType. FORMAT.md promises unknown data survives a load/save cycle, so
    // refusing the value must not delete it from the user's file — the first
    // attempt at this did exactly that, which is a worse bug than the one it
    // set out to fix.
    const doc = toDocElement({ id: 'a', type: 'rect', x: 0, y: 0, color: '#000', bpmnNodeType: 'task' })
    if (!('node' in doc)) throw new Error('expected node')
    const file = {
      format: 'miroboard', schemaVersion: 1,
      meta: { id: 'd', title: 't', createdAt: 'x', updatedAt: 'x', createdWith: { version: '1', commit: 'c' }, profiles: [] },
      nodes: [{ ...doc.node, order: 0, profileData: { bpmn: { nodeType: 'eventSubprocess' } } }],
      edges: [], profileConfig: {}, history: { yjsState: null, snapshots: [], retention: {} }, assets: {},
    }

    const loaded = deserialise(file as never)
    expect(loaded.elements[0]).not.toHaveProperty('bpmnNodeType')

    const saved = serialise({
      elements: loaded.elements, meta: loaded.meta,
      profileConfig: loaded.profileConfig, history: loaded.history,
    })
    expect(saved.nodes[0].profileData).toEqual({ bpmn: { nodeType: 'eventSubprocess' } })
  })
})
