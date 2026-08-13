import type { MboardFile } from '../format/types'
import { loadMboard, type LoadFailure } from '../format/schema'
import { createOperationQueue } from './operation-queue'

export const MBOARD_EXTENSION = '.mboard'
export const MBOARD_MIME = 'application/json'

export interface FileSession {
  /** A retained File System Access handle enables an in-place Save. */
  handle: FileSystemFileHandle | null
  /** The document name shown to the user, or null before its first save. */
  name: string | null
  isUntitled: boolean
}

export type SaveOutcome =
  | { kind: 'saved'; session: FileSession }
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: unknown }

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<FileSystemFileHandle>
  showOpenFilePicker?: (options?: OpenPickerOptions) => Promise<FileSystemFileHandle[]>
}

type SavePickerOptions = {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

type OpenPickerOptions = {
  multiple?: boolean
  types?: { description: string; accept: Record<string, string[]> }[]
}

export type OpenOutcome =
  | { kind: 'opened'; file: MboardFile; session: FileSession; migratedFrom?: number }
  | { kind: 'cancelled' }
  | { kind: 'failed'; failure: LoadFailure }

export type DroppedOpenOutcome = (OpenOutcome & { ignoredFileCount: number })

const fileOperationQueue = createOperationQueue()

export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as SavePickerWindow).showSaveFilePicker === 'function'
}

function hasOpenFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as SavePickerWindow).showOpenFilePicker === 'function'
}

function defaultName(file: MboardFile, session: FileSession): string {
  if (session.name) return session.name
  const title = file.meta.title.trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${title || 'MiroBoard'}${MBOARD_EXTENSION}`
}

function pickerOptions(suggestedName: string): SavePickerOptions {
  return {
    suggestedName,
    types: [{
      description: 'MiroBoard document',
      accept: { [MBOARD_MIME]: [MBOARD_EXTENSION] },
    }],
  }
}

function openPickerOptions(): OpenPickerOptions {
  return {
    multiple: false,
    types: [{
      description: 'MiroBoard document',
      accept: { [MBOARD_MIME]: [MBOARD_EXTENSION] },
    }],
  }
}

function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function writeHandle(handle: FileSystemFileHandle, contents: string): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(contents)
  await writable.close()
}

function download(contents: string, name: string): void {
  const blob = new Blob([contents], { type: `${MBOARD_MIME};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

async function readMboard(file: File): Promise<OpenOutcome> {
  const loaded = loadMboard(await file.text())
  return loaded.ok
    ? { kind: 'opened', file: loaded.file, session: { handle: null, name: file.name, isUntitled: false }, migratedFrom: loaded.migratedFrom }
    : { kind: 'failed', failure: loaded.failure }
}

type FileSystemDataTransferItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemFileHandle | FileSystemDirectoryHandle | null>
}

/**
 * Opens exactly the first dropped file. A matching File System Access item
 * retains its writable handle; browsers without it use the read-only File.
 */
async function openDroppedDocumentUnsafe(transfer: DataTransfer): Promise<DroppedOpenOutcome> {
  const files = Array.from(transfer.files)
  const ignoredFileCount = Math.max(0, files.length - 1)
  const file = files[0]
  if (!file) return { kind: 'cancelled', ignoredFileCount }
  if (!file.name.toLowerCase().endsWith(MBOARD_EXTENSION)) {
    return { kind: 'failed', failure: { kind: 'not-mboard' }, ignoredFileCount }
  }

  const item = transfer.items?.[0] as FileSystemDataTransferItem | undefined
  let handle: FileSystemFileHandle | null = null
  try {
    const candidate = await item?.getAsFileSystemHandle?.()
    if (candidate?.kind === 'file') handle = candidate
  } catch {
    // A browser may deny a dropped handle. The File remains a safe read-only fallback.
  }
  const loaded = await readMboard(file)
  if (loaded.kind !== 'opened') return { ...loaded, ignoredFileCount }
  return {
    ...loaded,
    ignoredFileCount,
    session: handle
      ? { handle, name: handle.name, isUntitled: false }
      : loaded.session,
  }
}

export function openDroppedDocument(transfer: DataTransfer): Promise<DroppedOpenOutcome> {
  return fileOperationQueue.run(() => openDroppedDocumentUnsafe(transfer))
}

function chooseFileFallback(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `${MBOARD_EXTENSION},${MBOARD_MIME}`
    input.style.display = 'none'
    input.onchange = () => {
      const file = input.files?.[0] ?? null
      input.remove()
      resolve(file)
    }
    input.oncancel = () => {
      input.remove()
      resolve(null)
    }
    document.body.append(input)
    input.click()
  })
}

/** Opens and validates a `.mboard` document without mutating the current session. */
async function openDocumentUnsafe(): Promise<OpenOutcome> {
  try {
    if (hasOpenFileSystemAccess()) {
      const [handle] = await (window as SavePickerWindow).showOpenFilePicker!(openPickerOptions())
      if (!handle) return { kind: 'cancelled' }
      const loaded = await readMboard(await handle.getFile())
      return loaded.kind === 'opened'
        ? { ...loaded, session: { handle, name: handle.name, isUntitled: false } }
        : loaded
    }

    const file = await chooseFileFallback()
    return file ? readMboard(file) : { kind: 'cancelled' }
  } catch (error) {
    if (isCancellation(error)) return { kind: 'cancelled' }
    return { kind: 'failed', failure: { kind: 'invalid', errors: ['Не удалось прочитать документ .mboard'] } }
  }
}

export function openDocument(): Promise<OpenOutcome> {
  return fileOperationQueue.run(() => openDocumentUnsafe())
}

/**
 * Saves a document using the retained File System Access handle when possible.
 * Browsers without FSA always get an explicit `.mboard` Blob download.
 */
async function saveDocumentUnsafe(
  file: MboardFile,
  session: FileSession,
  mode: 'save' | 'saveAs',
): Promise<SaveOutcome> {
  const contents = JSON.stringify(file, null, 2)
  const name = defaultName(file, session)

  try {
    if (hasFileSystemAccess()) {
      let handle = mode === 'save' ? session.handle : null
      if (!handle) handle = await (window as SavePickerWindow).showSaveFilePicker!(pickerOptions(name))
      await writeHandle(handle, contents)
      return { kind: 'saved', session: { handle, name: handle.name, isUntitled: false } }
    }

    download(contents, name)
    return { kind: 'saved', session: { handle: null, name, isUntitled: false } }
  } catch (error) {
    return isCancellation(error) ? { kind: 'cancelled' } : { kind: 'failed', error }
  }
}

export function saveDocument(
  file: MboardFile,
  session: FileSession,
  mode: 'save' | 'saveAs',
): Promise<SaveOutcome> {
  return fileOperationQueue.run(() => saveDocumentUnsafe(file, session, mode))
}
