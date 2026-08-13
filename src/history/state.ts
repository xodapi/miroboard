import * as Y from 'yjs'
import { deserialise } from '../format/mboard'
import type { BoardElement } from '../format/mboard'
import type { MboardFile } from '../format/types'
import { fromBase64 } from './snapshots'

/** Origin used for file replay so recovery does not look like a user edit. */
export const RECOVERY_ORIGIN = Symbol('history-recovery')

export interface LoadedDocState {
  ydoc: Y.Doc
  historyLost: boolean
}

/**
 * Reconstructs a gc:false document from its persisted history substrate.
 * The graph projection is intentionally only a safe fallback: snapshots point
 * into yjsState and cannot be used independently.
 */
export function loadIntoDoc(file: MboardFile): LoadedDocState {
  const ydoc = new Y.Doc({ gc: false })
  const encoded = file.history?.yjsState
  if (encoded) {
    try {
      Y.applyUpdate(ydoc, fromBase64(encoded), RECOVERY_ORIGIN)
      return { ydoc, historyLost: false }
    } catch (error) {
      console.warn('yjsState unreadable; rebuilding from nodes/edges', error)
    }
  }

  const { elements } = deserialise(file)
  ydoc.transact(() => {
    const target = ydoc.getArray<BoardElement>('elements')
    if (elements.length) target.push(elements)
  }, RECOVERY_ORIGIN)
  return {
    ydoc,
    historyLost: Boolean(encoded || file.history?.snapshots?.length),
  }
}
