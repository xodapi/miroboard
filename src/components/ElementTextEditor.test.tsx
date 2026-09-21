import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElementTextEditor, type ElementTextEditorProps } from './ElementTextEditor'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Mounts the editor with overridable props and returns the spies. */
function mount(overrides: Partial<ElementTextEditorProps> = {}) {
  const props: ElementTextEditorProps = {
    text: 'hello',
    editing: false,
    draft: '',
    readOnly: false,
    onDraftChange: vi.fn(),
    onBeginEdit: vi.fn(),
    onCommit: vi.fn(),
    ...overrides,
  }
  act(() => root.render(<ElementTextEditor {...props} />))
  return props
}

const display = () => container.querySelector('[data-testid="element-text"]')!
const field = () => container.querySelector('[data-testid="element-text-input"]') as HTMLTextAreaElement | HTMLInputElement

/** Dispatches a bubbling DOM event of the given type. */
function fire(target: Element, type: string, init: EventInit & Record<string, unknown> = {}) {
  const event = type.startsWith('key')
    ? new KeyboardEvent(type, { bubbles: true, ...init })
    : new Event(type, { bubbles: true, ...init })
  act(() => { target.dispatchEvent(event) })
}

/** Controlled inputs ignore `.value =`; React listens for the native setter. */
function type(input: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ElementTextEditor', () => {
  it('shows the document text when not editing', () => {
    mount()
    expect(display().textContent).toBe('hello')
    expect(field()).toBeNull()
  })

  it('begins editing on double click', () => {
    const props = mount()
    fire(display(), 'dblclick')
    expect(props.onBeginEdit).toHaveBeenCalledOnce()
  })

  // The bug this component was extracted to fix: rectangles and ellipses let a
  // history preview open the editor, accepted typing, then dropped it on blur
  // because the write is refused deeper in updateElement.
  it('refuses to begin editing when read-only', () => {
    const props = mount({ readOnly: true })
    fire(display(), 'dblclick')
    expect(props.onBeginEdit).not.toHaveBeenCalled()
  })

  it('commits on blur', () => {
    const props = mount({ editing: true, draft: 'typed' })
    fire(field(), 'focusout')
    expect(props.onCommit).toHaveBeenCalledOnce()
  })

  it('reports a keystroke as a draft change', () => {
    const props = mount({ editing: true, draft: 'a' })
    type(field(), 'ab')
    expect(props.onDraftChange).toHaveBeenCalledWith('ab')
  })

  it('commits on Enter', () => {
    const props = mount({ editing: true, draft: 'typed' })
    fire(field(), 'keydown', { key: 'Enter' })
    expect(props.onCommit).toHaveBeenCalledOnce()
  })

  it('treats Shift+Enter as a newline in a multi-line field', () => {
    const props = mount({ editing: true, draft: 'typed' })
    fire(field(), 'keydown', { key: 'Enter', shiftKey: true })
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it('commits on Shift+Enter in a single-line field, which has no newline to insert', () => {
    const props = mount({ editing: true, draft: 'typed', multiline: false })
    fire(field(), 'keydown', { key: 'Enter', shiftKey: true })
    expect(props.onCommit).toHaveBeenCalledOnce()
  })

  it('ignores other keys', () => {
    const props = mount({ editing: true, draft: 'typed' })
    fire(field(), 'keydown', { key: 'a' })
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it('uses a textarea when multi-line and an input when not', () => {
    mount({ editing: true })
    expect(field().tagName).toBe('TEXTAREA')
    mount({ editing: true, multiline: false })
    expect(field().tagName).toBe('INPUT')
  })
})
