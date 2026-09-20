import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { commitElementUpdate } from '../../src/persistence/updates'

type El = { id: string; x: number; color: string; text?: string }

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
}

describe('probe: current CRDT shape under concurrency', () => {
  it('A: two clients editing DIFFERENT fields of the same element', () => {
    const a = new Y.Doc({ gc: false }); const b = new Y.Doc({ gc: false })
    const ya = a.getArray<El>('elements'); const yb = b.getArray<El>('elements')
    a.transact(() => ya.push([{ id: 'n1', x: 0, color: 'red' }]))
    sync(a, b)
    // concurrent: A moves the node, B recolors it
    commitElementUpdate(a, ya, 'n1', { x: 100 })
    commitElementUpdate(b, yb, 'n1', { color: 'blue' })
    sync(a, b)
    const merged = ya.toArray()
    console.log('A) merged element =', JSON.stringify(merged), 'count =', merged.length)
    expect(merged.length).toBe(1)
  })

  it('B: concurrent text edits (plain string field vs Y.Text)', () => {
    const a = new Y.Doc({ gc: false }); const b = new Y.Doc({ gc: false })
    const ya = a.getArray<El>('elements'); const yb = b.getArray<El>('elements')
    a.transact(() => ya.push([{ id: 'n1', x: 0, color: 'red', text: 'hello world' }]))
    sync(a, b)
    commitElementUpdate(a, ya, 'n1', { text: 'hello world (A)' })
    commitElementUpdate(b, yb, 'n1', { text: 'hello WORLD (B)' })
    sync(a, b)
    console.log('B) text after merge =', JSON.stringify(ya.toArray()[0].text), '| b sees:', JSON.stringify(yb.toArray()[0].text))
    expect(ya.toArray().length).toBe(1)
  })

  it('C: gc:false tombstone growth over 500 drag steps', () => {
    const doc = new Y.Doc({ gc: false })
    const arr = doc.getArray<El>('elements')
    doc.transact(() => arr.push([{ id: 'n1', x: 0, color: 'red' }]))
    const sizes: number[] = []
    for (let i = 1; i <= 500; i++) {
      commitElementUpdate(doc, arr, 'n1', { x: i })
      if (i % 125 === 0) sizes.push(Y.encodeStateAsUpdate(doc).byteLength)
    }
    console.log('C) update bytes after 125/250/375/500 single-field moves =', sizes.join(' -> '))
    const gcDoc = new Y.Doc({ gc: true })
    const gcArr = gcDoc.getArray<El>('elements')
    gcDoc.transact(() => gcArr.push([{ id: 'n1', x: 0, color: 'red' }]))
    for (let i = 1; i <= 500; i++) commitElementUpdate(gcDoc, gcArr, 'n1', { x: i })
    console.log('C) same with gc:true =', Y.encodeStateAsUpdate(gcDoc).byteLength, 'bytes')
    expect(sizes.length).toBe(4)
  })

  it('D: cost of index lookup in commitElementUpdate at 2000 elements', () => {
    const doc = new Y.Doc({ gc: false })
    const arr = doc.getArray<El>('elements')
    const many: El[] = Array.from({ length: 2000 }, (_, i) => ({ id: `n${i}`, x: i, color: 'red' }))
    doc.transact(() => arr.push(many))
    const t0 = performance.now()
    for (let i = 0; i < 60; i++) commitElementUpdate(doc, arr, `n${1000 + i}`, { x: i })
    const dt = performance.now() - t0
    console.log('D) 60 updates on a 2000-element board =', dt.toFixed(1), 'ms (', (dt / 60).toFixed(2), 'ms per update )')
    expect(dt).toBeGreaterThanOrEqual(0)
  })

  it('E: what a Y.Map-per-element schema would do instead', () => {
    const a = new Y.Doc(); const b = new Y.Doc()
    const make = (d: Y.Doc) => {
      const nodes = d.getMap<Y.Map<unknown>>('nodes')
      const n = new Y.Map<unknown>(); n.set('id', 'n1'); n.set('x', 0); n.set('color', 'red')
      const t = new Y.Text('hello world'); n.set('text', t)
      d.transact(() => nodes.set('n1', n))
      return nodes
    }
    const na = make(a); const nb = make(b)
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
    a.transact(() => { na.get('n1')!.set('x', 100) })
    b.transact(() => { nb.get('n1')!.set('color', 'blue') })
    sync(a, b)
    const merged = na.get('n1')!
    console.log('E) merged = x:', merged.get('x'), 'color:', merged.get('color'), '(both kept)')
    // concurrent text
    const a2 = new Y.Doc(); const b2 = new Y.Doc()
    const m2a = make(a2); const m2b = make(b2)
    sync(a2, b2)
    a2.transact(() => { (m2a.get('n1')!.get('text') as Y.Text).insert(5, ' big') })
    b2.transact(() => { (m2b.get('n1')!.get('text') as Y.Text).insert(0, 'Well, ') })
    sync(a2, b2)
    console.log('E) concurrent text merge =', JSON.stringify((m2a.get('n1')!.get('text') as Y.Text).toString()))
    expect(true).toBe(true)
  })
})
