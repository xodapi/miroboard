import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
export { HISTORY_RESTORE_ORIGIN } from '../history/snapshots'
import { HISTORY_RESTORE_ORIGIN } from '../history/snapshots'

/** Marks Yjs writes that replay the local recovery cache rather than user intent. */
export const RECOVERY_ORIGIN = Symbol('recovery')

/**
 * Origins that express no content edit: the recovery cache replaying itself and
 * an applied history restore. Kept as the default so existing callers and tests
 * are unaffected; App passes `NON_EDIT_ORIGINS` from src/collab/origins.ts, which
 * adds `LOAD` — opening a file is not an edit either, and labelling it as one
 * left freshly opened documents reporting "Не сохранено".
 */
const DEFAULT_IGNORED_ORIGINS: ReadonlySet<unknown> = new Set([RECOVERY_ORIGIN, HISTORY_RESTORE_ORIGIN])

export interface DirtyTracker {
  isDirty(): boolean
  markDirty(): void
  markSaved(): void
  dispose(): void
}

/**
 * Derives document dirtiness from all Yjs updates, ensuring mutation paths
 * cannot omit a manual "mark dirty" call.
 */
export function createDirtyTracker(
  ydoc: Y.Doc,
  onChange: (dirty: boolean) => void,
  ignoredOrigins: ReadonlySet<unknown> = DEFAULT_IGNORED_ORIGINS,
): DirtyTracker {
  let dirty = false
  const handler = (_update: Uint8Array, origin: unknown) => {
    // y-indexeddb applies its startup replay in a transaction whose origin is
    // the persistence instance. Treat that library-originated write like an
    // explicit recovery transaction, while still tracking all user updates.
    if (ignoredOrigins.has(origin) || origin instanceof IndexeddbPersistence) return
    if (!dirty) {
      dirty = true
      onChange(true)
    }
  }

  ydoc.on('update', handler)
  return {
    isDirty: () => dirty,
    markDirty: () => {
      if (!dirty) {
        dirty = true
        onChange(true)
      }
    },
    markSaved: () => {
      dirty = false
      onChange(false)
    },
    dispose: () => ydoc.off('update', handler),
  }
}

/** Registers the browser leave-confirmation only while unsaved changes exist. */
export function addBeforeUnloadGuard(isDirty: boolean): () => void {
  if (!isDirty) return () => undefined
  const guard = (event: BeforeUnloadEvent) => {
    event.preventDefault()
    event.returnValue = ''
  }
  window.addEventListener('beforeunload', guard)
  return () => window.removeEventListener('beforeunload', guard)
}
