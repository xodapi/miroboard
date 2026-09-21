import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomToolbar, type BottomToolbarProps } from './BottomToolbar'
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

function render(overrides: Partial<BottomToolbarProps> = {}) {
  const spies = {
    onChooseTool: vi.fn(), onSetColor: vi.fn(), onSetStrokeWidth: vi.fn(),
    onSetSelectedEmoji: vi.fn(), onToggleEmoji: vi.fn(), onToggleColorPicker: vi.fn(),
    onToggleMore: vi.fn(), onCloseEmoji: vi.fn(), onCloseColorPicker: vi.fn(),
  }
  const props: BottomToolbarProps = {
    theme,
    tool: 'select',
    color: '#000000',
    strokeWidth: 4,
    selectedEmoji: '👍',
    isPreview: false,
    showEmoji: false,
    showBpmnPalette: false,
    showColorPicker: false,
    showMore: false,
    ...spies,
    ...overrides,
  }
  act(() => { root.render(<BottomToolbar {...props} />) })
  return spies
}

const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"], button[title="${label}"]`)!
const sheet = (id: string) => container.querySelector(`[data-testid="${id}"]`)

describe('BottomToolbar', () => {
  it('keeps the class hooks the end-to-end suite locates it by', () => {
    // The Playwright specs find the bar with `div.absolute.bottom-0` and the
    // sheets with `div.mb-2.mx-auto.w-fit.p-2.rounded-2xl`. Extraction must not
    // silently rename those, and a unit test fails in seconds where the e2e
    // suite takes minutes.
    render({ showEmoji: true })
    expect(container.querySelector('div.absolute.bottom-0')).not.toBeNull()
    expect(container.querySelector('div.mb-2.mx-auto.w-fit.p-2.rounded-2xl')).not.toBeNull()
  })

  it('selects a drawing tool', () => {
    const spies = render()
    act(() => { byLabel('Перо').click() })
    expect(spies.onChooseTool).toHaveBeenCalledWith('pen')
    // Choosing any other tool dismisses the emoji sheet.
    expect(spies.onCloseEmoji).toHaveBeenCalled()
  })

  it('marks the active tool', () => {
    render({ tool: 'marker' })
    expect(byLabel('Маркер').className).toContain('bg-black')
    expect(byLabel('Перо').className).not.toContain('bg-black')
  })

  it('leaves only panning usable while previewing history', () => {
    // A snapshot preview is read-only. Panning is the one interaction that
    // still makes sense, so it must survive; everything that edits must not.
    render({ isPreview: true })
    expect(byLabel('Рука').disabled).toBe(false)
    for (const label of ['Выбор', 'Перо', 'Маркер', 'Стикер', 'Текст', 'Прямоугольник', 'Дополнительные инструменты']) {
      expect(byLabel(label).disabled, `${label} must be disabled in preview`).toBe(true)
    }
  })

  it('opens the emoji sheet from its toolbar slot and also selects the tool', () => {
    // The emoji button is the only one that both toggles a sheet and picks a
    // tool, because emoji placement needs a choice first.
    const spies = render()
    act(() => { byLabel('Эмодзи').click() })
    expect(spies.onToggleEmoji).toHaveBeenCalledTimes(1)
    expect(spies.onChooseTool).toHaveBeenCalledWith('emoji')
    expect(spies.onCloseEmoji).not.toHaveBeenCalled()
  })

  it('picking an emoji arms the tool and closes the sheet', () => {
    const spies = render({ showEmoji: true })
    const emoji = container.querySelector<HTMLButtonElement>('[data-testid="emoji-picker"] button')!
    act(() => { emoji.click() })
    expect(spies.onSetSelectedEmoji).toHaveBeenCalledTimes(1)
    expect(spies.onChooseTool).toHaveBeenCalledWith('emoji')
    expect(spies.onCloseEmoji).toHaveBeenCalledTimes(1)
  })

  it('shows each sheet only when asked', () => {
    render()
    expect(sheet('emoji-picker')).toBeNull()
    expect(sheet('bpmn-palette')).toBeNull()
    expect(sheet('stroke-color-picker')).toBeNull()

    render({ showEmoji: true, showBpmnPalette: true, showColorPicker: true })
    expect(sheet('emoji-picker')).not.toBeNull()
    expect(sheet('bpmn-palette')).not.toBeNull()
    expect(sheet('stroke-color-picker')).not.toBeNull()
  })

  it('offers every BPMN node tool', () => {
    const spies = render({ showBpmnPalette: true })
    // The e2e suite clicks these by title; a missing one breaks authoring.
    for (const title of ['Старт', 'Задача', 'Шлюз XOR', 'Шлюз AND', 'Конец', 'Поток']) {
      expect(byLabel(title), `BPMN palette is missing ${title}`).not.toBeNull()
    }
    act(() => { byLabel('Шлюз XOR').click() })
    expect(spies.onChooseTool).toHaveBeenCalledWith('bpmnGateway')
  })

  it('picks a colour and dismisses the picker, but keeps it open for stroke width', () => {
    const spies = render({ showColorPicker: true })
    const swatch = container.querySelector<HTMLButtonElement>('[data-testid="stroke-color-picker"] button')!
    act(() => { swatch.click() })
    expect(spies.onSetColor).toHaveBeenCalledTimes(1)
    expect(spies.onCloseColorPicker).toHaveBeenCalledTimes(1)

    const spies2 = render({ showColorPicker: true })
    act(() => { byLabel('Толщина 7').click() })
    expect(spies2.onSetStrokeWidth).toHaveBeenCalledWith(7)
    // Width is a comparison you make by eye across several tries, so the sheet
    // deliberately stays open here where a colour pick closes it.
    expect(spies2.onCloseColorPicker).not.toHaveBeenCalled()
  })

  it('toggles the overflow menu', () => {
    const spies = render()
    act(() => { byLabel('Дополнительные инструменты').click() })
    expect(spies.onToggleMore).toHaveBeenCalledTimes(1)
  })

  it('carries no leftover debug logging', () => {
    // Four console.log('[BPMN diagnostic] …') calls shipped to production from a
    // CI investigation. They fired on every palette click and every canvas
    // pointerdown.
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    render({ showBpmnPalette: true })
    act(() => { byLabel('Задача').click() })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
