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

  it('starts a marquee under the element-count badge', () => {
    // The badge floats at the top-left of the canvas, exactly where a marquee
    // naturally starts, and it appears only once the board is non-empty — so it
    // could swallow the pointerdown that begins a rubber-band selection. It is a
    // read-out, not a control, and must stay transparent to pointer input.
    placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
    placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })

    const badge = byTestId('element-count')
    expect(badge).not.toBeNull()
    expect(badge!.className).toContain('pointer-events-none')
    expect(badge!.closest('[data-ui]')).toBeNull()

    // A marquee whose start point sits on the badge still selects both elements.
    dragMarquee({ x: 16, y: 62 }, { x: 600, y: 500 })
    expect(byTestId('selection-count')!.textContent).toContain('2')
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

    it('does not commit a flushed drag twice when the pointer is released', async () => {
      const written = stubFileSession('board.mboard', '')
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      key('v')

      const element = container.querySelector('g[data-id]')!
      pointer(element, 'pointerdown', { clientX: 120, clientY: 120 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 300, clientY: 300 })

      // Saving lands the drag. Releasing afterwards recomputes the frame from
      // the release point, so it must agree rather than shift the element on.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 300, clientY: 300 })

      expect(container.querySelector('g[data-id]')!.getAttribute('transform')).toBe('translate(280,280)')
      expect(JSON.parse(written()).nodes[0].frame).toMatchObject({ x: 280, y: 280 })
    })

    it('duplicates from where a dragged element is now, not where it started', () => {
      stubFileSession('board.mboard', '')
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      key('v')

      const element = container.querySelector('g[data-id]')!
      pointer(element, 'pointerdown', { clientX: 120, clientY: 120 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 300, clientY: 300 })
      expect(container.querySelector('g[data-id]')!.getAttribute('transform')).toBe('translate(280,280)')

      key('d', { ctrlKey: true })

      // The copy is offset from the source. Without flushing the gesture the
      // source is still at its pre-drag position in the document, so the copy
      // landed at (120,120) — beside a rectangle the user had already dragged
      // away from.
      const placed = [...container.querySelectorAll('g[data-id]')].map(g => g.getAttribute('transform'))
      expect(placed).toEqual(['translate(280,280)', 'translate(300,300)'])
    })

    it('saves what is on screen when a drag is still in progress', async () => {
      const written = stubFileSession('board.mboard', '')
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      key('v')

      // Begin a drag and move, but never release: the new position lives only
      // in transientFrame until pointerup commits it to the document.
      const element = container.querySelector('g[data-id]')!
      pointer(element, 'pointerdown', { clientX: 120, clientY: 120 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 300, clientY: 300 })
      expect(container.querySelector('g[data-id]')!.getAttribute('transform')).toBe('translate(280,280)')

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })

      // Ctrl+S serialises the document, so an uncommitted drag would be saved
      // at the position the user had already dragged away from.
      const saved = JSON.parse(written())
      const frame = saved.nodes[0].frame
      expect([frame.x, frame.y]).toEqual([280, 280])
    })

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

    /**
     * The regression that six cross-* suites caught and jsdom did not: all of
     * them load an educational example before saving. Loading one calls
     * setArrivalClasses/setRolePolicies, which feed simulationProfile, which
     * drives the effect that writes profileConfig back into the document. That
     * write lands after the save completes and re-dirties a document the user
     * just saved.
     *
     * The hydration guard is what suppresses the echo, and it recognises a
     * document-borne config by its transaction origin.
     *
     * Honest caveat: this test passes with the bug still in place. jsdom runs
     * the whole flow synchronously enough that the echoing write lands before
     * the save rather than after it, which is exactly why six browser suites
     * caught this and the unit suite did not. It is kept as a cheap guard on
     * the flow, not as proof of the fix — the proof is the cross-* suites.
     */
    it('stays clean after saving a document loaded from an example', async () => {
      act(() => {
        [...container.querySelectorAll('button')]
          .find(button => button.getAttribute('title') === 'Учебные BPMN-примеры')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      act(() => {
        [...container.querySelectorAll('button')]
          .find(button => button.textContent?.includes('Загрузить'))!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await flush()
      expect(container.querySelectorAll('[data-id]').length).toBeGreaterThan(0)

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      await flush()
      // Let every queued effect — including the profileConfig echo — settle.
      await flush()
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

  describe('search list and resize alignment', () => {
    function placeSticky(at: { x: number; y: number }) {
      key('s')
      pointer(byTestId('canvas')!, 'pointerdown', { clientX: at.x, clientY: at.y })
      const field = container.querySelector<HTMLTextAreaElement>('[data-testid="element-text-input"]')
      // React listens for focusout, not a synthetic blur, so call the real method.
      if (field) act(() => { field.blur() })
    }

    it('lists search hits and jumps to the one that was clicked', () => {
      placeSticky({ x: 200, y: 200 })
      placeSticky({ x: 800, y: 700 })
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(2)

      key('f', { ctrlKey: true })
      const input = container.querySelector('[data-testid="board-search"] input') as HTMLInputElement
      expect(input).not.toBeNull()
      act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Заметка')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })

      const rows = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="search-result"]')]
      expect(rows).toHaveLength(2)
      expect(rows[0].getAttribute('aria-current')).toBe('true')

      const before = container.querySelector('svg > g')?.getAttribute('transform')
      act(() => { rows[1].click() })
      expect(rows[1].isConnected ? container.querySelectorAll('[data-testid="search-result"]')[1].getAttribute('aria-current') : null).toBe('true')
      expect(container.querySelector('svg > g')?.getAttribute('transform')).not.toBe(before)
      expect(byTestId('search-hit')).not.toBeNull()
    })

    it('snaps a resize edge to a neighbour instead of stopping where the pointer was', () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
      key('v')
      const first = container.querySelector('g[data-id]')!
      pointer(first, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(first, 'pointerup', { clientX: 110, clientY: 110 })

      const handle = container.querySelector('[data-resize="se"]')!
      expect(handle).not.toBeNull()
      pointer(handle, 'pointerdown', { clientX: 200, clientY: 160 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 398, clientY: 160 })
      expect(byTestId('align-guide')).not.toBeNull()
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 398, clientY: 160 })

      // Right edge lands on the neighbour's left edge (400), not at the pointer (398).
      const shape = first.querySelector('rect')!
      expect(shape.getAttribute('width')).toBe('300')
      expect(byTestId('align-guide')).toBeNull()
    })

    it('resizes a rectangle from the north-west corner, and a circle the same way', () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      key('v')
      const rect = container.querySelector('g[data-id]')!
      pointer(rect, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(rect, 'pointerup', { clientX: 110, clientY: 110 })
      expect([...container.querySelectorAll('[data-resize]')].map(grip => grip.getAttribute('data-resize'))).toEqual(['nw', 'ne', 'sw', 'se'])

      const handle = container.querySelector('[data-resize="nw"]')!
      pointer(handle, 'pointerdown', { clientX: 100, clientY: 100 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 70, clientY: 80 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 70, clientY: 80 })
      expect(rect.getAttribute('transform')).toBe('translate(70,80)')
      expect(rect.querySelector('rect')!.getAttribute('width')).toBe('130')
      expect(rect.querySelector('rect')!.getAttribute('height')).toBe('80')

      key('o')
      pointer(byTestId('canvas')!, 'pointerdown', { clientX: 400, clientY: 300 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 500, clientY: 360 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 500, clientY: 360 })
      key('v')
      const circle = container.querySelectorAll('g[data-id]')[1]!
      pointer(circle, 'pointerdown', { clientX: 420, clientY: 320 })
      pointer(circle, 'pointerup', { clientX: 420, clientY: 320 })
      expect([...container.querySelectorAll('[data-resize]')].map(grip => grip.getAttribute('data-resize'))).toEqual(['nw', 'ne', 'sw', 'se'])
    })

    it('gives a BPMN task the same four corners', () => {
      const openTemplates = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Начать с шаблона'))!
      act(() => { openTemplates.click() })
      const bpmn = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('BPMN 2.0'))!
      act(() => { bpmn.click() })
      const task = [...container.querySelectorAll('g[data-id]')].find(node => node.textContent?.includes('Выполнить'))!
      pointer(task, 'pointerdown', { clientX: 260, clientY: 180 })
      pointer(task, 'pointerup', { clientX: 260, clientY: 180 })
      expect([...container.querySelectorAll('[data-resize]')].map(grip => grip.getAttribute('data-resize'))).toEqual(['nw', 'ne', 'sw', 'se'])
    })

    it('does not put corner grips on a freeform arrow', () => {
      // Drawing selects the new mark. A corner grip would be on screen without
      // a further click; the stroke is not a box, so there must be none.
      key('a')
      pointer(byTestId('canvas')!, 'pointerdown', { clientX: 100, clientY: 100 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 200, clientY: 160 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 200, clientY: 160 })
      key('v')
      expect(container.querySelector('g[data-id]')).not.toBeNull()
      expect(container.querySelector('[data-resize]')).toBeNull()
    })
  })

  describe('groups', () => {
    function ids(): string[] {
      return [...container.querySelectorAll('g[data-id]')].map(node => (node as HTMLElement).dataset.id!)
    }

    function placeTwo() {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
    }

    it('groups a selection with Ctrl+G and selects the whole group from one click', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })

      key('g', { ctrlKey: true })
      expect(container.textContent).toContain('Сгруппировано')
      expect(byTestId('group-outline')).not.toBeNull()

      key('Escape')
      expect(byTestId('selection-count')).toBeNull()
      expect(byTestId('group-outline')).toBeNull()

      // Click the first rectangle, not a hit-test of the canvas: the second
      // rectangle is far away, so only group membership can pull it in.
      pointer(container.querySelector('g[data-id]')!, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(container.querySelector('g[data-id]')!, 'pointerup', { clientX: 110, clientY: 110 })
      expect(byTestId('selection-count')!.textContent).toContain('2')
      expect(byTestId('group-outline')).not.toBeNull()
      expect(container.querySelector('[data-resize]')).toBeNull()
    })

    it('moves both members when one of them is dragged', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
      key('g', { ctrlKey: true })
      key('Escape')

      const before = transforms()
      const first = container.querySelector('g[data-id]')!
      pointer(first, 'pointerdown', { clientX: 120, clientY: 120 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 170, clientY: 140 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 170, clientY: 140 })

      expect(transforms()).toEqual([shift(before[0], 50, 20), shift(before[1], 50, 20)])
    })

    it('marquee of one member still selects the whole group', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
      key('g', { ctrlKey: true })
      key('Escape')

      dragMarquee({ x: 80, y: 80 }, { x: 220, y: 180 })
      expect(byTestId('selection-count')!.textContent).toContain('2')
      expect(byTestId('group-outline')).not.toBeNull()
    })

    it('deletes the whole group from one selected member', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
      key('g', { ctrlKey: true })
      key('Escape')
      pointer(container.querySelector('g[data-id]')!, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(container.querySelector('g[data-id]')!, 'pointerup', { clientX: 110, clientY: 110 })

      key('Delete')
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(0)
    })

    it('ungroups with Ctrl+Shift+G so the next click selects one object', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
      key('g', { ctrlKey: true })
      key('G', { ctrlKey: true, shiftKey: true, code: 'KeyG' })
      expect(container.textContent).toContain('Группа снята')

      key('Escape')
      pointer(container.querySelector('g[data-id]')!, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(container.querySelector('g[data-id]')!, 'pointerup', { clientX: 110, clientY: 110 })
      expect(byTestId('selection-count')).toBeNull()
      expect(byTestId('group-outline')).toBeNull()
      expect(container.querySelector('[data-resize]')).not.toBeNull()
    })

    it('shift-click removes the whole group, not one member', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
      key('g', { ctrlKey: true })
      expect(byTestId('selection-count')!.textContent).toContain('2')
      expect(byTestId('selection-anchor')).not.toBeNull()
      expect(container.querySelector('[data-resize]')).toBeNull()

      const first = container.querySelector('g[data-id]')!
      pointer(first, 'pointerdown', { clientX: 110, clientY: 110, shiftKey: true })
      pointer(first, 'pointerup', { clientX: 110, clientY: 110, shiftKey: true })

      expect(byTestId('selection-count')).toBeNull()
      expect(byTestId('selection-anchor')).toBeNull()
      expect(container.querySelector('[data-resize]')).toBeNull()
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(2)
    })

    it('still groups when the layout reports a different character for the G key', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
      key('п', { ctrlKey: true, code: 'KeyG' })
      expect(container.textContent).toContain('Сгруппировано')
      expect(byTestId('group-outline')).not.toBeNull()
    })

    it('refuses to group fewer than two objects', () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      pointer(container.querySelector('g[data-id]')!, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(container.querySelector('g[data-id]')!, 'pointerup', { clientX: 110, clientY: 110 })
      key('g', { ctrlKey: true })
      expect(container.textContent).toContain('Для группы нужно хотя бы два объекта')
      expect(byTestId('group-outline')).toBeNull()
    })

    it('gives a duplicated group its own token', () => {
      placeTwo()
      dragMarquee({ x: 5, y: 5 }, { x: 600, y: 500 })
      key('g', { ctrlKey: true })
      key('d', { ctrlKey: true })
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(4)

      // Paste/duplicate offsets by 20, so the copies overlap the sources.
      // Dispatch on the third element rather than hit-testing a point.
      key('Escape')
      const copies = [...container.querySelectorAll('g[data-id]')]
      pointer(copies[2], 'pointerdown', { clientX: 105, clientY: 105 })
      pointer(copies[2], 'pointerup', { clientX: 105, clientY: 105 })
      expect(byTestId('selection-count')!.textContent).toContain('2')

      const before = transforms()
      pointer(copies[2], 'pointerdown', { clientX: 130, clientY: 130 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 180, clientY: 150 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 180, clientY: 150 })
      const after = transforms()
      expect(after[0]).toBe(before[0])
      expect(after[1]).toBe(before[1])
      expect(after[2]).toBe(shift(before[2], 50, 20))
      expect(after[3]).toBe(shift(before[3], 50, 20))
      expect(ids()).toHaveLength(4)
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

  /**
   * A history preview renders `previewElements`, a read-only snapshot, while
   * `elements` still holds the live document. Every mutator refuses to run
   * during a preview, but selection is not a mutation — and Ctrl+A read from
   * the live list, so it selected objects that were not on screen. Ctrl+C then
   * copied them.
   */
  /**
   * Elements can vanish without the user asking: undo, a history restore, a
   * file load — and, once collaboration lands, a peer's delete. Anything
   * holding an element id has to cope.
   */
  describe('stale element references', () => {
    it('closes a context menu whose element was undone away', () => {
      vi.useFakeTimers()
      try {
        placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
        const element = container.querySelector('g[data-id]')!
        key('v') // the long press is a Select-tool gesture

        // A long press opens the menu anchored to that element.
        pointer(element, 'pointerdown', { clientX: 120, clientY: 120 })
        act(() => { vi.advanceTimersByTime(600) })
        expect(byTestId('context-menu')).not.toBeNull()

        // Undo removes the element out from under the open menu.
        key('z', { ctrlKey: true })
        expect(container.querySelectorAll('g[data-id]')).toHaveLength(0)

        // The menu is positioned in world coordinates and its actions are
        // refused by the command layer, so leaving it open would show a live
        // menu over empty canvas whose every item quietly does nothing.
        expect(byTestId('context-menu')).toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('object lock', () => {
    function writtenBySave() {
      let written = ''
      const handle = {
        kind: 'file',
        name: 'board.mboard',
        async createWritable() {
          return { write: async (value: string) => { written = value }, close: async () => undefined }
        },
        async getFile() {
          return { name: 'board.mboard', type: 'application/json', size: written.length, text: async () => written }
        },
      }
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle })
      return () => written
    }

    function lockSelected() {
      const button = byTestId('lock-toggle')
      expect(button?.textContent).toBe('Заблокировать')
      act(() => { button!.click() })
    }

    it('does not move a locked rect by drag or arrow, and saves locked: true', async () => {
      const written = writtenBySave()
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      key('v')
      expect(container.querySelector('[data-resize]')).not.toBeNull()
      expect(byTestId('rotate-handle')).not.toBeNull()

      lockSelected()
      expect(container.textContent).toContain('Заблокировано')
      expect(byTestId('lock-badge')).not.toBeNull()
      expect(byTestId('lock-toggle')!.textContent).toBe('Разблокировать')
      expect(byTestId('lock-toggle')!.getAttribute('aria-pressed')).toBe('true')
      expect(container.querySelector('[data-resize]')).toBeNull()
      expect(byTestId('rotate-handle')).toBeNull()
      const shape = container.querySelector('g[data-id]')!
      expect(shape.getAttribute('class')).toContain('cursor-default')
      expect(shape.getAttribute('class')).not.toContain('cursor-move')

      const before = transforms()
      pointer(shape, 'pointerdown', { clientX: 120, clientY: 120 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 180, clientY: 150 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 180, clientY: 150 })
      key('ArrowRight')
      expect(transforms()).toEqual(before)

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      const saved = JSON.parse(written())
      expect(saved.schemaVersion).toBe(1)
      expect(saved.nodes[0].locked).toBe(true)

      act(() => { byTestId('lock-toggle')!.click() })
      expect(container.textContent).toContain('Разблокировано')
      expect(byTestId('lock-badge')).toBeNull()
      key('ArrowRight')
      expect(transforms()).toEqual([shift(before[0], 1, 0)])
    })

    it('still deletes and erases a locked object', () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      key('v')
      lockSelected()
      key('Delete')
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(0)

      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      key('v')
      lockSelected()
      key('e')
      pointer(container.querySelector('g[data-id]')!, 'pointerdown', { clientX: 120, clientY: 120 })
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(0)
    })
  })

  describe('history preview', () => {
    /** Marks a named checkpoint of the board as it stands. */
    function markSnapshot() {
      vi.spyOn(window, 'prompt').mockReturnValue('точка')
      const more = [...container.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label') === 'Дополнительные инструменты')!
      act(() => { more.click() })
      const mark = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Отметить состояние'))!
      act(() => { mark.click() })
    }

    /** Opens the timeline and previews the most recent checkpoint. */
    function openSnapshot() {
      const openHistory = [...container.querySelectorAll('button')]
        .find(b => b.textContent?.trim() === 'Контрольные точки')!
      act(() => { openHistory.click() })
      const panel = container.querySelector('[aria-label="История доски"]')!
      const entry = panel.querySelector('li button') as HTMLElement
      act(() => { entry.click() })
    }

    /** Marks a checkpoint and immediately previews it. */
    function previewFirstSnapshot() {
      markSnapshot()
      openSnapshot()
    }

    it('does not cover a previewed snapshot with the empty-board prompt', () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      markSnapshot()

      // Empty the live board, then look back at the snapshot that still has it.
      key('v')
      key('a', { ctrlKey: true })
      key('Delete')
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(0)

      openSnapshot()

      // The snapshot's element is on screen, so the "start creating" prompt —
      // and its template button — must not be.
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(1)
      expect(container.textContent).not.toContain('Начните творить')
    })

    it('hides the BPMN validity badge, which describes the live document', () => {
      // The BPMN template creates real bpmnNodeType elements, which is what
      // makes the badge appear at all.
      const openTemplates = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Начать с шаблона'))!
      act(() => { openTemplates.click() })
      const bpmn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('BPMN 2.0'))!
      act(() => { bpmn.click() })
      expect(byTestId('bpmn-status')).not.toBeNull()

      markSnapshot()
      openSnapshot()

      // The badge reports on the live document; the canvas is showing a
      // snapshot. Rather than describe the wrong board, it steps aside — as
      // the simulation summaries beside it already do.
      expect(byTestId('bpmn-status')).toBeNull()
    })

    it('does not let Ctrl+A select the live document while previewing history', () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
      previewFirstSnapshot()

      key('a', { ctrlKey: true })

      // The selection badge is deliberately hidden during a preview, so it
      // cannot show whether a selection exists. Ctrl+C can: it only takes over
      // the shortcut when it has something to copy, so a prevented default
      // means the live document got selected behind the snapshot.
      const copy = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true })
      act(() => { window.dispatchEvent(copy) })
      expect(copy.defaultPrevented).toBe(false)
    })
  })

  describe('freeform follow', () => {
    function translateOf(node: Element): { x: number; y: number } {
      const match = /translate\(([-\d.]+),([-\d.]+)\)/.exec(node.getAttribute('transform') ?? '')
      if (!match) throw new Error(`unexpected transform ${node.getAttribute('transform')}`)
      return { x: Number(match[1]), y: Number(match[2]) }
    }

    function arrowLine(): { group: Element; line: SVGLineElement } {
      const group = [...container.querySelectorAll('g[data-id]')].find(node => node.querySelector('line'))
      const line = group?.querySelector('line')
      if (!group || !line) throw new Error('arrow has no line')
      return { group, line }
    }

    function drawAttachedArrow() {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
      key('a')
      const canvas = byTestId('canvas')!
      pointer(canvas, 'pointerdown', { clientX: 150, clientY: 130 })
      pointer(canvas, 'pointermove', { clientX: 450, clientY: 330 })
      pointer(canvas, 'pointerup', { clientX: 450, clientY: 330 })
      key('v')
    }

    it('follows a moved box, and saves the attachment without becoming a flow', async () => {
      let written = ''
      const handle = {
        kind: 'file',
        name: 'board.mboard',
        async createWritable() {
          return { write: async (value: string) => { written = value }, close: async () => undefined }
        },
        async getFile() {
          return { name: 'board.mboard', type: 'application/json', size: written.length, text: async () => written }
        },
      }
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle })

      drawAttachedArrow()
      const before = arrowLine()
      const start = translateOf(before.group)
      const x2 = Number(before.line.getAttribute('x2'))
      const y2 = Number(before.line.getAttribute('y2'))
      // The stroke meets the outline, not the press point inside the box.
      expect(start.x).not.toBeCloseTo(150, 0)
      expect(before.group.getAttribute('data-testid')).toBeNull()

      const rect = container.querySelector('g[data-id]')!
      pointer(rect, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 80, clientY: 90 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 80, clientY: 90 })

      const after = arrowLine()
      const next = translateOf(after.group)
      const nextX2 = Number(after.line.getAttribute('x2'))
      const nextY2 = Number(after.line.getAttribute('y2'))
      expect(next.x).toBeCloseTo(start.x - 30, 4)
      expect(next.y).toBeCloseTo(start.y - 20, 4)
      expect(nextX2).toBeCloseTo(x2 + 30, 4)
      expect(nextY2).toBeCloseTo(y2 + 20, 4)
      expect(next.x + nextX2).toBeCloseTo(start.x + x2, 4)
      expect(next.y + nextY2).toBeCloseTo(start.y + y2, 4)

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
      })
      const saved = JSON.parse(written)
      const ids = [...container.querySelectorAll('g[data-id]')].map(node => node.getAttribute('data-id'))
      const arrowId = before.group.getAttribute('data-id')
      const arrow = saved.nodes.find((node: { id: string }) => node.id === arrowId)
      expect(saved.schemaVersion).toBe(1)
      expect(saved.edges).toEqual([])
      expect(arrow.content.link).toEqual({ sourceId: ids[0], targetId: ids[1] })
      expect(arrow.profileData?.bpmn).toBeUndefined()
      expect(JSON.stringify(arrow)).not.toContain('bpmnFlow')
    })

    it('undoes the attached draw as one step', async () => {
      placeRect({ x: 100, y: 100 }, { x: 200, y: 160 })
      placeRect({ x: 400, y: 300 }, { x: 500, y: 360 })
      // Past the undo capture window, so the boxes are not part of the draw.
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)) })
      key('a')
      const canvas = byTestId('canvas')!
      pointer(canvas, 'pointerdown', { clientX: 150, clientY: 130 })
      pointer(canvas, 'pointermove', { clientX: 450, clientY: 330 })
      pointer(canvas, 'pointerup', { clientX: 450, clientY: 330 })
      expect(translateOf(arrowLine().group).x).not.toBeCloseTo(150, 0)
      key('z', { ctrlKey: true })
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(2)
      expect(container.querySelector('line')).toBeNull()
    })

    it('bends a straight arrow from the midpoint, and a click does not', () => {
      key('a')
      const canvas = byTestId('canvas')!
      pointer(canvas, 'pointerdown', { clientX: 100, clientY: 100 })
      pointer(canvas, 'pointermove', { clientX: 300, clientY: 100 })
      pointer(canvas, 'pointerup', { clientX: 300, clientY: 100 })
      key('v')
      const group = container.querySelector('g[data-id]')!
      expect(group.querySelector('line')).not.toBeNull()
      expect(group.querySelector('polyline')).toBeNull()
      const grip = group.querySelector('[data-bend="0"]')!
      expect(grip).not.toBeNull()

      pointer(grip, 'pointerdown', { clientX: 200, clientY: 100 })
      pointer(canvas, 'pointerup', { clientX: 200, clientY: 100 })
      expect(group.querySelector('[data-waypoint]')).toBeNull()
      expect(group.querySelector('polyline')).toBeNull()

      pointer(grip, 'pointerdown', { clientX: 200, clientY: 100 })
      pointer(canvas, 'pointermove', { clientX: 200, clientY: 160 })
      pointer(canvas, 'pointerup', { clientX: 200, clientY: 160 })
      const routed = container.querySelector('g[data-id]')!
      expect(routed.querySelector('line')).toBeNull()
      expect(routed.querySelector('polyline')!.getAttribute('points')).toBe('0,0 100,60 200,0')
      expect(routed.getAttribute('transform')).toBe('translate(100,100)')

      const local = routed.querySelector('polyline')!.getAttribute('points')
      pointer(routed, 'pointerdown', { clientX: 120, clientY: 100 })
      pointer(canvas, 'pointermove', { clientX: 150, clientY: 110 })
      pointer(canvas, 'pointerup', { clientX: 150, clientY: 110 })
      expect(routed.getAttribute('transform')).toBe('translate(130,110)')
      expect(routed.querySelector('polyline')!.getAttribute('points')).toBe(local)

      const waypoint = routed.querySelector('[data-waypoint="0"]')!
      pointer(waypoint, 'pointerdown', { clientX: 230, clientY: 170, detail: 2 })
      pointer(canvas, 'pointerup', { clientX: 230, clientY: 170, detail: 2 })
      const straight = container.querySelector('g[data-id]')!
      expect(straight.querySelector('[data-waypoint]')).toBeNull()
      expect(straight.querySelector('polyline')).toBeNull()
      expect(straight.querySelector('line')).not.toBeNull()
      expect(container.querySelector('[data-testid="element-text-input"]')).toBeNull()
    })

    it('captions an arrow from a double-click and keeps the shift when the arrow moves', () => {
      key('a')
      const canvas = byTestId('canvas')!
      pointer(canvas, 'pointerdown', { clientX: 100, clientY: 100 })
      pointer(canvas, 'pointermove', { clientX: 300, clientY: 100 })
      pointer(canvas, 'pointerup', { clientX: 300, clientY: 100 })
      key('v')
      const group = container.querySelector('g[data-id]')!
      act(() => {
        group.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      const input = container.querySelector<HTMLInputElement>('[data-testid="element-text-input"]')
      expect(input).not.toBeNull()
      act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'если да')
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        input!.blur()
      })
      const label = container.querySelector('[data-testid="line-label"]')!
      expect(label.textContent).toContain('если да')
      expect(label.getAttribute('transform')).toBe('translate(100,0)')

      pointer(label, 'pointerdown', { clientX: 200, clientY: 100 })
      pointer(canvas, 'pointerup', { clientX: 200, clientY: 100 })
      expect(container.querySelector('[data-waypoint]')).toBeNull()

      pointer(label, 'pointerdown', { clientX: 200, clientY: 100 })
      pointer(canvas, 'pointermove', { clientX: 200, clientY: 140 })
      pointer(canvas, 'pointerup', { clientX: 200, clientY: 140 })
      expect(container.querySelector('[data-testid="line-label"]')!.getAttribute('transform')).toBe('translate(100,40)')
      expect(container.querySelector('g[data-id]')!.getAttribute('transform')).toBe('translate(100,100)')

      pointer(container.querySelector('g[data-id]')!, 'pointerdown', { clientX: 120, clientY: 100 })
      pointer(canvas, 'pointermove', { clientX: 150, clientY: 110 })
      pointer(canvas, 'pointerup', { clientX: 150, clientY: 110 })
      expect(container.querySelector('[data-testid="line-label"]')!.getAttribute('transform')).toBe('translate(100,40)')
      expect(container.querySelector('g[data-id]')!.getAttribute('transform')).toBe('translate(130,110)')

      act(() => {
        container.querySelector('[data-label]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
      })
      const again = container.querySelector<HTMLInputElement>('[data-testid="element-text-input"]')
      expect(again).not.toBeNull()
      act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(again, '   ')
        again!.dispatchEvent(new Event('input', { bubbles: true }))
        again!.blur()
      })
      expect(container.querySelector('[data-testid="line-label"]')).toBeNull()
    })

    it('edits a locked arrow caption and does not drag it', () => {
      key('a')
      const canvas = byTestId('canvas')!
      pointer(canvas, 'pointerdown', { clientX: 40, clientY: 40 })
      pointer(canvas, 'pointermove', { clientX: 140, clientY: 40 })
      pointer(canvas, 'pointerup', { clientX: 140, clientY: 40 })
      key('v')
      const group = container.querySelector('g[data-id]')!
      act(() => { group.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })) })
      const input = container.querySelector<HTMLInputElement>('[data-testid="element-text-input"]')!
      act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'нет')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.blur()
      })
      act(() => { byTestId('lock-toggle')!.click() })
      const label = container.querySelector('[data-testid="line-label"]')!
      const before = label.getAttribute('transform')
      pointer(label, 'pointerdown', { clientX: 90, clientY: 40 })
      pointer(canvas, 'pointermove', { clientX: 90, clientY: 80 })
      pointer(canvas, 'pointerup', { clientX: 90, clientY: 80 })
      expect(container.querySelector('[data-testid="line-label"]')!.getAttribute('transform')).toBe(before)
      act(() => { label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })) })
      expect(container.querySelector('[data-testid="element-text-input"]')).not.toBeNull()
    })

    it('does not offer a bend grip on a locked arrow', () => {
      key('a')
      pointer(byTestId('canvas')!, 'pointerdown', { clientX: 40, clientY: 40 })
      pointer(byTestId('canvas')!, 'pointermove', { clientX: 80, clientY: 40 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 80, clientY: 40 })
      key('v')
      expect(container.querySelector('[data-bend]')).not.toBeNull()
      act(() => { byTestId('lock-toggle')!.click() })
      expect(container.querySelector('[data-bend]')).toBeNull()
    })

    it('offers a bend grip on a selected connector and no corner grips', () => {
      const openTemplates = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Начать с шаблона'))!
      act(() => { openTemplates.click() })
      const bpmn = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('BPMN 2.0'))!
      act(() => { bpmn.click() })
      const flow = container.querySelector('[data-testid^="bpmn-flow-"]')!
      pointer(flow, 'pointerdown', { clientX: 200, clientY: 208 })
      pointer(flow, 'pointerup', { clientX: 200, clientY: 208 })
      expect(container.querySelector('[data-testid^="bpmn-flow-"] [data-bend]')).not.toBeNull()
      expect(container.querySelector('[data-resize]')).toBeNull()
    })

    it('leaves the arrow when its box is deleted', () => {
      drawAttachedArrow()
      const frozen = arrowLine()
      const at = translateOf(frozen.group)
      const rect = container.querySelector('g[data-id]')!
      pointer(rect, 'pointerdown', { clientX: 110, clientY: 110 })
      pointer(byTestId('canvas')!, 'pointerup', { clientX: 110, clientY: 110 })
      key('Delete')
      expect(container.querySelectorAll('g[data-id]')).toHaveLength(2)
      const kept = arrowLine()
      expect(translateOf(kept.group).x).toBeCloseTo(at.x, 4)
      expect(translateOf(kept.group).y).toBeCloseTo(at.y, 4)
      expect(kept.group.getAttribute('data-testid')).toBeNull()
    })
  })
})
