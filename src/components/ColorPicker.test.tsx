import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ColorPicker, type ColorPickerProps } from './ColorPicker'
import { createTheme } from '../board/theme'

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

function render(overrides: Partial<ColorPickerProps> = {}) {
  const onPick = vi.fn()
  const props: ColorPickerProps = {
    theme: createTheme(false),
    channels: ['fill', 'stroke'],
    fill: '#FFD93D',
    stroke: '#000000',
    onPick,
    ...overrides,
  }
  act(() => { root.render(<ColorPicker {...props} />) })
  return onPick
}

const row = (channel: string) => container.querySelector(`[data-testid="paint-${channel}"]`)

describe('ColorPicker', () => {
  it('shows fill and stroke as separate rows, and a clear for the interior only', () => {
    render()
    expect(row('fill')).not.toBeNull()
    expect(row('stroke')).not.toBeNull()
    expect(row('fill')!.textContent).toContain('Заливка')
    expect(row('stroke')!.textContent).toContain('Обводка')
    expect(container.querySelector('[data-testid="fill-none"]')).not.toBeNull()
    expect(row('stroke')!.querySelector('[data-testid="fill-none"]')).toBeNull()
  })

  it('writes only the channel that was clicked', () => {
    const onPick = render()
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Заливка #6BCB77"]')!.click() })
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Обводка #000000"]')!.click() })
    act(() => { container.querySelector<HTMLButtonElement>('[data-testid="fill-none"]')!.click() })
    expect(onPick).toHaveBeenNthCalledWith(1, 'fill', '#6BCB77')
    expect(onPick).toHaveBeenNthCalledWith(2, 'stroke', '#000000')
    expect(onPick).toHaveBeenNthCalledWith(3, 'fill', 'transparent')
  })

  it('marks the current fill and stroke, including an empty interior', () => {
    render()
    expect(container.querySelector('[aria-label="Заливка #FFD93D"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[aria-label="Заливка #6BCB77"]')!.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('[aria-label="Обводка #000000"]')!.getAttribute('aria-pressed')).toBe('true')

    render({ fill: 'transparent', stroke: '#4D96FF' })
    expect(container.querySelector('[data-testid="fill-none"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('collapses to one colour row for a sticky or a BPMN glyph', () => {
    render({ channels: ['fill'], fill: '#FFD93D', stroke: '#000000' })
    expect(row('stroke')).toBeNull()
    expect(container.querySelector('[aria-label="Цвет #FFD93D"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="fill-none"]')).toBeNull()
    expect(container.textContent).not.toContain('Обводка')

    render({ channels: ['stroke'], stroke: '#4D96FF' })
    expect(row('fill')).toBeNull()
    expect(container.querySelector('[data-testid="fill-none"]')).toBeNull()
  })

  it('renders nothing when the selection has no paintable channel', () => {
    render({ channels: [] })
    expect(container.querySelector('[data-testid="color-picker"]')).toBeNull()
  })
})
