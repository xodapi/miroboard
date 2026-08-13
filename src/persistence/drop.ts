import { deserialise } from '../format/mboard'
import { RECOVERY_ORIGIN, type DirtyTracker } from './dirty'
import { openDroppedDocument } from './files'

type BoardDoc<T> = {
  ydoc: import('yjs').Doc
  elements: import('yjs').Array<T> | null
}

export async function loadDroppedBoard<T>(
  transfer: DataTransfer,
  document: BoardDoc<T>,
  isDirty: boolean,
  dirtyTracker: DirtyTracker | null,
  confirmDiscard: () => boolean,
  onOpened: (session: import('./files').FileSession, ignoredFileCount: number) => void,
  onFailure: () => void,
): Promise<void> {
  const outcome = await openDroppedDocument(transfer)
  if (outcome.kind === 'cancelled') return
  if (outcome.kind === 'failed') {
    onFailure()
    return
  }
  if (isDirty && !confirmDiscard()) return
  const loaded = deserialise(outcome.file)
  const meta = document.ydoc.getMap<unknown>('meta')
  const profileConfig = document.ydoc.getMap<unknown>('profileConfig')
  document.ydoc.transact(() => {
    document.elements?.delete(0, document.elements.length)
    if (loaded.elements.length) document.elements?.push(loaded.elements as T[])
    meta.clear()
    Object.entries(loaded.meta).forEach(([key, value]) => meta.set(key, value))
    profileConfig.clear()
    Object.entries(loaded.profileConfig).forEach(([key, value]) => profileConfig.set(key, value))
  }, RECOVERY_ORIGIN)
  dirtyTracker?.markSaved()
  onOpened(outcome.session, outcome.ignoredFileCount)
}
