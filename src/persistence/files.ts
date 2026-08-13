import type { MboardFile } from '../format/types'

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
}

type SavePickerOptions = {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as SavePickerWindow).showSaveFilePicker === 'function'
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

/**
 * Saves a document using the retained File System Access handle when possible.
 * Browsers without FSA always get an explicit `.mboard` Blob download.
 */
export async function saveDocument(
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
