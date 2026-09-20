/**
 * Transaction origins for every local write to the board document.
 *
 * Why explicit origins matter: three subsystems decide what to do with a write
 * purely by its origin — the UndoManager (which writes are "mine"), the dirty
 * tracker and the checkpoint triggers (which writes express user intent). Today
 * all of them key off `null`, which means "some local write", so none of them
 * can tell a gesture from a clipboard paste from a history restore.
 *
 * Remote collaboration will add provider-owned origins (a provider instance is
 * its own origin). Every origin in this module is local by construction, which
 * is what `LOCAL_ORIGINS` asserts.
 */
import { HISTORY_RESTORE_ORIGIN } from '../history/snapshots'
import { RECOVERY_ORIGIN } from '../persistence/dirty'

/** Discrete user edits: create, delete, property change, z-order, paste. */
export const LOCAL_EDIT = Symbol('local-edit')

/**
 * The single commit at the end of a continuous gesture (drag, resize, stroke).
 * Kept separate from LOCAL_EDIT so gesture commits can be merged into one undo
 * step or excluded from checkpoint counting without touching ordinary edits.
 */
export const LOCAL_GESTURE = Symbol('local-gesture')

/** Clipboard paste and duplicate: one user action producing many elements. */
export const LOCAL_CLIPBOARD = Symbol('local-clipboard')

/** Inserting a template or an educational example. */
export const LOCAL_TEMPLATE = Symbol('local-template')

/** Loading a document from a file or from the recovery cache. */
export const LOAD = Symbol('load')

/** Writes that represent the local user's own intent, i.e. undoable. */
export const LOCAL_ORIGINS: ReadonlySet<unknown> = new Set([
  LOCAL_EDIT,
  LOCAL_GESTURE,
  LOCAL_CLIPBOARD,
  LOCAL_TEMPLATE,
])

/**
 * Writes that must never make a document dirty and never count as an edit:
 * file/recovery load, an applied history restore, and the pre-existing
 * `null` origin still produced by code paths not yet migrated.
 */
export const NON_EDIT_ORIGINS: ReadonlySet<unknown> = new Set([
  RECOVERY_ORIGIN,
  HISTORY_RESTORE_ORIGIN,
  LOAD,
])

export type LocalOrigin = typeof LOCAL_EDIT | typeof LOCAL_GESTURE | typeof LOCAL_CLIPBOARD | typeof LOCAL_TEMPLATE
