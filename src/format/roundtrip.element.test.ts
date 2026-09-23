import { describe, expect, it } from 'vitest'
import { canonicalElement, deserialise, fromDocEdge, fromDocNode, serialise, toDocElement, type BoardElement } from './mboard'
import type { DocHistory, DocMeta } from './types'

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

const meta: DocMeta = {
  id: 'doc_lock', title: 'Lock', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: '0.16.0', commit: 'test' }, profiles: ['core'],
}
const history: DocHistory = {
  yjsState: null, snapshots: [],
  retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [], maxSnapshots: 120, maxHistoryRatio: 3 },
}

describe('locked', () => {
  it('omits an unlocked node and never writes the field on a connector', () => {
    const open = toDocElement({ id: 'open', type: 'rect', x: 1, y: 2, color: '#000' })
    const explicitFalse = toDocElement({ id: 'open', type: 'rect', x: 1, y: 2, color: '#000', locked: false })
    if (!('node' in open) || !('node' in explicitFalse)) throw new Error('expected node')
    expect(open.node).not.toHaveProperty('locked')
    expect(explicitFalse.node).not.toHaveProperty('locked')

    const locked = toDocElement({ id: 'shut', type: 'rect', x: 1, y: 2, color: '#000', locked: true })
    if (!('node' in locked)) throw new Error('expected node')
    expect(locked.node.locked).toBe(true)
    expect(canonicalElement(fromDocNode(locked.node))).toEqual(
      canonicalElement({ id: 'shut', type: 'rect', x: 1, y: 2, color: '#000', locked: true }),
    )
    expect(fromDocNode({ ...open.node, locked: false })).not.toHaveProperty('locked')

    const flow = toDocElement({
      id: 'flow', type: 'arrow', x: 4, y: 5, color: '#000', locked: true,
      bpmnFlow: { sourceId: 'a', targetId: 'b' },
    })
    expect('node' in flow).toBe(false)
    expect(JSON.stringify(flow)).not.toContain('locked')

    const unlocked = serialise({
      elements: [{ id: 'n', type: 'rect', x: 0, y: 0, color: '#000' }],
      meta, profileConfig: {}, history,
    })
    const falseFlag = serialise({
      elements: [{ id: 'n', type: 'rect', x: 0, y: 0, color: '#000', locked: false }],
      meta, profileConfig: {}, history,
    })
    expect(unlocked).toEqual(falseFlag)
    expect(unlocked.schemaVersion).toBe(1)
    expect(unlocked.nodes[0]).not.toHaveProperty('locked')
    expect(unlocked.edges).toEqual([])
  })
})

describe('arrow style', () => {
  it('keeps a solid arrow identical to a file that never had a dash field', () => {
    const solid = toDocElement({ id: 'arrow', type: 'arrow', x: 1, y: 2, w: 40, h: 0, color: '#000', stroke: 2 })
    if (!('node' in solid)) throw new Error('expected node')
    expect(solid.node.style).toEqual({ color: '#000', fill: null, stroke: 2 })
    expect(solid.node.style).not.toHaveProperty('dash')
    expect(solid.node.kind).toBe('arrow')

    const file = serialise({
      elements: [{ id: 'arrow', type: 'arrow', x: 1, y: 2, color: '#000', stroke: 2 }],
      meta, profileConfig: {}, history,
    })
    expect(file.schemaVersion).toBe(1)
    expect(file.nodes[0].style).not.toHaveProperty('dash')
    expect(deserialise(file).elements[0]).not.toHaveProperty('dash')
  })

  it('round-trips a dashed freeform arrow and a headless dashed connector', () => {
    const dashed = { id: 'arrow', type: 'arrow' as const, x: 4, y: 5, w: 30, h: 10, color: '#111', stroke: 7, dash: 'dashed' as const }
    const asNode = toDocElement(dashed)
    if (!('node' in asNode)) throw new Error('expected node')
    expect(asNode.node.style.dash).toBe('dashed')
    expect(canonicalElement(fromDocNode(asNode.node))).toEqual(canonicalElement(dashed))

    const flow = {
      id: 'flow', type: 'line' as const, x: 9, y: 9, color: '#222', stroke: 4, dash: 'dashed' as const,
      bpmnFlow: { sourceId: 'a', targetId: 'b' },
    }
    const asEdge = toDocElement(flow)
    if (!('edge' in asEdge)) throw new Error('expected edge')
    expect(asEdge.edge.style).toEqual({ color: '#222', stroke: 4, arrowHead: 'none', dash: 'dashed' })
    expect(canonicalElement(fromDocEdge(asEdge.edge))).toEqual(canonicalElement(flow))

    const saved = serialise({ elements: [dashed, flow], meta, profileConfig: {}, history })
    expect(saved.schemaVersion).toBe(1)
    const restored = deserialise(saved).elements
    expect(restored.find(element => element.id === 'arrow')).toMatchObject({ type: 'arrow', dash: 'dashed', stroke: 7 })
    expect(restored.find(element => element.id === 'flow')).toMatchObject({
      type: 'line', dash: 'dashed', stroke: 4, bpmnFlow: { sourceId: 'a', targetId: 'b' },
    })
  })
})

describe('canonicalElement', () => {
  it('round-trips a group token as parentId', () => {
    const grouped = { ...node, groupId: 'grp_shared' }
    const doc = toDocElement(grouped)
    if (!('node' in doc)) throw new Error('expected node')
    expect(doc.node.parentId).toBe('grp_shared')
    expect(canonicalElement(fromDocNode(doc.node))).toEqual(canonicalElement(grouped))
  })

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
