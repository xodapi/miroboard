import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChangedInPreview, ResizeHandles, SelectionOutline } from './element-chrome'

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

const render = (node: React.ReactNode) => act(() => { root.render(<svg>{node}</svg>) })

describe('ChangedInPreview', () => {
  it('counteracts the viewport scale so the outline stays a constant width', () => {
    // At 4x zoom an un-scaled 3px stroke renders 12px thick and swamps the
    // element it is meant to annotate.
    render(<ChangedInPreview invScale={0.25} x={0} y={0} width={10} height={10} radius={6} />)
    const rect = container.querySelector('[data-testid="changed-in-preview"]')!
    expect(rect.getAttribute('stroke-width')).toBe('0.75')
    expect(rect.getAttribute('stroke-dasharray')).toBe('1.5')
  })

  it('follows the radius of the shape it surrounds', () => {
    render(<ChangedInPreview invScale={1} x={0} y={0} width={10} height={10} radius={14} />)
    expect(container.querySelector('[data-testid="changed-in-preview"]')!.getAttribute('rx')).toBe('14')
  })

  it('never fills, so it cannot hide the element underneath', () => {
    render(<ChangedInPreview invScale={1} x={0} y={0} width={10} height={10} radius={6} />)
    expect(container.querySelector('[data-testid="changed-in-preview"]')!.getAttribute('fill')).toBe('none')
  })
})

describe('SelectionOutline', () => {
  it('scales its stroke with the viewport too', () => {
    render(<SelectionOutline invScale={0.5} x={0} y={0} width={10} height={10} radius={4} />)
    expect(container.querySelector('[data-testid="selection-outline"]')!.getAttribute('stroke-width')).toBe('1')
  })

  it('is solid by default and dashed on request', () => {
    render(<SelectionOutline invScale={1} x={0} y={0} width={10} height={10} radius={4} />)
    expect(container.querySelector('[data-testid="selection-outline"]')!.getAttribute('stroke-dasharray')).toBeNull()

    render(<SelectionOutline invScale={1} x={0} y={0} width={10} height={10} radius={4} dashed />)
    expect(container.querySelector('[data-testid="selection-outline"]')!.getAttribute('stroke-dasharray')).toBe('4')
  })
})

describe('ResizeHandles', () => {
  it('places one grip at each corner', () => {
    render(<ResizeHandles invScale={1} width={100} height={60} />)
    const grips = [...container.querySelectorAll('[data-resize]')]
      .map(grip => [grip.getAttribute('data-resize'), grip.getAttribute('cx'), grip.getAttribute('cy')])
    expect(grips).toEqual([
      ['nw', '-6', '-6'],
      ['ne', '98', '-6'],
      ['sw', '-6', '58'],
      ['se', '98', '58'],
    ])
  })

  it('keeps the grips a constant size on screen', () => {
    // Grips are a touch target. At 5x zoom an un-scaled r=7 would be a 70px
    // blob; zoomed out it would shrink until it could not be hit.
    render(<ResizeHandles invScale={0.2} width={100} height={60} />)
    for (const grip of container.querySelectorAll('[data-resize]')) {
      expect(Number(grip.getAttribute('r'))).toBeCloseTo(1.4)
    }
  })

  it('carries the data-resize attribute the pointer handler dispatches on', () => {
    // handlePointerDown does target.closest('[data-resize]') and reads the
    // corner id from it; renaming the attribute would silently disable resize.
    render(<ResizeHandles invScale={1} width={10} height={10} />)
    expect(container.querySelectorAll('[data-resize]')).toHaveLength(4)
  })
})
