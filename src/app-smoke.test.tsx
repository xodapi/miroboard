/**
 * Browser-shaped smoke test for the whole App.
 *
 * The repo's interaction coverage lives in Playwright, but this suite runs in
 * jsdom so the wiring that unit tests cannot see — pointer handlers, keyboard
 * shortcuts, the selection lifecycle, the profile panel — is verified on every
 * `npm test` instead of only in CI with a browser.
 *
 * The Rust/WASM core is stubbed: this file tests the shell, not the engine.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./wasm/board-core/board_core', () => ({
  clamp_scale: (value: number) => Math.min(Math.max(value, 0.1), 8),
  snap_to_grid: (value: number, grid: number) => Math.round(value / grid) * grid,
  validate_bpmn: () => JSON.stringify({ issues: [] }),
  run_bpmn: () => JSON.stringify({}),
  simulate_bpmn: () => JSON.stringify({}),
  simulate_bpmn_seed_string: () => JSON.stringify({}),
  export_bpmn_xml: () => '',
  import_bpmn_xml: () => JSON.stringify({ nodes: [], flows: [] }),
}))

import App from './App'
import { PROFILE_STORAGE_KEY } from './collab/user-profile'

let container: HTMLDivElement
let root: Root

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root.render(<App />) })
}

async function remount() {
  await act(async () => { root.unmount() })
  container.remove()
  mount()
}

function q(selector: string): Element | null {
  return container.querySelector(selector)
}

function byTestId(id: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
}

function key(k: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
  })
}

function pointer(el: Element, type: string, init: PointerEventInit = {}) {
  act(() => {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse', ...init }))
  })
}

/**
 * Drag out a rectangle. Rects are used instead of stickies because creating a
 * sticky immediately opens its text editor, and an open editor swallows tool
 * hotkeys (by design — see the `editingText` guard in the keydown handler).
 */
function placeRect(from: { x: number; y: number }, to: { x: number; y: number }) {
  key('r')
  const canvas = byTestId('canvas')!
  pointer(canvas, 'pointerdown', { clientX: from.x, clientY: from.y })
  pointer(canvas, 'pointermove', { clientX: to.x, clientY: to.y })
  pointer(canvas, 'pointerup', { clientX: to.x, clientY: to.y })
}

/** World positions of every element, in render order. */
function transforms(): string[] {
  return [...container.querySelectorAll('g[data-id]')].map(g => g.getAttribute('transform') ?? '')
}

function shift(transform: string, dx: number, dy: number): string {
  const match = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(transform)
  if (!match) throw new Error(`unexpected transform ${transform}`)
  return `translate(${Number(match[1]) + dx},${Number(match[2]) + dy})`
}

function dragMarquee(from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  // Drawing tools stay armed after they create an element, so a marquee always
  // starts by switching back to Select — exactly what a user does.
  key('v')
  const canvas = byTestId('canvas')!
  pointer(canvas, 'pointerdown', { clientX: from.x, clientY: from.y, shiftKey: shift })
  pointer(canvas, 'pointermove', { clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2, shiftKey: shift })
  pointer(canvas, 'pointermove', { clientX: to.x, clientY: to.y, shiftKey: shift })
  pointer(canvas, 'pointerup', { clientX: to.x, clientY: to.y, shiftKey: shift })
}

beforeEach(() => {
  localStorage.clear()
  // Skip the onboarding tour so the canvas is directly interactive.
  localStorage.setItem('miro-onboarding-seen', '1')
  document.body.innerHTML = ''
  mount()
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
})

describe('App smoke', () => {
  it('renders the canvas, the toolbar and the participant profile', () => {
    expect(byTestId('canvas')).not.toBeNull()
    expect(byTestId('profile-button')).not.toBeNull()
    expect(q('svg')).not.toBeNull()
  })

  it('creates elements with the tool hotkeys', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
    expect(container.querySelectorAll('[data-id]').length).toBe(2)
  })

  it('selects one element on click and clears on Escape', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    const element = container.querySelector('[data-id]')!
    pointer(element, 'pointerdown', { clientX: 110, clientY: 110 })
    pointer(element, 'pointerup', { clientX: 110, clientY: 110 })
    expect(byTestId('selection-count')).toBeNull() // single selection has no badge

    key('Escape')
    expect(byTestId('selection-count')).toBeNull()
  })

  it('marquee-selects several elements and reports the count', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
    expect(byTestId('selection-count')).toBeNull()

    // The drag starts on empty canvas: (5,5) is outside both rects.
    dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })

    const badge = byTestId('selection-count')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toContain('2')
  })

  it('deletes the whole selection with one Delete press', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
    placeRect({ x: 900, y: 900 }, { x: 950, y: 950 })

    dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
    expect(byTestId('selection-count')!.textContent).toContain('2')

    key('Delete')
    expect(container.querySelectorAll('[data-id]').length).toBe(1)
    expect(byTestId('selection-count')).toBeNull()
  })

  it('extends the selection with a Shift marquee', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 900, y: 900 }, { x: 950, y: 950 })

    dragMarquee({ x: 5, y: 5 }, { x: 300, y: 300 })
    expect(byTestId('selection-count')).toBeNull() // one element: no badge

    dragMarquee({ x: 800, y: 800 }, { x: 1000, y: 1000 }, true)
    expect(byTestId('selection-count')!.textContent).toContain('2')
  })

  it('moves the whole selection as one group', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
    dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
    expect(byTestId('selection-count')!.textContent).toContain('2')

    const before = transforms()
    const first = container.querySelector('g[data-id]')!
    pointer(first, 'pointerdown', { clientX: 120, clientY: 120 })
    pointer(first, 'pointermove', { clientX: 170, clientY: 140 })
    pointer(first, 'pointerup', { clientX: 170, clientY: 140 })

    expect(transforms()).toEqual([shift(before[0], 50, 20), shift(before[1], 50, 20)])
  })

  // The two tests below are the reason gesture geometry lives in
  // src/board/gesture.ts. Both dispatch pointerdown and pointerup with nothing
  // in between, which is what a flick is: React has rendered nothing since the
  // press, so a handler that finishes the gesture from state would use the
  // geometry captured at pointerdown — a zero-size marquee that selects nothing,
  // and no drag frame at all.
  it('finishes a flicked marquee that never rendered an intermediate move', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })

    key('v')
    const canvas = byTestId('canvas')!
    pointer(canvas, 'pointerdown', { clientX: 5, clientY: 5 })
    pointer(canvas, 'pointerup', { clientX: 600, clientY: 500 })

    expect(byTestId('selection-count')!.textContent).toContain('2')
  })

  it('finishes a flicked group drag at the release point', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
    dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
    expect(byTestId('selection-count')!.textContent).toContain('2')

    const before = transforms()
    const first = container.querySelector('g[data-id]')!
    pointer(first, 'pointerdown', { clientX: 120, clientY: 120 })
    pointer(first, 'pointerup', { clientX: 170, clientY: 140 })

    expect(transforms()).toEqual([shift(before[0], 50, 20), shift(before[1], 50, 20)])
  })

  it('clears a multi-selection on Escape', () => {
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
    dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
    expect(byTestId('selection-count')).not.toBeNull()

    key('Escape')
    expect(byTestId('selection-count')).toBeNull()
    expect(container.querySelectorAll('[data-id]').length).toBe(2) // nothing deleted
  })

  // Undo of a bulk delete is asserted in the browser suite
  // (tests/multi-select.spec.ts): Yjs' UndoManager relies on real timers, which
  // this jsdom harness cannot drive faithfully. The invariant that makes it one
  // undo step — a single Yjs transaction — is unit-tested in
  // src/collab/bulk-operations.test.ts.


  it('edits and persists the participant profile', async () => {
    act(() => { byTestId('profile-button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const panel = byTestId('profile-panel')
    expect(panel).not.toBeNull()

    const input = byTestId('profile-name-input') as HTMLInputElement
    act(() => {
      // React tracks controlled inputs through the native value setter.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Алиса')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(byTestId('profile-panel')!.textContent).toContain('Алиса')

    const stored = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!)
    expect(stored.name).toBe('Алиса')
    expect(stored.color).toMatch(/^#/)

    await remount()
    expect(byTestId('profile-button')!.getAttribute('title')).toContain('Алиса')
  })

  it('keeps the profile author id stable across a reload', async () => {
    const before = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!)
    await remount()
    const after = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)!)
    expect(after.id).toBe(before.id)
    expect(after.color).toBe(before.color)
  })

  describe('dirty state and saving', () => {
    function status(): string | null {
      return container.querySelector('[role="status"]')?.textContent ?? null
    }

    /** File operations run through a queue, so a macrotask has to pass before their effects are visible. */
    async function flush() {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    }

    /**
     * The four cross-* e2e specs that went red all follow the same shape: open a
     * saved document, then save it again and expect the toolbar to read
     * "Сохранено". Reproduced here without a browser.
     */
    function stubFileSession(fileName: string, contents: string) {
      let written = ''
      const handle = {
        kind: 'file',
        name: fileName,
        async createWritable() {
          return { write: async (value: string) => { written = value }, close: async () => undefined }
        },
        async getFile() {
          return { name: fileName, type: 'application/json', size: contents.length, text: async () => contents }
        },
      }
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle })
      Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle] })
      return () => written
    }

    /**
     * The cross-* specs save a live document and then reopen the saved file,
     * which carries `history.yjsState`. Reopening such a file takes the
     * `Y.applyUpdate(..., RECOVERY_ORIGIN)` branch nested inside the LOAD
     * transaction of applyOpenOutcome — the path the four failing e2e specs
     * exercise and the one a fixture without yjsState never reaches.
     */
    it('reopens a saved document with a clean dirty state', async () => {
      const fixture = readFileSync(resolve('examples', 'freeform-board.mboard'), 'utf8')
      let written = stubFileSession('freeform-board.mboard', fixture)

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      await flush()
      expect(container.querySelectorAll('[data-id]').length).toBeGreaterThan(0)
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      await flush()
      const saved = written()
      expect(saved.length).toBeGreaterThan(0)
      expect(JSON.parse(saved).history.yjsState).toBeTruthy()
      expect(status()).toBe('Сохранено')

      // Reopen exactly what was written, the way the e2e specs do. Opening is
      // labelled LOAD, which must not report unsaved changes.
      //
      // Only the dirty state is asserted here: rendering a document restored
      // from `history.yjsState` yields no elements under jsdom, and it does so
      // identically on the base commit, so that part is a limitation of this
      // harness rather than behaviour. The browser path is covered by the
      // cross-* e2e suites.
      written = stubFileSession('freeform-board.mboard', saved)
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      await flush()
      expect(status()).toBe('Сохранено')
    })

    it('keeps a reopened document clean after saving it again', async () => {
      const fixture = readFileSync(resolve('examples', 'freeform-board.mboard'), 'utf8')
      const written = stubFileSession('freeform-board.mboard', fixture)

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      await flush()
      expect(container.querySelectorAll('[data-id]').length).toBeGreaterThan(0)
      expect(status()).toBe('Сохранено')

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      await flush()
      expect(written().length).toBeGreaterThan(0)
      expect(status()).toBe('Сохранено')
    })

    it('marks the document dirty after an edit and clean after a save', async () => {
      // The File System Access API is absent in jsdom, so saveDocument() takes
      // its download branch — which also reports { kind: 'saved' }, exactly the
      // path the e2e suites exercise through a stubbed showSaveFilePicker.
      expect(status()).toBe('Сохранено')

      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      expect(status()).toBe('Не сохранено')

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      await flush()
      expect(status()).toBe('Сохранено')
    })
  })

  describe('clipboard', () => {
    /** Ctrl+V awaits the (usually unavailable) system clipboard, so it needs an async act. */
    async function keyAsync(k: string, init: KeyboardEventInit = {}) {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
      })
    }

    function ids(): string[] {
      return [...container.querySelectorAll('g[data-id]')].map(node => (node as HTMLElement).dataset.id!)
    }

    function selectAll() {
      key('v')
      key('a', { ctrlKey: true })
    }

    it('copies the selection with Ctrl+C and pastes it back under new ids', async () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
      const before = ids()
      selectAll()

      key('c', { ctrlKey: true })
      await keyAsync('v', { ctrlKey: true })

      const after = ids()
      expect(after).toHaveLength(4)
      expect(after.slice(0, 2)).toEqual(before) // the sources are untouched
      expect(after.slice(2).every(id => !before.includes(id))).toBe(true)
      expect(new Set(after.slice(2)).size).toBe(2) // and the copies are distinct
      expect(byTestId('selection-count')!.textContent).toContain('2') // the paste is what ends up selected
    })

    it('offsets pasted copies so they do not land exactly on their source', async () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      selectAll()
      const source = transforms()[0]

      key('c', { ctrlKey: true })
      await keyAsync('v', { ctrlKey: true })

      expect(transforms()).toEqual([source, shift(source, 20, 20)])
    })

    it('cuts with Ctrl+X: the board empties but the clipboard keeps the content', async () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
      selectAll()

      key('x', { ctrlKey: true })
      expect(ids()).toHaveLength(0)

      await keyAsync('v', { ctrlKey: true })
      expect(ids()).toHaveLength(2)
    })

    it('pasting with nothing of ours on the clipboard changes nothing and says so', async () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      const before = transforms()

      await keyAsync('v', { ctrlKey: true })

      expect(transforms()).toEqual(before)
      expect(container.textContent).toContain('В буфере обмена нет объектов miroboard')
    })

    it('leaves native copying alone when nothing is selected', () => {
      const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true })
      act(() => { window.dispatchEvent(event) })
      expect(event.defaultPrevented).toBe(false)
    })
  })
})
