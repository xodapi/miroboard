import { describe, expect, it } from 'vitest'
import { loadMboard } from './schema'

const validDocument = () => ({
  format: 'mboard',
  schemaVersion: 1,
  meta: {
    id: 'doc_123',
    title: 'Test board',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    createdWith: { version: '0.16.0', commit: 'abc1234' },
    profiles: ['core'],
  },
  nodes: [{
    id: 'node-1',
    kind: 'sticky',
    parentId: null,
    frame: { x: 10, y: 20, w: 160, h: 120, rotation: 0 },
    z: 0,
    style: { color: '#FFD93D', fill: '#FFD93D', stroke: null },
    content: { text: 'Note' },
    profileData: {},
  }],
  edges: [{
    id: 'edge-1',
    kind: 'connector',
    source: { nodeId: 'node-1', anchor: 'auto' },
    target: { nodeId: 'node-1', anchor: 'auto' },
    style: { color: '#000000', stroke: 2, arrowHead: 'triangle' },
    profileData: {},
  }],
  profileConfig: {},
  history: {
    yjsState: null,
    snapshots: [],
    retention: {
      keepAllNamed: true,
      keepLastAuto: 20,
      decayBucketsHours: [1, 6, 24, 168],
      maxSnapshots: 120,
      maxHistoryRatio: 3,
    },
  },
  assets: {},
})

describe('loadMboard', () => {
  it('loads a well-formed v1 document without dropping nodes or edges', () => {
    const source = validDocument()
    const result = loadMboard(JSON.stringify(source))

    expect(result).toEqual({ ok: true, file: source })
    if (result.ok) {
      expect(result.file.nodes).toHaveLength(source.nodes.length)
      expect(result.file.edges).toHaveLength(source.edges.length)
    }
  })

  it.each(['{"format":"mboard"', '{"format":"mboard",}', '\x00\x01\x02'])(
    'returns an explicit invalid failure for unparseable input %j',
    raw => {
      const result = loadMboard(raw)

      expect(result).toMatchObject({
        ok: false,
        failure: { kind: 'invalid', errors: [expect.stringMatching(/JSON/i)] },
      })
    },
  )

  it.each(['schemaVersion', 'nodes', 'edges'])('names missing required field %s', field => {
    const source = validDocument() as Record<string, unknown>
    delete source[field]

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: { kind: 'invalid', errors: [`Missing required field: ${field}`] },
    })
  })

  it.each([2, 3])('refuses future schema version %i distinctly', version => {
    const source = validDocument()
    source.schemaVersion = version

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: { kind: 'too-new', found: version, supported: 1 },
    })
  })

  it.each([0, -1, '1', 1.5, null, {}])('rejects invalid schema version %j', version => {
    const source = validDocument()
    source.schemaVersion = version as never

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: ['schemaVersion must be a positive integer'],
      },
    })
  })

  it('accepts a valid empty document with empty arrays intact', () => {
    const source = validDocument()
    source.nodes = []
    source.edges = []

    expect(loadMboard(source)).toEqual({ ok: true, file: source })
  })

  it('rejects a JSON value that is not an mboard document', () => {
    expect(loadMboard({ format: 'other' })).toEqual({
      ok: false,
      failure: { kind: 'not-mboard' },
    })
  })

  it('reports nested schema violations without throwing', () => {
    const source = validDocument()
    source.nodes[0].frame.x = '10' as never

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: ['nodes[0].frame.x must be a finite number'],
      },
    })
  })

  it.each(['a string', ['bpmn']])('rejects a node whose profileData is %s', profileData => {
    const source = validDocument()
    source.nodes[0].profileData = profileData as never

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: ['nodes[0].profileData must be an object'],
      },
    })
  })

  it('rejects a node whose BPMN profile payload is null', () => {
    const source = validDocument()
    source.nodes[0].profileData = { bpmn: null } as never

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: ['nodes[0].profileData.bpmn must be an object'],
      },
    })
  })

  it('names the BPMN node id and required nodeType when it is absent', () => {
    const source = validDocument()
    source.nodes[0].profileData = { bpmn: {} } as never

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: ['nodes[0] (node-1).profileData.bpmn.nodeType is required'],
      },
    })
  })

  it.each([
    ['source', 'missing-source'],
    ['target', 'missing-target'],
  ] as const)('rejects an edge with an unknown %s node id', (endpoint, unknownId) => {
    const source = validDocument()
    source.edges[0][endpoint].nodeId = unknownId

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: [`edges[0].${endpoint}.nodeId references unknown node id: ${unknownId}`],
      },
    })
  })

  it('reports both endpoints when an edge references two unknown node ids', () => {
    const source = validDocument()
    source.edges[0].source.nodeId = 'missing-source'
    source.edges[0].target.nodeId = 'missing-target'

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: [
          'edges[0].source.nodeId references unknown node id: missing-source',
          'edges[0].target.nodeId references unknown node id: missing-target',
        ],
      },
    })
  })

  it('rejects duplicate node ids with both conflicting positions', () => {
    const source = validDocument()
    source.nodes.push({ ...source.nodes[0] })

    expect(loadMboard(source)).toEqual({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: ['nodes[1].id duplicates nodes[0].id: node-1'],
      },
    })
  })

  it('collects malformed metadata, node, edge, and history errors', () => {
    const source = validDocument()
    source.meta = {
      id: 1,
      title: null,
      createdAt: false,
      updatedAt: [],
      createdWith: { version: 1 },
      profiles: [1],
    } as never
    source.nodes[0] = {
      id: 1,
      kind: null,
      parentId: 1,
      frame: { x: null, y: '2', w: false, h: {}, rotation: [] },
      z: null,
      style: { color: null, fill: 1, stroke: '2' },
      content: null,
      profileData: [],
    } as never
    source.edges[0] = {
      id: 1,
      kind: null,
      source: { nodeId: 1, anchor: 2 },
      target: null,
      style: { color: null, stroke: '2', arrowHead: 'circle' },
      profileData: [],
    } as never
    source.history = { yjsState: 1, snapshots: {}, retention: null } as never
    source.profileConfig = [] as never
    source.assets = [] as never

    const result = loadMboard(source)

    expect(result).toMatchObject({
      ok: false,
      failure: {
        kind: 'invalid',
        errors: expect.arrayContaining([
          'meta.id must be a string',
          'nodes[0].parentId must be a string or null',
          'edges[0].style.arrowHead must be "none" or "triangle"',
          'history.snapshots must be an array',
          'profileConfig must be an object',
        ]),
      },
    })
  })

  it('does not throw for non-object inputs', () => {
    expect(loadMboard(null)).toEqual({ ok: false, failure: { kind: 'not-mboard' } })
    expect(loadMboard([])).toEqual({ ok: false, failure: { kind: 'not-mboard' } })
  })
})
