import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { attachRecoveryCache, docKey } from './indexeddb'
import { LEGACY_ROOM_INDEX, adoptLegacyRooms, legacyDocumentIdFromCurrentUrl, listLegacyRoomStores } from './legacy-adoption'

const created = new Set<string>()

async function seedLegacy(roomId: string, elements: unknown[], meta: Record<string, unknown> = {}, profileConfig: Record<string, unknown> = {}): Promise<void> {
  created.add(roomId)
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(roomId, doc)
  await persistence.whenSynced
  doc.transact(() => {
    if (elements.length) doc.getArray('elements').push(elements)
    Object.entries(meta).forEach(([key, value]) => doc.getMap('meta').set(key, value))
    Object.entries(profileConfig).forEach(([key, value]) => doc.getMap('profileConfig').set(key, value))
  })
  await new Promise(resolve => setTimeout(resolve, 10))
  await persistence.destroy()
  doc.destroy()
}

async function seedMalformedLegacy(roomId: string): Promise<void> {
  created.add(roomId)
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(roomId, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('updates')) request.result.createObjectStore('updates', { autoIncrement: true })
      if (!request.result.objectStoreNames.contains('custom')) request.result.createObjectStore('custom')
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('updates', 'readwrite')
      transaction.objectStore('updates').add(new Uint8Array([1, 2, 3]))
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
    }
  })
}

async function legacyUpdateBytes(roomId: string): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(roomId)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('updates', 'readonly')
      const updates = transaction.objectStore('updates').getAll()
      updates.onerror = () => reject(updates.error)
      updates.onsuccess = () => {
        database.close()
        resolve((updates.result as Uint8Array[]).map(update => Array.from(update)))
      }
    }
  })
}

async function readCache(id: string): Promise<Y.Doc> {
  created.add(docKey(id))
  const doc = new Y.Doc()
  const attached = await attachRecoveryCache(id, doc)
  attached.persistence?.destroy()
  return doc
}

afterEach(async () => {
  localStorage.clear()
  await Promise.all([...created].map(name => new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })))
  created.clear()
  vi.restoreAllMocks()
})

describe('legacy room adoption', () => {
  it('discovers legacy IndexedDB rooms plus the board id in the URL', async () => {
    await seedLegacy('room-indexed', [])
    history.replaceState({}, '', '/?board=room-url')

    await expect(listLegacyRoomStores()).resolves.toEqual(expect.arrayContaining(['room-indexed', 'room-url']))
    expect(legacyDocumentIdFromCurrentUrl()).toBe('doc_room-url')
  })

  it('adopts a legacy room under its document id while preserving elements, metadata and configuration', async () => {
    await seedLegacy('old-room', [{ id: 'sticky', color: '#ffd', x: 1 }], { title: 'Recovered board' }, { bpmn: { simulation: { seed: '007' } } })

    await adoptLegacyRooms()

    const adopted = await readCache('doc_old-room')
    expect(adopted.getArray('elements').toJSON()).toEqual([{ id: 'sticky', color: '#ffd', x: 1 }])
    expect(adopted.getMap('meta').toJSON()).toMatchObject({ id: 'doc_old-room', title: 'Recovered board' })
    expect(adopted.getMap('profileConfig').toJSON()).toEqual({ bpmn: { simulation: { seed: '007' } } })
    expect(localStorage.getItem(LEGACY_ROOM_INDEX)).toContain('old-room')
  })

  it('is idempotent and does not replace edits made in the adopted cache', async () => {
    await seedLegacy('once', [{ id: 'old' }])
    await adoptLegacyRooms()
    const edited = await readCache('doc_once')
    const writer = await attachRecoveryCache('doc_once', edited)
    edited.getArray('elements').push([{ id: 'new' }])
    await new Promise(resolve => setTimeout(resolve, 10))
    await writer.persistence?.destroy()
    edited.destroy()

    await adoptLegacyRooms()
    const reloaded = await readCache('doc_once')
    expect(reloaded.getArray('elements').toJSON()).toEqual([{ id: 'old' }, { id: 'new' }])
  })

  it('records empty, corrupt, and localStorage-only rooms without deleting their source', async () => {
    await seedLegacy('empty', [])
    localStorage.setItem('board-bad', '{not json')
    localStorage.setItem('board-local-only', JSON.stringify([{ id: 'local', color: '#fff' }]))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await adoptLegacyRooms()

    expect(JSON.parse(localStorage.getItem(LEGACY_ROOM_INDEX) ?? '[]')).toEqual(expect.arrayContaining(['empty', 'bad', 'local-only']))
    expect(localStorage.getItem('board-bad')).toBe('{not json')
    expect(localStorage.getItem('board-local-only')).toContain('local')
    expect(warn).toHaveBeenCalled()
    const local = await readCache('doc_local-only')
    expect(local.getArray('elements').toJSON()).toEqual([{ id: 'local', color: '#fff' }])
  })

  it('reports malformed Yjs updates and leaves the legacy IndexedDB record untouched', async () => {
    const roomId = 'malformed-yjs-update'
    await seedMalformedLegacy(roomId)
    const before = await legacyUpdateBytes(roomId)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(adoptLegacyRooms()).resolves.toMatchObject({ adopted: [], failed: [roomId] })

    expect(warn).toHaveBeenCalledWith(
      `Legacy room "${roomId}" could not be adopted; original data was left untouched.`,
      expect.anything(),
    )
    expect(await legacyUpdateBytes(roomId)).toEqual(before)
    expect(localStorage.getItem(LEGACY_ROOM_INDEX)).toContain(roomId)
  })

  it('preserves an occupied document cache and adopts the legacy board to an alternate id', async () => {
    const existing = new Y.Doc()
    const cache = await attachRecoveryCache('doc_clash', existing)
    existing.getArray('elements').push([{ id: 'current' }])
    await new Promise(resolve => setTimeout(resolve, 10))
    await cache.persistence?.destroy()
    existing.destroy()
    created.add(docKey('doc_clash'))
    await seedLegacy('clash', [{ id: 'legacy' }])

    const result = await adoptLegacyRooms()

    expect(result.adopted).toHaveLength(1)
    expect(result.adopted[0]).toMatch(/^doc_clash-recovered-/)
    const untouched = await readCache('doc_clash')
    expect(untouched.getArray('elements').toJSON()).toEqual([{ id: 'current' }])
  })
})
