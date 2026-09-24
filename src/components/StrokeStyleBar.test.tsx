import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTheme } from '../board/theme'
import { StrokeStyleBar, type StrokeStyleBarProps } from './StrokeStyleBar'

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

function render(overrides: Partial<StrokeStyleBarProps> = {}) {
  const onChange = vi.fn()
  const props: StrokeStyleBarProps = {
    theme: createTheme(false),
    dash: 'solid',
    arrowHead: 'triangle',
    stroke: 2,
    onChange,
    ...overrides,
  }
  act(() => { root.render(<StrokeStyleBar {...props} />) })
  return onChange
}

describe('StrokeStyleBar', () => {
  it('offers solid, dashed, a head and the four stroke widths', () => {
    render()
    expect(container.querySelector('[data-testid="stroke-style-bar"]')).not.toBeNull()
    expect(container.textContent).toContain('Сплошная')
    expect(container.textContent).toContain('Пунктир')
    expect(container.querySelector('[aria-label="Наконечник"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[aria-label="Без наконечника"]')!.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('[aria-label="Толщина 2"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[aria-label="Толщина 12"]')).not.toBeNull()
  })

  it('writes one field per click', () => {
    const onChange = render({ dash: 'dashed', arrowHead: 'none', stroke: 4 })
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Наконечник"]')!.click() })
    act(() => {
      const dashed = [...container.querySelectorAll('button')].find(button => button.textContent === 'Сплошная')
      dashed!.click()
    })
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Толщина 12"]')!.click() })
    expect(onChange).toHaveBeenNthCalledWith(1, { arrowHead: 'triangle' })
    expect(onChange).toHaveBeenNthCalledWith(2, { dash: 'solid' })
    expect(onChange).toHaveBeenNthCalledWith(3, { stroke: 12 })
  })
})
