import * as Y from 'yjs'

/** Marks Yjs writes that replay the local recovery cache rather than user intent. */
export const RECOVERY_ORIGIN = Symbol('recovery')

/** Marks a history restore, which has its own explicit dirty-state handling. */
export const HISTORY_RESTORE_ORIGIN = Symbol('history-restore')

export interface DirtyTracker {
  isDirty(): boolean
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
): DirtyTracker {
  let dirty = false
  const handler = (_update: Uint8Array, origin: unknown) => {
    if (origin === RECOVERY_ORIGIN || origin === HISTORY_RESTORE_ORIGIN) return
    if (!dirty) {
      dirty = true
      onChange(true)
    }
  }

  ydoc.on('update', handler)
  return {
    isDirty: () => dirty,
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
