import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasFileSystemAccess, saveDocument, type FileSession } from './files'
import type { MboardFile } from '../format/types'

const documentFile = (): MboardFile => ({
  format: 'mboard', schemaVersion: 1,
  meta: { id: 'doc_test', title: 'Untitled board', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z', createdWith: { version: 'test', commit: 'test' }, profiles: ['core'] },
  nodes: [], edges: [], profileConfig: {},
  history: { yjsState: null, snapshots: [], retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [1], maxSnapshots: 120, maxHistoryRatio: 3 } },
  assets: {},
})

const untitled: FileSession = { handle: null, name: null, isUntitled: true }

afterEach(() => {
  vi.restoreAllMocks()
  delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker
})

describe('file save paths', () => {
  it('detects File System Access only when the save picker is callable', () => {
    expect(hasFileSystemAccess()).toBe(false)
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn()
    expect(hasFileSystemAccess()).toBe(true)
  })

  it('uses a retained FSA handle for Save without showing another picker', async () => {
    const write = vi.fn()
    const close = vi.fn()
    const handle = { name: 'existing.mboard', createWritable: vi.fn().mockResolvedValue({ write, close }) }
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn()

    await expect(saveDocument(documentFile(), { handle: handle as unknown as FileSystemFileHandle, name: 'existing.mboard', isUntitled: false }, 'save'))
      .resolves.toEqual({ kind: 'saved', session: { handle, name: 'existing.mboard', isUntitled: false } })
    expect(write).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect((window as Window & { showSaveFilePicker?: ReturnType<typeof vi.fn> }).showSaveFilePicker).not.toHaveBeenCalled()
  })

  it('uses the FSA picker for an untitled Save and Save As', async () => {
    const handle = { name: 'chosen.mboard', createWritable: vi.fn().mockResolvedValue({ write: vi.fn(), close: vi.fn() }) }
    const picker = vi.fn().mockResolvedValue(handle)
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = picker

    const outcome = await saveDocument(documentFile(), untitled, 'save')
    expect(outcome).toMatchObject({ kind: 'saved', session: { handle, name: 'chosen.mboard', isUntitled: false } })
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Untitled-board.mboard' }))
  })

  it('downloads a UTF-8 .mboard Blob when FSA is unavailable', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    await expect(saveDocument(documentFile(), untitled, 'save')).resolves.toMatchObject({
      kind: 'saved', session: { handle: null, name: 'Untitled-board.mboard', isUntitled: false },
    })
    expect(click).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('reports picker cancellation distinctly', async () => {
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    await expect(saveDocument(documentFile(), untitled, 'saveAs')).resolves.toEqual({ kind: 'cancelled' })
  })
})
