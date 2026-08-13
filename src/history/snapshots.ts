import * as Y from 'yjs'
import type { HistorySnapshot } from '../format/types'

/** Transaction origin used for a restore that appends a new current state. */
export const HISTORY_RESTORE_ORIGIN = Symbol('history-restore')

function bytesToBinary(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return binary
}

/** Encodes binary Yjs state for JSON-safe .mboard storage. */
export function toBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes))
}

/** Decodes JSON-safe base64 back to the binary representation Yjs expects. */
export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

/** Captures a compact pointer to the current gc:false Yjs document state. */
export function captureSnapshot(
  ydoc: Y.Doc,
  kind: HistorySnapshot['kind'],
  label?: string,
): HistorySnapshot {
  const snapshot = Y.snapshot(ydoc)
  return {
    id: `snap_${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    kind,
    ...(label === undefined ? {} : { label }),
    snapshot: toBase64(Y.encodeSnapshot(snapshot)),
    elementCount: ydoc.getArray('elements').length,
  }
}

/** Materializes an entry into an isolated historical document without changing live state. */
export function readSnapshot<T = unknown>(ydoc: Y.Doc, entry: HistorySnapshot): T[] {
  const snapshot = Y.decodeSnapshot(fromBase64(entry.snapshot))
  const past = Y.createDocFromSnapshot(ydoc, snapshot)
  try {
    return past.getArray<T>('elements').toArray()
  } finally {
    past.destroy()
  }
}

/**
 * Makes historical board content the new head state. Snapshot records themselves
 * are external metadata and are deliberately not mutated by this operation.
 */
export function restoreSnapshot<T = unknown>(ydoc: Y.Doc, entry: HistorySnapshot): void {
  const pastElements = readSnapshot<T>(ydoc, entry)
  ydoc.transact(() => {
    const elements = ydoc.getArray<T>('elements')
    if (elements.length > 0) elements.delete(0, elements.length)
    if (pastElements.length > 0) elements.push(pastElements)
  }, HISTORY_RESTORE_ORIGIN)
}
