import { describe, expect, it } from 'vitest'
import { deserialise, serialise } from '../format/mboard'
import { loadMboard } from '../format/schema'
import type { DocHistory, DocMeta } from '../format/types'
import { classifyNotationSource, notationElement, notationJoin, projectGraph, validateGraph } from './graph'
import type { BoardElement } from './types'

const meta: DocMeta = {
  id: 'graph-core',
  title: 'Graph core',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  createdWith: { version: 'test', commit: 'test' },
  profiles: ['core'],
}
const history: DocHistory = {
  yjsState: null,
  snapshots: [],
  retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [1, 6, 24, 168], maxSnapshots: 120, maxHistoryRatio: 3 },
}

function mark(id: string, over: Partial<BoardElement> = {}): BoardElement {
  return { id, type: 'rect', x: 10, y: 20, w: 80, h: 40, color: '#000', ...over }
}

describe('projectGraph', () => {
  it('puts eEPC, VACD, a mind-map and BPMN on one graph and keeps coordinates off it', () => {
    const graph = projectGraph([
      mark('sticky', { type: 'sticky', text: 'не нотация' }),
      mark('event', { type: 'circle', text: 'Заказ', notation: { id: 'eepc', symbol: 'event' } }),
      mark('fn', { text: 'Проверить', notation: { id: 'eepc', symbol: 'function', role: 'продажи' } }),
      mark('flow', {
        type: 'arrow', x: 0, y: 0, w: 0, h: 0,
        link: { sourceId: 'event', targetId: 'fn' },
        notation: { id: 'eepc', symbol: 'control', relation: 'controlFlow' },
      }),
      mark('step', { text: 'Продажа', notation: { id: 'vacd', symbol: 'step', refines: 'fn' } }),
      mark('root', { type: 'text', text: 'Тема', notation: { id: 'mindmap', symbol: 'topic' } }),
      mark('branch', { type: 'text', text: 'Ветка', notation: { id: 'mindmap', symbol: 'topic', parentId: 'root' } }),
      mark('task', { type: 'sticky', text: 'Задача', bpmnNodeType: 'task' }),
      mark('seq', {
        type: 'arrow', x: 0, y: 0,
        bpmnFlow: { sourceId: 'task', targetId: 'task' },
      }),
    ])

    expect(graph.nodes.map(node => [node.id, node.notation, node.symbol])).toEqual([
      ['event', 'eepc', 'event'],
      ['fn', 'eepc', 'function'],
      ['step', 'vacd', 'step'],
      ['root', 'mindmap', 'topic'],
      ['branch', 'mindmap', 'topic'],
      ['task', 'bpmn', 'task'],
    ])
    expect(graph.edges).toEqual([
      { id: 'flow', notation: 'eepc', sourceId: 'event', targetId: 'fn', relation: 'controlFlow' },
      { id: 'branch→root', notation: 'mindmap', sourceId: 'root', targetId: 'branch', relation: 'branch' },
      { id: 'seq', notation: 'bpmn', sourceId: 'task', targetId: 'task', relation: 'sequence' },
    ])
    expect(JSON.stringify(graph)).not.toMatch(/"x"|"y"/)
    expect(graph.nodes.find(node => node.id === 'fn')).toMatchObject({ text: 'Проверить', role: 'продажи' })
    expect(graph.nodes.find(node => node.id === 'step')).toMatchObject({ refines: 'fn' })
  })
})

describe('validateGraph', () => {
  it('accepts an alternating eEPC and rejects a function that follows a function', () => {
    const ok = [
      mark('e', { notation: { id: 'eepc', symbol: 'event' } }),
      mark('x', { notation: { id: 'eepc', symbol: 'xor' } }),
      mark('f', { notation: { id: 'eepc', symbol: 'function' } }),
      mark('a', { type: 'arrow', link: { sourceId: 'e', targetId: 'x' }, notation: { id: 'eepc', symbol: 'control', relation: 'controlFlow' } }),
      mark('b', { type: 'arrow', link: { sourceId: 'x', targetId: 'f' }, notation: { id: 'eepc', symbol: 'control', relation: 'controlFlow' } }),
    ]
    expect(validateGraph(ok)).toEqual([])

    const broken = [
      mark('f1', { notation: { id: 'eepc', symbol: 'function' } }),
      mark('f2', { notation: { id: 'eepc', symbol: 'function' } }),
      mark('bad', { type: 'arrow', link: { sourceId: 'f1', targetId: 'f2' }, notation: { id: 'eepc', symbol: 'control', relation: 'controlFlow' } }),
    ]
    expect(validateGraph(broken).map(issue => issue.code)).toEqual(['eepc-alternation'])
  })

  it('does not let a control flow land on an organisational unit', () => {
    const elements = [
      mark('f', { notation: { id: 'eepc', symbol: 'function' } }),
      mark('org', { notation: { id: 'eepc', symbol: 'org', role: 'продажи' } }),
      mark('bad', { type: 'arrow', link: { sourceId: 'f', targetId: 'org' }, notation: { id: 'eepc', symbol: 'control', relation: 'controlFlow' } }),
    ]
    expect(validateGraph(elements).map(issue => issue.code)).toContain('eepc-annotation')
  })

  it('requires a mind-map to be one tree', () => {
    expect(validateGraph([
      mark('root', { notation: { id: 'mindmap', symbol: 'topic' } }),
      mark('child', { notation: { id: 'mindmap', symbol: 'topic', parentId: 'root', collapsed: true } }),
    ])).toEqual([])

    const cycle = [
      mark('a', { notation: { id: 'mindmap', symbol: 'topic', parentId: 'b' } }),
      mark('b', { notation: { id: 'mindmap', symbol: 'topic', parentId: 'a' } }),
    ]
    expect(validateGraph(cycle).map(issue => issue.code).sort()).toEqual(['mindmap-cycle', 'mindmap-roots'])
    expect(validateGraph([
      mark('orphan', { notation: { id: 'mindmap', symbol: 'topic', parentId: 'missing' } }),
    ]).map(issue => issue.code)).toContain('mindmap-parent')
  })

  it('keeps a value chain a single sequence and a refinement on the same board', () => {
    const chain = [
      mark('a', { notation: { id: 'vacd', symbol: 'step' } }),
      mark('b', { notation: { id: 'vacd', symbol: 'step', refines: 'fn' } }),
      mark('fn', { notation: { id: 'eepc', symbol: 'function' } }),
      mark('link', { type: 'arrow', link: { sourceId: 'a', targetId: 'b' }, notation: { id: 'vacd', symbol: 'sequence', relation: 'sequence' } }),
    ]
    expect(validateGraph(chain)).toEqual([])

    const branch = [
      ...chain,
      mark('c', { notation: { id: 'vacd', symbol: 'step' } }),
      mark('fork', { type: 'arrow', link: { sourceId: 'a', targetId: 'c' }, notation: { id: 'vacd', symbol: 'sequence', relation: 'sequence' } }),
    ]
    expect(validateGraph(branch).map(issue => issue.code)).toContain('vacd-branch')
    expect(validateGraph([
      mark('loop', { notation: { id: 'vacd', symbol: 'step' } }),
      mark('back', { type: 'arrow', link: { sourceId: 'loop', targetId: 'loop' }, notation: { id: 'vacd', symbol: 'sequence', relation: 'sequence' } }),
    ]).map(issue => issue.code)).toContain('vacd-cycle')
    expect(validateGraph([
      mark('step', { notation: { id: 'vacd', symbol: 'step', refines: 'gone' } }),
    ]).map(issue => issue.code)).toContain('vacd-refinement')
  })

  it('refuses a mark that is both BPMN and another notation', () => {
    expect(validateGraph([
      mark('both', { bpmnNodeType: 'task', notation: { id: 'eepc', symbol: 'function' } }),
    ]).map(issue => issue.code)).toEqual(['notation-mixed'])
    expect(projectGraph([
      mark('both', { bpmnNodeType: 'task', notation: { id: 'eepc', symbol: 'function' } }),
    ])).toEqual({ nodes: [], edges: [] })
  })
})

describe('notationElement', () => {
  it('places a mark on the shared frame and joins two of the same notation', () => {
    const event = notationElement('event', { x: 40, y: 50 }, 'e1')
    expect(event).toMatchObject({
      id: 'e1', type: 'circle', x: 1, y: 11,
      notation: { id: 'eepc', symbol: 'event' },
    })
    const fn = notationElement('function', { x: 200, y: 50 }, 'f1')
    const joined = notationJoin(event, fn, 'edge')
    expect(joined).toMatchObject({
      kind: 'edge',
      element: { notation: { id: 'eepc', relation: 'controlFlow' }, link: { sourceId: 'e1', targetId: 'f1' } },
    })
    const topic = notationElement('topic', { x: 10, y: 10 }, 'root')
    const branch = notationElement('topic', { x: 80, y: 40 }, 'child')
    expect(notationJoin(topic, branch, 'unused')).toEqual({ kind: 'parent', id: 'child', parentId: 'root' })
    expect(notationJoin(event, topic, 'nope')).toBeNull()
  })
})

describe('notation file', () => {
  it('round-trips eEPC, VACD and a mind-map through schema 1 and omits an empty mark', () => {
    const event = mark('event', { type: 'circle', text: 'Заказ', notation: { id: 'eepc', symbol: 'event' } })
    const file = serialise({ elements: [event], meta, profileConfig: {}, history })
    expect(file.schemaVersion).toBe(1)
    expect(file.nodes[0].profileData.eepc).toEqual({ symbol: 'event' })
    expect(file.nodes[0].profileData).not.toHaveProperty('bpmn')
    const loaded = loadMboard(JSON.stringify(file))
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(deserialise(loaded.file).elements[0].notation).toEqual({ id: 'eepc', symbol: 'event' })

    const plain = serialise({ elements: [mark('box')], meta, profileConfig: {}, history })
    expect(plain.nodes[0].profileData).toEqual({})
  })

  it('refuses an ARIS AML export instead of parsing it into the graph', () => {
    const aml = '<?xml version="1.0"?><AML><Group Name="ARIS export"></Group></AML>'
    expect(classifyNotationSource(aml)).toBe('aris-aml')
    expect(classifyNotationSource(JSON.stringify({ format: 'mboard', schemaVersion: 1 }))).toBe('mboard')
  })
})
