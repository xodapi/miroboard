import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { loadMboard } from './schema'
import { deserialise, serialise, type BoardElement, type SerialiseInput } from './mboard'
import type { DocHistory, DocMeta } from './types'

/**
 * The regression floor is deliberately explicit: changing this list must be a
 * conscious decision because it is the inventory of documents the app writes.
 */
export const SELF_CONSISTENCY_DOCUMENTS = [
  'examples/basic-fixed.json',
  'examples/batch-workload.json',
  'examples/fifo-vs-priority.json',
  'examples/parallel-queue.json',
  'examples/priority-queue.json',
  'examples/sla-calendar.json',
  'all-element-types-board',
  'examples/legacy/v0-synthetic.mboard',
] as const

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

const meta = (id: string): DocMeta => ({
  id,
  title: id,
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: 'test', commit: 'self-consistency' },
  profiles: ['core'],
})

function input(elements: BoardElement[], id: string): SerialiseInput {
  return { elements, meta: meta(id), profileConfig: {}, history }
}

function fixtureElements(path: string): BoardElement[] {
  const source = JSON.parse(readFileSync(path, 'utf8')) as {
    model?: {
      nodes?: Array<Record<string, unknown>>
      flows?: Array<Record<string, unknown>>
    }
  }
  const nodes = (source.model?.nodes ?? []).map((node, index): BoardElement => ({
    id: String(node.id ?? `fixture-node-${index}`),
    type: node.type === 'startEvent' || node.type === 'endEvent' ? 'circle' : 'rect',
    x: typeof node.x === 'number' ? node.x : 0,
    y: typeof node.y === 'number' ? node.y : 0,
    w: 160,
    h: 100,
    color: '#ffffff',
    text: typeof node.name === 'string' ? node.name : undefined,
    bpmnNodeType: node.type as BoardElement['bpmnNodeType'],
    bpmnDurationMs: typeof node.durationMs === 'number' ? node.durationMs : undefined,
    bpmnResourceRole: typeof node.resourceRole === 'string' ? node.resourceRole : undefined,
    bpmnCostPerHour: typeof node.costPerHour === 'number' ? node.costPerHour : undefined,
    bpmnResourceCapacity: typeof node.resourceCapacity === 'number' ? node.resourceCapacity : undefined,
    zIndex: index,
  }))
  const edges = (source.model?.flows ?? []).map((flow, index): BoardElement => ({
    id: String(flow.id ?? `fixture-flow-${index}`),
    type: 'arrow',
    x: 0,
    y: 0,
    color: '#000000',
    bpmnFlow: {
      sourceId: String(flow.sourceId),
      targetId: String(flow.targetId),
      flowType: 'sequence',
      condition: typeof flow.condition === 'string' ? flow.condition : undefined,
      probability: typeof flow.probability === 'number' ? flow.probability : undefined,
      isDefault: typeof flow.isDefault === 'boolean' ? flow.isDefault : undefined,
    },
  }))
  return [...nodes, ...edges]
}

function allElementTypes(): BoardElement[] {
  const types: BoardElement['type'][] = ['path', 'sticky', 'rect', 'circle', 'arrow', 'line', 'text', 'emoji']
  const nodes = types.map((type, index): BoardElement => ({
    id: `element-${type}`,
    type,
    x: index * 40,
    y: index * 30,
    w: 80,
    h: 50,
    color: '#123456',
    fill: '#abcdef',
    stroke: 2,
    text: type,
    emoji: type === 'emoji' ? '😀' : undefined,
    points: type === 'path' ? [{ x: 0, y: 0 }, { x: 10, y: 10 }] : undefined,
    zIndex: index,
  }))
  return [
    ...nodes,
    {
      id: 'element-bpmn-task',
      type: 'rect',
      x: 400,
      y: 200,
      w: 120,
      h: 80,
      color: '#00aa00',
      bpmnNodeType: 'task',
      bpmnDurationMs: 0,
      bpmnPriority: 0,
    },
    {
      id: 'element-bpmn-flow',
      type: 'arrow',
      x: 0,
      y: 0,
      color: '#000000',
      bpmnFlow: { sourceId: 'element-sticky', targetId: 'element-bpmn-task', flowType: 'sequence' },
    },
  ]
}

function writeAndReload(document: SerialiseInput) {
  const written = serialise(document)
  const parsed = loadMboard(JSON.stringify(written))
  expect(parsed).toEqual({ ok: true, file: written })
  if (!parsed.ok) throw new Error('self-consistency document unexpectedly rejected')
  const rewritten = serialise(deserialise(parsed.file))
  expect(loadMboard(JSON.stringify(rewritten))).toEqual({ ok: true, file: rewritten })
  return written
}

describe('VAL-FORMAT-028 save/load self-consistency gate', () => {
  it('records and validates all six shipped fixture documents', () => {
    const fixturePaths = SELF_CONSISTENCY_DOCUMENTS.slice(0, 6)
    expect(fixturePaths).toHaveLength(6)
    for (const path of fixturePaths) {
      const written = writeAndReload(input(fixtureElements(path), path))
      expect(written.nodes.length + written.edges.length).toBeGreaterThan(0)
    }
  })

  it('validates a hand-built board containing every element type', () => {
    const written = writeAndReload(input(allElementTypes(), SELF_CONSISTENCY_DOCUMENTS[6]))
    expect(written.nodes.map(node => node.kind)).toEqual(
      expect.arrayContaining(['path', 'sticky', 'rect', 'circle', 'line', 'text', 'emoji']),
    )
    expect(written.edges).toHaveLength(1)
  })

  it('loads the permanent legacy fixture through the migration chain on every run', () => {
    const source = JSON.parse(readFileSync('examples/legacy/v0-synthetic.mboard', 'utf8')) as Record<string, unknown>
    const result = loadMboard(source)
    expect(result).toMatchObject({ ok: true, migratedFrom: 0 })
    if (!result.ok) return
    expect(result.file.schemaVersion).toBe(1)
    expect(result.file.nodes.every(node => node.parentId === null)).toBe(true)
    expect(result.file.profileConfig).toEqual({})
    expect(result.file.assets).toEqual({})
  })

  it('does not emit console errors while validating app-written documents', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      writeAndReload(input(allElementTypes(), 'console-clean'))
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})
