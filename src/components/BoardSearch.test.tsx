import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardSearch, type BoardSearchProps } from './BoardSearch'
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

function render(overrides: Partial<BoardSearchProps> = {}) {
  const spies = {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onQueryChange: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onPick: vi.fn(),
  }
  const props: BoardSearchProps = {
    theme: createTheme(false),
    open: true,
    query: 'счёт',
    matchIndex: 0,
    matchCount: 3,
    focusNonce: 0,
    ...spies,
    ...overrides,
  }
  act(() => { root.render(<BoardSearch {...props} />) })
  return spies
}

describe('BoardSearch', () => {
  it('offers a button until it is opened, and the button does not pretend to be the panel', () => {
    const spies = render({ open: false })
    expect(container.querySelector('[data-testid="board-search"]')).toBeNull()
    const button = container.querySelector<HTMLButtonElement>('[data-testid="open-search"]')!
    expect(button).not.toBeNull()
    act(() => { button.click() })
    expect(spies.onOpen).toHaveBeenCalledTimes(1)
  })

  it('reports the position in the hit list, and "none" when the query missed', () => {
    render({ matchIndex: 1, matchCount: 3 })
    expect(container.textContent).toContain('2 / 3')
    render({ query: 'нет такого', matchCount: 0 })
    expect(container.textContent).toContain('нет совпадений')
  })

  it('does not announce a count for an empty query', () => {
    // "0 / 0" would look like a failed search. An empty box has not searched.
    render({ query: '  ', matchCount: 0 })
    expect(container.textContent).not.toContain('нет совпадений')
    expect(container.textContent).toContain('текст, роль, условие')
  })

  it('wires next, previous and close', () => {
    const spies = render()
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Следующее совпадение"]')!.click() })
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Предыдущее совпадение"]')!.click() })
    act(() => { container.querySelector<HTMLButtonElement>('[aria-label="Закрыть поиск"]')!.click() })
    expect(spies.onNext).toHaveBeenCalledTimes(1)
    expect(spies.onPrev).toHaveBeenCalledTimes(1)
    expect(spies.onClose).toHaveBeenCalledTimes(1)
  })

  it('lists every hit and jumps to the one that was clicked', () => {
    const spies = render({
      matchIndex: 0,
      hits: [
        { id: 'a', label: 'Счёт выставить' },
        { id: 'b', label: 'Счёт оплатить' },
      ],
    })
    const rows = [...container.querySelectorAll<HTMLButtonElement>('[data-testid="search-result"]')]
    expect(rows.map(row => row.textContent)).toEqual(['Счёт выставить', 'Счёт оплатить'])
    expect(rows[0].getAttribute('aria-current')).toBe('true')
    expect(rows[1].getAttribute('aria-current')).toBeNull()
    act(() => { rows[1].click() })
    expect(spies.onPick).toHaveBeenCalledWith(1)
  })

  it('does not invent a list when the shell has not passed hits', () => {
    render()
    expect(container.querySelector('[data-testid="search-results"]')).toBeNull()
  })

  it('closes on Escape from the field itself', () => {
    // The shell's window handler also watches Escape, but the field must not
    // depend on that: a capture-phase listener can change, the box should not.
    const spies = render()
    const input = container.querySelector('input')!
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(spies.onClose).toHaveBeenCalledTimes(1)
  })
})
