import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { serialise, type BoardElement } from '../format/mboard'
import type { DocHistory, MboardFile } from '../format/types'
import { captureSnapshot, toBase64 } from './snapshots'
import { loadIntoDoc } from './state'

const retention = { keepAllNamed: true as const, keepLastAuto: 20, decayBucketsHours: [1, 6, 24, 168], maxSnapshots: 120, maxHistoryRatio: 3 }
const meta = { id: 'doc_state', title: 'State', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdWith: { version: 'test', commit: 'test' }, profiles: ['core'] }
const element: BoardElement = { id: 'n1', type: 'sticky', x: 10, y: 20, color: '#fff', text: 'authoritative' }
const history: DocHistory = { yjsState: null, snapshots: [], retention }

function file(overrides: Partial<MboardFile> = {}): MboardFile {
  return { ...serialise({ elements: [element], meta, profileConfig: {}, history }), ...overrides }
}

describe('history state persistence', () => {
  it('keeps yjsState and snapshots paired when serialising', () => {
    const withSnapshots = captureSnapshot(new Y.Doc({ gc: false }), 'named', 'orphan')
    const emitted = serialise({ elements: [element], meta, profileConfig: {}, history: { ...history, snapshots: [withSnapshots] } })
    expect(emitted.history.yjsState).toBeNull()
    expect(emitted.history.snapshots).toEqual([])
  })

  it('uses a clean yjsState as authoritative content', () => {
    const doc = new Y.Doc({ gc: false })
    doc.getArray<BoardElement>('elements').push([{ ...element, text: 'from yjs' }])
    const encoded = toBase64(Y.encodeStateAsUpdate(doc))
    const snapshot = captureSnapshot(doc, 'auto')
    const loaded = loadIntoDoc(file({ history: { ...history, yjsState: encoded, snapshots: [snapshot] } }))
    expect(loaded.historyLost).toBe(false)
    expect(loaded.ydoc.getArray<BoardElement>('elements').toArray()[0].text).toBe('from yjs')
  })

  it('rebuilds content and reports history loss for corrupt state', () => {
    const snapshot = captureSnapshot(new Y.Doc({ gc: false }), 'auto')
    const loaded = loadIntoDoc(file({ history: { ...history, yjsState: 'not-valid-yjs', snapshots: [snapshot] } }))
    expect(loaded.historyLost).toBe(true)
    expect(loaded.ydoc.getArray<BoardElement>('elements').toArray()).toMatchObject([element])
  })
})
