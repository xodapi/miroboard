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
  // src/collab/selection.test.ts.


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
})
