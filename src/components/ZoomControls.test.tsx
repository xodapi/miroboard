import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZoomControls, ElementCount } from './ZoomControls'
import { createTheme } from '../board/theme'

let container: HTMLDivElement
let root: Root
const theme = createTheme(false)

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

describe('ZoomControls', () => {
  function render(scale = 1) {
    const spies = { onZoomIn: vi.fn(), onZoomOut: vi.fn(), onFitToContent: vi.fn() }
    act(() => { root.render(<ZoomControls theme={theme} scale={scale} {...spies} />) })
    return spies
  }

  it('reports the zoom level as a whole percentage', () => {
    render(1)
    expect(container.querySelector('[data-testid="zoom-level"]')!.textContent).toBe('100%')
    // Scales arrive as floats from pinch and wheel gestures; a raw value would
    // read "83.33333333333334%".
    render(0.8333333)
    expect(container.querySelector('[data-testid="zoom-level"]')!.textContent).toBe('83%')
  })

  it('wires all three controls', () => {
    const spies = render()
    act(() => { byLabel('Увеличить').click() })
    act(() => { byLabel('Уменьшить').click() })
    act(() => { byLabel('Подогнать содержимое').click() })
    expect(spies.onZoomIn).toHaveBeenCalledTimes(1)
    expect(spies.onZoomOut).toHaveBeenCalledTimes(1)
    expect(spies.onFitToContent).toHaveBeenCalledTimes(1)
  })

  it('labels its icon-only buttons', () => {
    // Three indistinguishable glyph buttons; only "fit" had a title before.
    render()
    for (const label of ['Увеличить', 'Уменьшить', 'Подогнать содержимое']) {
      expect(byLabel(label), `missing aria-label ${label}`).not.toBeNull()
    }
  })
})

describe('ElementCount', () => {
  it('ignores the pointer so a marquee can start under it', () => {
    // The badge floats over the top-left of the canvas, exactly where a rubber
    // band selection naturally begins. It swallowed the pointerdown once
    // already, and the marquee silently stopped working.
    act(() => { root.render(<ElementCount theme={theme} count={3} />) })
    expect(container.querySelector('[data-testid="element-count"]')!.className).toContain('pointer-events-none')
  })

  it('reports the count', () => {
    act(() => { root.render(<ElementCount theme={theme} count={12} />) })
    expect(container.querySelector('[data-testid="element-count"]')!.textContent).toBe('12 элем.')
  })
})
