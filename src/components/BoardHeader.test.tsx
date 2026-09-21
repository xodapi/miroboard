import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardHeader, type BoardHeaderProps } from './BoardHeader'
import { createTheme } from '../board/theme'
import { PARTICIPANT_COLORS, type UserProfile } from '../collab/user-profile'

let container: HTMLDivElement
let root: Root
const theme = createTheme(false)
const userProfile: UserProfile = { id: 'abcdef0123456789', name: 'Анна', color: PARTICIPANT_COLORS[0] }

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

function render(overrides: Partial<BoardHeaderProps> = {}) {
  const spies = {
    onSelectMode: vi.fn(), onOpenProjectHistory: vi.fn(), onOpenTimeline: vi.fn(),
    onStartTour: vi.fn(), onOpenLearningModules: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
    onOpenSimulation: vi.fn(), onToggleSnapGrid: vi.fn(), onToggleDarkMode: vi.fn(),
    onToggleMiniMap: vi.fn(), onToggleProfile: vi.fn(),
  }
  const props: BoardHeaderProps = {
    theme,
    documentName: null,
    isDirty: false,
    version: '1.2.3',
    workspaceMode: 'board',
    isPreview: false,
    canUndo: false,
    canRedo: false,
    showTimeline: false,
    snapGrid: false,
    tool: 'select',
    bpmnFlowSourceId: null,
    selectionCount: 0,
    hasBpmnNodes: false,
    bpmnIssues: [],
    bpmnRunSummary: null,
    simulationSummary: null,
    userProfile,
    showProfile: false,
    recoveryNotice: null,
    ...spies,
    ...overrides,
  }
  act(() => { root.render(<BoardHeader {...props} />) })
  return spies
}

const byTitle = (title: string) => container.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!
const byText = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text)!
const status = () => container.querySelector('[role="status"]')!

describe('BoardHeader', () => {
  it('names an unsaved document rather than showing an empty title', () => {
    render()
    expect(container.textContent).toContain('Новый документ')
    render({ documentName: 'план.miro' })
    expect(container.textContent).toContain('план.miro')
  })

  it('announces the save state through a live region', () => {
    // The e2e suite reads this by role, and an unsaved-changes indicator that
    // does not announce itself is no indicator at all for a screen reader.
    render({ isDirty: false })
    expect(status().textContent).toBe('Сохранено')
    expect(status().getAttribute('aria-live')).toBe('polite')

    render({ isDirty: true })
    expect(status().textContent).toBe('Не сохранено')
  })

  it('disables undo and redo until there is something to undo', () => {
    render()
    expect(byTitle('Отменить (Ctrl+Z)').disabled).toBe(true)
    expect(byTitle('Вернуть (Ctrl+Shift+Z)').disabled).toBe(true)

    const spies = render({ canUndo: true, canRedo: true })
    act(() => { byTitle('Отменить (Ctrl+Z)').click() })
    act(() => { byTitle('Вернуть (Ctrl+Shift+Z)').click() })
    expect(spies.onUndo).toHaveBeenCalledTimes(1)
    expect(spies.onRedo).toHaveBeenCalledTimes(1)
  })

  it('locks editing affordances while previewing history', () => {
    // A snapshot preview is read-only, so undo/redo must not offer to rewrite it
    // even when the document has history to rewrite.
    render({ isPreview: true, canUndo: true, canRedo: true, hasBpmnNodes: true })
    expect(byTitle('Отменить (Ctrl+Z)').disabled).toBe(true)
    expect(byTitle('Вернуть (Ctrl+Shift+Z)').disabled).toBe(true)
    expect(byTitle('Открыть Monte Carlo симуляцию').disabled).toBe(true)
  })

  it('hides the selection count for zero or one element', () => {
    // One selected element already shows its own handles; the badge is only
    // informative once a marquee has grabbed several.
    render({ selectionCount: 1 })
    expect(container.querySelector('[data-testid="selection-count"]')).toBeNull()
    render({ selectionCount: 4 })
    expect(container.querySelector('[data-testid="selection-count"]')!.textContent).toContain('4')
  })

  it('hides the selection count in preview, where deleting is not on offer', () => {
    render({ selectionCount: 4, isPreview: true })
    expect(container.querySelector('[data-testid="selection-count"]')).toBeNull()
  })

  it('walks the user through drawing a sequence flow', () => {
    render({ tool: 'bpmnSequence' })
    expect(container.textContent).toContain('Поток: выберите источник')
    render({ tool: 'bpmnSequence', bpmnFlowSourceId: 'node-1' })
    expect(container.textContent).toContain('Поток: выберите цель')
  })

  it('grades the BPMN status by the worst issue present', () => {
    render({ hasBpmnNodes: true })
    expect(container.querySelector('[data-testid="bpmn-status"]')!.className).toContain('bg-emerald-100')

    render({ hasBpmnNodes: true, bpmnIssues: [{ severity: 'warning', message: 'w' }] })
    expect(container.querySelector('[data-testid="bpmn-status"]')!.className).toContain('bg-amber-100')

    // One error outranks any number of warnings.
    render({ hasBpmnNodes: true, bpmnIssues: [{ severity: 'warning', message: 'w' }, { severity: 'error', message: 'e' }] })
    const badge = container.querySelector('[data-testid="bpmn-status"]')!
    expect(badge.className).toContain('bg-red-100')
    expect(badge.textContent).toContain('2')
    expect(badge.getAttribute('title')).toBe('w\ne')
  })

  it('shows BPMN controls only when the board has BPMN nodes', () => {
    render()
    expect(container.querySelector('[data-testid="bpmn-status"]')).toBeNull()
    render({ hasBpmnNodes: true })
    expect(container.querySelector('[data-testid="bpmn-status"]')).not.toBeNull()
  })

  it('routes each workspace mode to the caller as-is', () => {
    // App decides what "bpmn" and "simulation" mean; the header must not
    // second-guess it, or the two would drift.
    const spies = render()
    act(() => { byText('BPMN').click() })
    expect(spies.onSelectMode).toHaveBeenCalledWith('bpmn')
    act(() => { byText('Доска').click() })
    expect(spies.onSelectMode).toHaveBeenCalledWith('board')
  })

  it('reports toggle state to assistive tech, not only through colour', () => {
    render({ snapGrid: true })
    expect(byTitle('Привязка к сетке').getAttribute('aria-pressed')).toBe('true')
    render({ snapGrid: false })
    expect(byTitle('Привязка к сетке').getAttribute('aria-pressed')).toBe('false')
  })

  it('wires the remaining header actions', () => {
    const spies = render()
    const cases: [string, keyof typeof spies][] = [
      ['История проекта', 'onOpenProjectHistory'],
      ['Контрольные точки документа', 'onOpenTimeline'],
      ['Краткий тур по интерфейсу', 'onStartTour'],
      ['Учебные BPMN-примеры', 'onOpenLearningModules'],
      ['Привязка к сетке', 'onToggleSnapGrid'],
      ['Тёмная тема', 'onToggleDarkMode'],
      ['Мини-карта', 'onToggleMiniMap'],
    ]
    for (const [title, handler] of cases) {
      act(() => { byTitle(title).click() })
      expect(spies[handler], `${title} -> ${handler}`).toHaveBeenCalledTimes(1)
    }
  })

  it('makes the build version selectable for copying into a bug report', () => {
    render({ version: 'abc1234' })
    const badge = [...container.querySelectorAll('span')].find(s => s.textContent === 'abc1234')!
    expect(badge.className).toContain('select-text')
  })

  it('renders a recovery notice when it is given one', () => {
    render({ recoveryNotice: <span data-testid="notice" /> })
    expect(container.querySelector('[data-testid="notice"]')).not.toBeNull()
    render()
    expect(container.querySelector('[data-testid="notice"]')).toBeNull()
  })
})
