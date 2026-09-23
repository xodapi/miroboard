import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTheme } from '../board/theme'
import { AlignBar } from './AlignBar'

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

describe('AlignBar', () => {
  it('offers the six edges and reports which one was clicked', () => {
    const onAlign = vi.fn()
    act(() => { root.render(<AlignBar theme={createTheme(false)} onAlign={onAlign} />) })
    expect(container.querySelector('[data-testid="align-bar"]')).not.toBeNull()
    for (const label of ['Слева', 'Центр', 'Справа', 'Сверху', 'Середина', 'Снизу']) {
      expect(container.querySelector(`[aria-label="Выровнять: ${label}"]`)).not.toBeNull()
    }
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Выровнять: Справа"]')!.click() })
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Выровнять: Середина"]')!.click() })
    expect(onAlign).toHaveBeenNthCalledWith(1, 'right')
    expect(onAlign).toHaveBeenNthCalledWith(2, 'centerY')
  })
})
