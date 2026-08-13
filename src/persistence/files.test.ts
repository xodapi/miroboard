import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasFileSystemAccess, openDocument, openDroppedDocument, saveDocument, type FileSession } from './files'
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
  delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker
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

  it('serializes two pending saves to one handle without interleaving writes', async () => {
    const writes: string[] = []
    let releaseFirst!: () => void
    let writableCount = 0
    const handle = {
      name: 'race.mboard',
      createWritable: vi.fn().mockImplementation(async () => {
        writableCount += 1
        if (writableCount === 1) {
          return {
            write: vi.fn(async (contents: string) => {
              await new Promise<void>(resolve => { releaseFirst = resolve })
              writes.push(contents)
            }),
            close: vi.fn(),
          }
        }
        return { write: vi.fn(async (contents: string) => { writes.push(contents) }), close: vi.fn() }
      }),
    }
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn()
    const firstFile = documentFile()
    firstFile.meta.title = 'first'
    const secondFile = documentFile()
    secondFile.meta.title = 'second'
    const first = saveDocument(firstFile, { handle: handle as unknown as FileSystemFileHandle, name: handle.name, isUntitled: false }, 'save')
    const second = saveDocument(secondFile, { handle: handle as unknown as FileSystemFileHandle, name: handle.name, isUntitled: false }, 'save')

    await vi.waitFor(() => expect(writableCount).toBe(1))
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'))
    releaseFirst()
    await expect(first).resolves.toMatchObject({ kind: 'saved' })
    await expect(second).resolves.toMatchObject({ kind: 'saved' })
    expect(writes).toHaveLength(2)
    expect(JSON.parse(writes[0]).meta.title).toBe('first')
    expect(JSON.parse(writes[1]).meta.title).toBe('second')
  })

  it('starts a queued save only after an in-flight load completes', async () => {
    let resolveText!: (value: string) => void
    const handle = {
      name: 'loading.mboard',
      getFile: vi.fn().mockResolvedValue({ name: 'loading.mboard', text: () => new Promise<string>(resolve => { resolveText = resolve }) }),
    }
    const saveHandle = { name: 'saved.mboard', createWritable: vi.fn().mockResolvedValue({ write: vi.fn(), close: vi.fn() }) }
    ;(window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker = vi.fn().mockResolvedValue([handle])
    ;(window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = vi.fn()
    const loading = openDocument()
    const saving = saveDocument(documentFile(), { handle: saveHandle as unknown as FileSystemFileHandle, name: saveHandle.name, isUntitled: false }, 'save')

    await vi.waitFor(() => expect(handle.getFile).toHaveBeenCalledOnce())
    expect(saveHandle.createWritable).not.toHaveBeenCalled()
    resolveText(JSON.stringify(documentFile()))
    await expect(loading).resolves.toMatchObject({ kind: 'opened' })
    await expect(saving).resolves.toMatchObject({ kind: 'saved' })
    expect(saveHandle.createWritable).toHaveBeenCalledOnce()
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

  it('opens a validated document through FSA and retains its handle', async () => {
    const handle = {
      name: 'opened.mboard',
      getFile: vi.fn().mockResolvedValue({ name: 'opened.mboard', text: async () => JSON.stringify(documentFile()) }),
    }
    const picker = vi.fn().mockResolvedValue([handle])
    ;(window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker = picker

    await expect(openDocument()).resolves.toMatchObject({
      kind: 'opened',
      file: documentFile(),
      session: { handle, name: 'opened.mboard', isUntitled: false },
    })
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({
      multiple: false,
      types: [expect.objectContaining({ accept: { 'application/json': ['.mboard'] } })],
    }))
  })

  it('uses a hidden file input with the required accept filter without FSA', async () => {
    let accept = ''
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      accept = this.accept
      Object.defineProperty(this, 'files', { value: [{ name: 'fallback.mboard', text: async () => JSON.stringify(documentFile()) }] })
      this.onchange?.(new Event('change'))
    })

    await expect(openDocument()).resolves.toMatchObject({
      kind: 'opened',
      session: { handle: null, name: 'fallback.mboard', isUntitled: false },
    })
    expect(click).toHaveBeenCalledOnce()
    expect(accept).toBe('.mboard,application/json')
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('does not open invalid documents', async () => {
    const handle = { name: 'bad.mboard', getFile: vi.fn().mockResolvedValue({ name: 'bad.mboard', text: async () => '{}' }) }
    ;(window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker = vi.fn().mockResolvedValue([handle])
    await expect(openDocument()).resolves.toEqual({ kind: 'failed', failure: { kind: 'not-mboard' } })
  })

  it.each([
    ['empty', '', { kind: 'empty' }],
    ['truncated JSON', '{"format":"mboard"', { kind: 'parse-error', message: 'Invalid JSON: unable to parse document' }],
    ['wrong document shape', '{"hello":1}', { kind: 'not-mboard' }],
    ['newer schema', JSON.stringify({ ...documentFile(), schemaVersion: 2 }), { kind: 'too-new', found: 2, supported: 1 }],
  ])('preserves a distinct load failure for %s', async (_name, contents, failure) => {
    const handle = {
      name: 'bad.mboard',
      getFile: vi.fn().mockResolvedValue({ name: 'bad.mboard', text: async () => contents }),
    }
    ;(window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker = vi.fn().mockResolvedValue([handle])

    await expect(openDocument()).resolves.toEqual({ kind: 'failed', failure })
  })

  it('opens the first dropped .mboard and retains an item FSA handle', async () => {
    const handle = { kind: 'file', name: 'dropped.mboard' }
    const file = { name: 'dropped.mboard', text: async () => JSON.stringify(documentFile()) } as File
    const transfer = {
      files: [file],
      items: [{ getAsFileSystemHandle: vi.fn().mockResolvedValue(handle) }],
    } as unknown as DataTransfer

    await expect(openDroppedDocument(transfer)).resolves.toMatchObject({
      kind: 'opened',
      session: { handle, name: 'dropped.mboard', isUntitled: false },
      ignoredFileCount: 0,
    })
  })

  it('rejects a dropped non-.mboard without reading it', async () => {
    const file = new File(['not a board'], 'image.png', { type: 'image/png' })
    const transfer = { files: [file], items: [] } as unknown as DataTransfer

    await expect(openDroppedDocument(transfer)).resolves.toEqual({
      kind: 'failed', failure: { kind: 'not-mboard' }, ignoredFileCount: 0,
    })
  })

  it('uses only the first file in a multi-file drop', async () => {
    const first = { name: 'first.mboard', text: async () => JSON.stringify(documentFile()) } as File
    const second = { name: 'second.mboard', text: async () => 'ignored' } as File
    const transfer = { files: [first, second], items: [] } as unknown as DataTransfer

    await expect(openDroppedDocument(transfer)).resolves.toMatchObject({
      kind: 'opened', ignoredFileCount: 1, session: { name: 'first.mboard' },
    })
  })
})
