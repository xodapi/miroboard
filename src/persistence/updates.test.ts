import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { commitElementUpdate } from './updates'

describe('field-level Yjs updates', () => {
  it('does not transact for a no-op update', () => {
    const doc = new Y.Doc({ gc: false })
    const elements = doc.getArray<{ id: string; x: number; y: number }>('elements')
    elements.push([{ id: 'node-1', x: 10, y: 20 }])
    let transactions = 0
    doc.on('afterTransaction', () => { transactions++ })

    expect(commitElementUpdate(doc, elements, 'node-1', { x: 10 })).toBe(false)
    expect(transactions).toBe(0)
  })

  it('coalesces a 60-event gesture into one committed update', () => {
    const doc = new Y.Doc({ gc: false })
    const elements = doc.getArray<{ id: string; x: number; y: number }>('elements')
    elements.push([{ id: 'node-1', x: 0, y: 0 }])
    const before = Y.encodeStateAsUpdate(doc).byteLength
    let transactions = 0
    doc.on('afterTransaction', () => { transactions++ })

    // Pointer moves are transient React state; only the final frame reaches Yjs.
    for (let i = 1; i <= 60; i++) {
      // Deliberately do not write intermediate frames to the CRDT.
      void i
    }
    expect(commitElementUpdate(doc, elements, 'node-1', { x: 60, y: 60 })).toBe(true)

    expect(transactions).toBe(1)
    expect(Y.encodeStateAsUpdate(doc).byteLength - before).toBeLessThan(4 * 1024)
  })
})
