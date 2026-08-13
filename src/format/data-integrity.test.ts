import { describe, expect, it } from 'vitest'
import { deserialise, normalise, serialise } from './mboard'
import type { BoardElement, SerialiseInput } from './mboard'
import type { MboardFile } from './types'

const history = {
  yjsState: null,
  snapshots: [],
  retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [], maxSnapshots: 120, maxHistoryRatio: 3 },
} as const

const meta = {
  id: 'doc.integrity',
  title: '😀 Семантика / 中文 العربية é',
  description: 'meta '.repeat(2_000),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdWith: { version: 'test', commit: 'test' },
  profiles: ['core', 'bpmn'],
}

const node = (id: string, text = ''): BoardElement => ({
  id, type: 'sticky', x: -1.25, y: 2.5, color: '#fff', text,
  bpmnDurationMs: 0, bpmnCostPerHour: -12.5, bpmnPriority: 9007199254740991,
})

const edge = (id: string, sourceId: string, targetId: string): BoardElement => ({
  id, type: 'arrow', x: 0, y: 0, color: '#000', stroke: 0, text: '',
  bpmnFlow: { sourceId, targetId, probability: 0, isDefault: false },
})

const input = (elements: BoardElement[], overrides: Partial<SerialiseInput> = {}): SerialiseInput => ({
  elements, meta, profileConfig: {
    bpmn: { simulation: {
      seed: '00042', runs: '0', slaTargetSec: '-1', instances: '1',
      arrivalIntervalSec: '0.000001', calendarStartHour: '0', calendarEndHour: '24',
      arrivalClasses: [], rolePolicies: { empty: { capacity: '0', queuePolicy: 'fifo' } },
    } },
  }, history, ...overrides,
})

describe('data integrity hardening', () => {
  it('round-trips large boards without dropping the tail', () => {
    const nodes = Array.from({ length: 100 }, (_, index) => node(`node-${index}`))
    const edges = Array.from({ length: 100 }, (_, index) => edge(`edge-${index}`, `node-${index % 100}`, `node-${(index + 1) % 100}`))
    const file = serialise(input([...nodes, ...edges]))
    const result = deserialise(file)
    expect(file.nodes).toHaveLength(100)
    expect(file.edges).toHaveLength(100)
    expect(result.elements.some(element => element.id === 'node-99')).toBe(true)
    expect(result.elements.some(element => element.id === 'edge-99')).toBe(true)
  })

  it('preserves unicode, special ids, empty values, falsy values, and long strings', () => {
    const special = 'id. / : - # with spaces'
    const text = '👩‍👩‍👧‍👦 🇺🇳 Привет 中文 العربية e\u0301 " \\ < > &\n' + 'x'.repeat(10_000)
    const file = serialise(input([node(special, text), edge('edge special', special, special)], {
      meta: { ...meta, title: '" \\ < > &\n😀', description: 'd'.repeat(10_000) },
    }))
    const roundTripped = deserialise(file)
    expect(roundTripped.meta.title).toBe('" \\ < > &\n😀')
    expect(roundTripped.meta.description).toHaveLength(10_000)
    expect(roundTripped.elements[0].text).toBe(text)
    expect(file.edges[0].source.nodeId).toBe(special)
    expect(file.edges[0].target.nodeId).toBe(special)
    expect(file.nodes[0].profileData.bpmn).toEqual({
      durationMs: 0,
      costPerHour: -12.5,
      priority: 9007199254740991,
    })
    expect(file.edges[0].content?.label).toBe('')
    expect(file.edges[0].profileData.bpmn).toEqual({ probability: 0, isDefault: false })
    expect(file.profileConfig.bpmn?.simulation.arrivalClasses).toEqual([])
  })

  it('retains explicit nulls and omits undefined values consistently', () => {
    const source = {
      format: 'mboard', schemaVersion: 1, meta: { ...meta, description: null },
      nodes: [], edges: [], profileConfig: { empty: '', zero: 0, no: false },
      history, assets: {}, nullable: null, omitted: undefined,
    } as unknown as MboardFile & Record<string, unknown>
    const result = normalise(source)
    expect(result).toMatchObject({ nullable: null, profileConfig: { empty: '', zero: 0, no: false } })
    expect(result).not.toHaveProperty('omitted')
    expect((result.meta as unknown as Record<string, unknown>).description).toBeNull()
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it('preserves deeply nested profile data and rejects cyclic structures clearly', () => {
    const nested = { level: { level: { level: { value: false } } } }
    const source = {
      ...serialise(input([node('nested')])),
      nodes: [{ ...serialise(input([node('nested')])).nodes[0], profileData: { bpmn: nested } }],
    } as MboardFile
    const roundTripped = deserialise(normalise(source))
    expect(roundTripped.elements[0]).toBeDefined()
    expect(source.nodes[0].profileData.bpmn).toEqual(nested)

    const cyclic: Record<string, unknown> = { value: 1 }
    cyclic.self = cyclic
    expect(() => normalise({ ...source, future: cyclic } as MboardFile)).toThrow(/cyclic/i)
  })
})
