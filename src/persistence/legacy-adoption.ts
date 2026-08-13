import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { DOC_KEY_PREFIX, docKey } from './indexeddb'

/** localStorage index of rooms that have already been inspected for adoption. */
export const LEGACY_ROOM_INDEX = 'mboard-adopted-rooms'

export interface LegacyAdoptionResult {
  adopted: string[]
  skipped: string[]
}

type LegacyContent = {
  elements: unknown[]
  meta: Record<string, unknown>
  profileConfig: Record<string, unknown>
}

function adoptionIndex(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEGACY_ROOM_INDEX) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [])
  } catch {
    console.warn('Legacy room adoption index is unreadable; rebuilding it.')
    return new Set()
  }
}

function saveAdoptionIndex(index: Set<string>): void {
  try {
    localStorage.setItem(LEGACY_ROOM_INDEX, JSON.stringify([...index].sort()))
  } catch (error) {
    console.warn('Could not save legacy room adoption index.', error)
  }
}

function urlBoardId(): string | null {
  try {
    const roomId = new URL(window.location.href).searchParams.get('board')
    return roomId?.trim() || null
  } catch {
    return null
  }
}

/** The document key that a legacy `?board=` URL should open after adoption. */
export function legacyDocumentIdFromCurrentUrl(): string | null {
  const roomId = urlBoardId()
  return roomId === null ? null : `doc_${roomId}`
}

function localStorageRooms(): string[] {
  const rooms: string[] = []
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith('board-') && key.length > 'board-'.length) rooms.push(key.slice('board-'.length))
    }
  } catch (error) {
    console.warn('Could not inspect legacy localStorage boards.', error)
  }
  return rooms
}

async function databaseNames(): Promise<string[]> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return []
  try {
    const databases = await indexedDB.databases()
    return databases.flatMap(database => typeof database.name === 'string' ? [database.name] : [])
  } catch (error) {
    console.warn('Could not enumerate legacy IndexedDB rooms.', error)
    return []
  }
}

/** Lists discoverable old room stores. Firefox cannot enumerate stores, so its URL board id is included. */
export async function listLegacyRoomStores(): Promise<string[]> {
  const names = await databaseNames()
  const rooms = names.filter(name => !name.startsWith(DOC_KEY_PREFIX))
  const urlRoom = urlBoardId()
  if (urlRoom) rooms.push(urlRoom)
  return [...new Set(rooms)].sort()
}

async function hasDatabase(name: string): Promise<boolean> {
  return (await databaseNames()).includes(name)
}

async function readLegacyIndexedDb(roomId: string): Promise<LegacyContent | null> {
  if (!await hasDatabase(roomId)) return null
  const doc = new Y.Doc()
  let persistence: IndexeddbPersistence | null = null
  try {
    persistence = new IndexeddbPersistence(roomId, doc)
    await persistence.whenSynced
    return {
      elements: doc.getArray('elements').toJSON(),
      meta: doc.getMap('meta').toJSON() as Record<string, unknown>,
      profileConfig: doc.getMap('profileConfig').toJSON() as Record<string, unknown>,
    }
  } finally {
    await persistence?.destroy()
    doc.destroy()
  }
}

function readLegacyLocalStorage(roomId: string): LegacyContent | null {
  const raw = localStorage.getItem(`board-${roomId}`)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('expected an array of elements')
    return { elements: parsed, meta: {}, profileConfig: {} }
  } catch (error) {
    console.warn(`Legacy localStorage board "${roomId}" is unreadable; it was left untouched.`, error)
    return null
  }
}

function baseDocumentId(roomId: string, meta: Record<string, unknown>): string {
  const id = meta.id
  return typeof id === 'string' && id.trim() ? id : `doc_${roomId}`
}

async function writeAdoptedCache(id: string, content: LegacyContent, roomId: string): Promise<void> {
  const doc = new Y.Doc()
  let persistence: IndexeddbPersistence | null = null
  try {
    persistence = new IndexeddbPersistence(docKey(id), doc)
    await persistence.whenSynced
    doc.transact(() => {
      if (content.elements.length) doc.getArray('elements').push(content.elements)
      const meta = doc.getMap('meta')
      Object.entries(content.meta).forEach(([key, value]) => meta.set(key, value))
      meta.set('id', id)
      if (!meta.has('title')) meta.set('title', `Recovered board (${roomId})`)
      if (!meta.has('createdAt')) meta.set('createdAt', new Date().toISOString())
      const profileConfig = doc.getMap('profileConfig')
      Object.entries(content.profileConfig).forEach(([key, value]) => profileConfig.set(key, value))
    })
    await new Promise(resolve => setTimeout(resolve, 10))
  } finally {
    await persistence?.destroy()
    doc.destroy()
  }
}

async function availableDocumentId(baseId: string): Promise<string> {
  if (!await hasDatabase(docKey(baseId))) return baseId
  let suffix = 1
  while (await hasDatabase(docKey(`${baseId}-recovered-${suffix}`))) suffix += 1
  return `${baseId}-recovered-${suffix}`
}

/**
 * Copies, never moves, recoverable legacy room data into its document-keyed cache.
 * Individual failures are intentionally isolated so startup is never blocked.
 */
export async function adoptLegacyRooms(): Promise<LegacyAdoptionResult> {
  const index = adoptionIndex()
  const discovered = new Set([...await listLegacyRoomStores(), ...localStorageRooms()])
  const result: LegacyAdoptionResult = { adopted: [], skipped: [] }
  for (const roomId of discovered) {
    if (index.has(roomId)) {
      result.skipped.push(roomId)
      continue
    }
    try {
      const indexed = await readLegacyIndexedDb(roomId)
      const local = indexed === null ? readLegacyLocalStorage(roomId) : null
      const content = indexed ?? local
      if (content === null) {
        console.warn(`Legacy room "${roomId}" has no recoverable board data.`)
      } else {
        const id = await availableDocumentId(baseDocumentId(roomId, content.meta))
        await writeAdoptedCache(id, content, roomId)
        result.adopted.push(id)
      }
    } catch (error) {
      console.warn(`Legacy room "${roomId}" could not be adopted; original data was left untouched.`, error)
    } finally {
      // Record inspected empty and broken rooms too, preventing repeated startup work.
      index.add(roomId)
      saveAdoptionIndex(index)
    }
  }
  return result
}
