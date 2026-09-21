import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasBackground } from './CanvasBackground'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

function render(snapGrid: boolean, transform = { x: 0, y: 0, scale: 1 }, dark = false) {
  act(() => {
    root.render(
      <svg>
        <CanvasBackground dark={dark} snapGrid={snapGrid} transform={transform} />
      </svg>,
    )
  })
}

describe('CanvasBackground', () => {
  it('defines every pattern it references', () => {
    // A rect filled with url(#missing) renders as a silent black block, so the
    // defs and the rects have to stay in lockstep.
    render(true)
    const referenced = [...container.querySelectorAll('rect')]
      .map(rect => rect.getAttribute('fill') ?? '')
      .filter(fill => fill.startsWith('url(#'))
      .map(fill => fill.slice(5, -1))
    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) {
      expect(container.querySelector(`pattern#${id}`), `pattern #${id} is referenced but not defined`).not.toBeNull()
    }
  })

  it('adds the ruled grid only when snapping is on', () => {
    render(false)
    expect(container.querySelector('pattern#snap-grid')).toBeNull()
    expect(container.querySelector('rect[fill="url(#snap-grid)"]')).toBeNull()

    render(true)
    expect(container.querySelector('pattern#snap-grid')).not.toBeNull()
    expect(container.querySelector('rect[fill="url(#snap-grid)"]')).not.toBeNull()
  })

  it('emphasises the dot grid when snapping makes it meaningful', () => {
    render(false)
    const loose = container.querySelector('pattern#grid circle')!.getAttribute('r')
    render(true)
    const snapped = container.querySelector('pattern#grid circle')!.getAttribute('r')
    expect(Number(snapped)).toBeGreaterThan(Number(loose))
  })

  it('pans and zooms the patterns instead of redrawing them', () => {
    // This is what keeps the background free at any element count: the browser
    // transforms the tile rather than React emitting more nodes.
    render(false, { x: 120, y: -40, scale: 2.5 })
    for (const id of ['grid', 'grid-large']) {
      expect(container.querySelector(`pattern#${id}`)!.getAttribute('patternTransform'))
        .toBe('translate(120,-40) scale(2.5)')
    }
  })

  it('inks the grid for the active theme', () => {
    render(false, { x: 0, y: 0, scale: 1 }, false)
    expect(container.querySelector('pattern#grid circle')!.getAttribute('fill')).toBe('#000')
    render(false, { x: 0, y: 0, scale: 1 }, true)
    expect(container.querySelector('pattern#grid circle')!.getAttribute('fill')).toBe('#fff')
  })
})
