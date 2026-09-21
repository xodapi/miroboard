import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MoreMenu, type MoreMenuProps } from './MoreMenu'
import { ContextMenu } from './ContextMenu'
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

/** Every handler is a spy, so a test can assert exactly which one fired. */
function handlers() {
  return {
    onChooseTool: vi.fn(), onActivateBpmn: vi.fn(), onOpenTemplates: vi.fn(),
    onImportBpmn: vi.fn(), onRunBpmn: vi.fn(), onOpenSimulation: vi.fn(),
    onExportBpmn: vi.fn(), onExportPng: vi.fn(), onNewDocument: vi.fn(),
    onOpenDocument: vi.fn(), onSave: vi.fn(), onSaveAs: vi.fn(),
    onMarkState: vi.fn(), onResetViewport: vi.fn(), onClose: vi.fn(),
  }
}

function renderMenu(overrides: Partial<MoreMenuProps> = {}) {
  const spies = handlers()
  const props: MoreMenuProps = {
    theme,
    tool: 'select',
    bpmnPaletteActive: false,
    hasBpmnNodes: false,
    isPreview: false,
    retentionControls: <div data-testid="retention" />,
    ...spies,
    ...overrides,
  }
  act(() => { root.render(<MoreMenu {...props} />) })
  return { ...spies, ...overrides } as ReturnType<typeof handlers>
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(label))
  if (!found) throw new Error(`no button matching ${label}: ${[...container.querySelectorAll('button')].map(b => b.textContent).join(' | ')}`)
  return found
}

describe('MoreMenu', () => {
  it('runs the action and dismisses itself, for every entry', () => {
    // The original repeated setShowMore(false) at each call site; this asserts
    // the shared wrapper did not drop it anywhere.
    const cases: [string, keyof ReturnType<typeof handlers>][] = [
      ['Шаблоны', 'onOpenTemplates'],
      ['⇧ BPMN', 'onImportBpmn'],
      ['PNG', 'onExportPng'],
      ['Новый', 'onNewDocument'],
      ['Открыть', 'onOpenDocument'],
      ['⇩ Сохранить', 'onSave'],
      ['⇩ Сохранить как', 'onSaveAs'],
      ['Отметить состояние', 'onMarkState'],
      ['Домой', 'onResetViewport'],
    ]
    for (const [label, handler] of cases) {
      const spies = renderMenu()
      act(() => { button(label).click() })
      expect(spies[handler], `${label} -> ${handler}`).toHaveBeenCalledTimes(1)
      expect(spies.onClose, `${label} should dismiss`).toHaveBeenCalledTimes(1)
    }
  })

  it('distinguishes Save from Save as, which share a prefix', () => {
    const spies = renderMenu()
    // getByText-style prefix matching would hit "Сохранить" first; the menu has
    // both, so the exact label matters.
    const saveAs = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === '⇩ Сохранить как')!
    act(() => { saveAs.click() })
    expect(spies.onSaveAs).toHaveBeenCalledTimes(1)
    expect(spies.onSave).not.toHaveBeenCalled()
  })

  it('selects a tool through the same one-shot path', () => {
    const spies = renderMenu()
    act(() => { button('Лазер').click() })
    expect(spies.onChooseTool).toHaveBeenCalledWith('laser')
    expect(spies.onClose).toHaveBeenCalledTimes(1)
  })

  it('marks the active tool', () => {
    renderMenu({ tool: 'laser' })
    expect(button('Лазер').className).toContain('bg-black')
    expect(button('Линия').className).not.toContain('bg-black')
  })

  it('hides the BPMN actions until the board has BPMN nodes', () => {
    renderMenu()
    expect(container.textContent).not.toContain('Запуск')
    expect(container.textContent).not.toContain('Симуляция')

    renderMenu({ hasBpmnNodes: true })
    expect(container.textContent).toContain('Запуск')
    expect(container.textContent).toContain('Симуляция')
  })

  it('disables simulation while previewing history, since preview is read-only', () => {
    renderMenu({ hasBpmnNodes: true, isPreview: true })
    expect(button('Симуляция').disabled).toBe(true)
    // Running and exporting only read the model, so they stay available.
    expect(button('Запуск').disabled).toBe(false)
  })

  it('renders the retention controls it is handed', () => {
    renderMenu()
    expect(container.querySelector('[data-testid="retention"]')).not.toBeNull()
  })
})

describe('ContextMenu', () => {
  it('projects its world position through the viewport', () => {
    act(() => {
      root.render(
        <ContextMenu x={100} y={50} transform={{ x: 20, y: 10, scale: 2 }} theme={theme} onAction={vi.fn()} />,
      )
    })
    const menu = container.querySelector('[data-testid="context-menu"]') as HTMLElement
    expect(menu.style.left).toBe('220px') // 100 * 2 + 20
    expect(menu.style.top).toBe('110px') // 50 * 2 + 10
  })

  it('reports which action was chosen', () => {
    const onAction = vi.fn()
    act(() => {
      root.render(<ContextMenu x={0} y={0} transform={{ x: 0, y: 0, scale: 1 }} theme={theme} onAction={onAction} />)
    })
    act(() => { button('Удалить').click() })
    expect(onAction).toHaveBeenCalledWith('delete')
  })

  it('marks the destructive entry apart from the rest', () => {
    act(() => {
      root.render(<ContextMenu x={0} y={0} transform={{ x: 0, y: 0, scale: 1 }} theme={theme} onAction={vi.fn()} />)
    })
    expect(button('Удалить').className).toContain('text-red-500')
    expect(button('Дублировать').className).not.toContain('text-red-500')
  })
})
