import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createDirtyTracker } from './dirty'
import { loadDroppedBoard } from './drop'
import type { MboardFile } from '../format/types'

const { openDroppedDocument } = vi.hoisted(() => ({ openDroppedDocument: vi.fn() }))
vi.mock('./files', () => ({ openDroppedDocument }))

const file: MboardFile = {
  format: 'mboard', schemaVersion: 1,
  meta: { id: 'doc_drop', title: 'Dropped', createdAt: 'a', updatedAt: 'b', createdWith: { version: 'test', commit: 'test' }, profiles: ['core'] },
  nodes: [{ id: 'sticky', kind: 'sticky', parentId: null, frame: { x: 1, y: 2, w: null, h: null, rotation: 0 }, z: 0, style: { color: '#fff', fill: null, stroke: null }, content: {}, profileData: {} }],
  edges: [], profileConfig: {}, history: { yjsState: null, snapshots: [], retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [], maxSnapshots: 120, maxHistoryRatio: 3 } }, assets: {},
}

function board() {
  const ydoc = new Y.Doc()
  return { ydoc, elements: ydoc.getArray('elements') }
}

describe('dropped board loading', () => {
  it('does nothing for cancelled drops and reports failed drops', async () => {
    const target = board()
    const onFailure = vi.fn()
    openDroppedDocument.mockResolvedValueOnce({ kind: 'cancelled' })
    await loadDroppedBoard({} as DataTransfer, target, false, null, () => true, vi.fn(), onFailure)
    openDroppedDocument.mockResolvedValueOnce({ kind: 'failed' })
    await loadDroppedBoard({} as DataTransfer, target, false, null, () => true, vi.fn(), onFailure)
    expect(onFailure).toHaveBeenCalledOnce()
  })

  it('keeps a dirty document when discard is declined', async () => {
    const target = board()
    const opened = vi.fn()
    openDroppedDocument.mockResolvedValueOnce({ kind: 'opened', file, session: { handle: null, name: 'drop.mboard', isUntitled: false }, ignoredFileCount: 0 })
    await loadDroppedBoard({} as DataTransfer, target, true, null, () => false, opened, vi.fn())
    expect(target.elements.toJSON()).toEqual([])
    expect(opened).not.toHaveBeenCalled()
  })

  it('replaces content and document maps for an accepted drop', async () => {
    const target = board()
    target.elements.push([{ id: 'old' }])
    const onOpened = vi.fn()
    const tracker = createDirtyTracker(target.ydoc, vi.fn())
    openDroppedDocument.mockResolvedValueOnce({ kind: 'opened', file, session: { handle: null, name: 'drop.mboard', isUntitled: false }, ignoredFileCount: 2 })
    await loadDroppedBoard({} as DataTransfer, target, false, tracker, () => true, onOpened, vi.fn())
    expect(target.elements.toJSON()).toMatchObject([{ id: 'sticky', x: 1 }])
    expect(target.ydoc.getMap('meta').toJSON()).toMatchObject({ id: 'doc_drop', title: 'Dropped' })
    expect(onOpened).toHaveBeenCalledWith({ handle: null, name: 'drop.mboard', isUntitled: false }, 2)
    tracker.dispose()
  })
})
