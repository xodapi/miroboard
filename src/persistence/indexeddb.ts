import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export const DOC_KEY_PREFIX = 'mboard-doc-'

let failureReported = false

export function docKey(docId: string): string {
  return `${DOC_KEY_PREFIX}${docId}`
}

/**
 * Attach the crash-recovery cache and wait until its replay has completed.
 * IndexedDB is deliberately optional: the editor remains usable in memory when
 * storage is denied or corrupted.
 */
export async function attachRecoveryCache(
  docId: string,
  ydoc: Y.Doc,
): Promise<{ persistence: IndexeddbPersistence | null; synced: boolean }> {
  if (typeof indexedDB === 'undefined') {
    reportFailure(new Error('IndexedDB is unavailable'))
    return { persistence: null, synced: false }
  }
  try {
    const persistence = new IndexeddbPersistence(docKey(docId), ydoc)
    await persistence.whenSynced
    return { persistence, synced: true }
  } catch (error) {
    reportFailure(error)
    return { persistence: null, synced: false }
  }
}

function reportFailure(error: unknown): void {
  if (failureReported) return
  failureReported = true
  console.warn('Recovery cache unavailable; working in memory only', error)
}
