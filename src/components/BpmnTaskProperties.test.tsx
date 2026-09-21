import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BpmnTaskProperties } from './BpmnTaskProperties'
import { BpmnFlowProperties } from './BpmnFlowProperties'
import { createTheme } from '../board/theme'
import type { BoardElement } from '../board/types'

/**
 * These panels write straight into the simulation inputs, so the assertions
 * here are mostly about what they refuse to write: the Rust core reads these
 * numbers directly and a NaN or a negative duration produces a nonsense run
 * rather than a visible error.
 */

let container: HTMLDivElement
let root: Root
const theme = createTheme(false)

function render(node: React.ReactNode) {
  act(() => { root.render(node) })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

function task(overrides: Partial<BoardElement> = {}): BoardElement {
  return { id: 't1', type: 'rect', x: 0, y: 0, w: 120, h: 80, color: '#000', bpmnNodeType: 'task', ...overrides }
}

function flow(overrides: Partial<BoardElement> = {}): BoardElement {
  return {
    id: 'f1', type: 'arrow', x: 0, y: 0, color: '#000',
    bpmnFlow: { sourceId: 'a', targetId: 'b' },
    ...overrides,
  }
}

/** Sets a controlled input's value the way React observes it. */
function type(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLSelectElement.prototype
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

function field(testId: string, selector: string): HTMLInputElement {
  return container.querySelector(`[data-testid="${testId}"] ${selector}`) as HTMLInputElement
}

describe('BpmnTaskProperties', () => {
  it('shows the duration in seconds and stores it in milliseconds', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task({ bpmnDurationMs: 2500 })} theme={theme} onUpdate={onUpdate} />)

    const duration = container.querySelector('#bpmn-duration') as HTMLInputElement
    expect(duration.value).toBe('2.5')

    type(duration, '4')
    expect(onUpdate).toHaveBeenCalledWith('t1', { bpmnDurationMs: 4000 })
  })

  it('refuses a negative duration instead of writing it', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task()} theme={theme} onUpdate={onUpdate} />)

    type(container.querySelector('#bpmn-duration') as HTMLInputElement, '-5')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('never writes NaN, whatever the field reports', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task()} theme={theme} onUpdate={onUpdate} />)

    // A number input reports '' for unparseable text, so this arrives as 0 and
    // zeroes the duration rather than being ignored. Documented rather than
    // changed: this refactor moves markup, and a zero-duration task is a
    // meaningful (if odd) model, unlike a NaN one which would poison the run.
    type(container.querySelector('#bpmn-duration') as HTMLInputElement, 'abc')
    for (const [, updates] of onUpdate.mock.calls) {
      expect(Number.isNaN(updates.bpmnDurationMs)).toBe(false)
    }
  })

  it('caps the duration at an hour', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task()} theme={theme} onUpdate={onUpdate} />)

    type(container.querySelector('#bpmn-duration') as HTMLInputElement, '9999')
    expect(onUpdate).toHaveBeenCalledWith('t1', { bpmnDurationMs: 3_600_000 })
  })

  it('reveals the spread only for distributions that have one', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task()} theme={theme} onUpdate={onUpdate} />)
    expect(container.textContent).not.toContain('Min')

    render(<BpmnTaskProperties task={task({ bpmnDurationDistribution: 'uniform' })} theme={theme} onUpdate={onUpdate} />)
    expect(container.textContent).toContain('Min')
    expect(container.textContent).toContain('Max')
    // Mode is triangular-only: a uniform distribution has no peak.
    expect(container.textContent).not.toContain('Mode')

    render(<BpmnTaskProperties task={task({ bpmnDurationDistribution: 'triangular' })} theme={theme} onUpdate={onUpdate} />)
    expect(container.textContent).toContain('Mode')
  })

  it('seeds the spread from the fixed duration when switching distribution', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task({ bpmnDurationMs: 7000 })} theme={theme} onUpdate={onUpdate} />)

    type(container.querySelector('select') as HTMLSelectElement, 'triangular')
    expect(onUpdate).toHaveBeenCalledWith('t1', {
      bpmnDurationDistribution: 'triangular',
      bpmnDurationMinMs: 7000,
      bpmnDurationModeMs: 7000,
      bpmnDurationMaxMs: 7000,
    })
  })

  it('clears the cost when the field is emptied rather than writing zero', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task({ bpmnCostPerHour: 50 })} theme={theme} onUpdate={onUpdate} />)

    const cost = [...container.querySelectorAll('input')].find(input => input.value === '50')!
    type(cost, '')
    expect(onUpdate).toHaveBeenCalledWith('t1', { bpmnCostPerHour: undefined })
  })

  it('keeps capacity a whole number within range', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task({ bpmnResourceCapacity: 2 })} theme={theme} onUpdate={onUpdate} />)
    const capacity = [...container.querySelectorAll('input')].find(input => input.value === '2')!

    type(capacity, '0')
    type(capacity, '1.5')
    type(capacity, '5000')
    expect(onUpdate).not.toHaveBeenCalled()

    type(capacity, '4')
    expect(onUpdate).toHaveBeenCalledWith('t1', { bpmnResourceCapacity: 4 })
  })

  it('accepts a negative priority, which is a valid ordering', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task({ bpmnPriority: 0 })} theme={theme} onUpdate={onUpdate} />)
    const priority = [...container.querySelectorAll('input')].filter(input => input.value === '0').pop()!

    type(priority, '-3')
    expect(onUpdate).toHaveBeenCalledWith('t1', { bpmnPriority: -3 })
  })

  it('drops an empty role rather than storing an empty string', () => {
    const onUpdate = vi.fn()
    render(<BpmnTaskProperties task={task({ bpmnResourceRole: 'Аналитик' })} theme={theme} onUpdate={onUpdate} />)
    const role = [...container.querySelectorAll('input')].find(input => input.value === 'Аналитик')!

    type(role, '')
    expect(onUpdate).toHaveBeenCalledWith('t1', { bpmnResourceRole: undefined })
  })
})

describe('BpmnFlowProperties', () => {
  it('preserves the endpoints when editing one property', () => {
    const onUpdate = vi.fn()
    render(<BpmnFlowProperties flow={flow()} isXorBranch={false} theme={theme} onUpdate={onUpdate} />)

    type(container.querySelector('#bpmn-flow-type') as HTMLSelectElement, 'message')
    expect(onUpdate).toHaveBeenCalledWith('f1', {
      bpmnFlow: { sourceId: 'a', targetId: 'b', flowType: 'message' },
    })
  })

  it('hides branch weights on a flow that is not an XOR branch', () => {
    render(<BpmnFlowProperties flow={flow()} isXorBranch={false} theme={theme} onUpdate={vi.fn()} />)
    expect(container.querySelector('#bpmn-flow-probability')).toBeNull()
    expect(container.textContent).not.toContain('default')
  })

  it('offers probability and the default flag on an XOR branch', () => {
    const onUpdate = vi.fn()
    render(<BpmnFlowProperties flow={flow()} isXorBranch theme={theme} onUpdate={onUpdate} />)

    const probability = container.querySelector('#bpmn-flow-probability') as HTMLInputElement
    expect(probability).not.toBeNull()

    type(probability, '0.25')
    expect(onUpdate).toHaveBeenCalledWith('f1', {
      bpmnFlow: { sourceId: 'a', targetId: 'b', probability: 0.25 },
    })
  })

  it('rejects a probability outside 0..1', () => {
    const onUpdate = vi.fn()
    render(<BpmnFlowProperties flow={flow()} isXorBranch theme={theme} onUpdate={onUpdate} />)
    const probability = container.querySelector('#bpmn-flow-probability') as HTMLInputElement

    type(probability, '1.5')
    type(probability, '-0.2')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('toggles the default flag', () => {
    const onUpdate = vi.fn()
    render(<BpmnFlowProperties flow={flow()} isXorBranch theme={theme} onUpdate={onUpdate} />)
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement

    act(() => { checkbox.click() })
    expect(onUpdate).toHaveBeenCalledWith('f1', {
      bpmnFlow: { sourceId: 'a', targetId: 'b', isDefault: true },
    })
  })

  it('labels the panel for the flow, not the task', () => {
    render(<BpmnFlowProperties flow={flow()} isXorBranch={false} theme={theme} onUpdate={vi.fn()} />)
    expect(field('bpmn-flow-properties', 'select')).not.toBeNull()
    expect(container.textContent).toContain('Свойства sequence flow')
  })
})
