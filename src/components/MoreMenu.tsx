import type { ReactNode } from 'react'
import type { Theme } from '../board/theme'
import type { Tool } from '../board/types'

export interface MoreMenuProps {
  theme: Theme
  tool: Tool
  /** True while the BPMN palette is showing, which highlights the BPMN entry. */
  bpmnPaletteActive: boolean
  /** BPMN run/simulate/export only make sense once the board has BPMN nodes. */
  hasBpmnNodes: boolean
  /** History preview is read-only, so simulation is unavailable there. */
  isPreview: boolean
  /** HistoryRetentionControls, which needs App-owned state to render. */
  retentionControls: ReactNode
  onChooseTool: (tool: Tool) => void
  onActivateBpmn: () => void
  onOpenTemplates: () => void
  onImportBpmn: () => void
  onRunBpmn: () => void
  onOpenSimulation: () => void
  onExportBpmn: () => void
  onExportPng: () => void
  onNewDocument: () => void
  onOpenDocument: () => void
  onSave: () => void
  onSaveAs: () => void
  onMarkState: () => void
  onResetViewport: () => void
  onClose: () => void
}

/**
 * The overflow bar above the bottom toolbar: the tools that did not fit, plus
 * the file, BPMN and history actions.
 *
 * Every entry closes the menu, so each handler is wrapped once here rather than
 * repeating `setShowMore(false)` at seventeen call sites as the original did.
 */
export function MoreMenu(props: MoreMenuProps) {
  const { theme, tool, bpmnPaletteActive, hasBpmnNodes, isPreview, retentionControls, onClose } = props

  const item = `h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition`
  const plain = `${item} ${theme.hoverBg}`
  const active = (on: boolean) => `${item} ${on ? 'bg-black text-white' : theme.hoverBg}`
  /** Every entry is one-shot: run the action, then dismiss. */
  const run = (action: () => void) => () => { action(); onClose() }

  return (
    <div
      className={`absolute bottom-[104px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${theme.border}`}
      data-ui
      data-testid="more-menu"
    >
      <button onClick={run(() => props.onChooseTool('line'))} className={active(tool === 'line')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 19L19 5" /></svg> Линия
      </button>
      <button onClick={run(() => props.onChooseTool('laser'))} className={active(tool === 'laser')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="4 3" /></svg> Лазер
      </button>
      <button onClick={run(() => props.onChooseTool('eraser'))} className={active(tool === 'eraser')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16a1.9 1.9 0 0 1 0-2.8L14.2 2h.8l6 6v.8L9.8 20" /></svg> Ластик
      </button>
      <button
        onClick={run(props.onActivateBpmn)}
        className={`${item} ${bpmnPaletteActive ? 'bg-violet-600 text-white' : theme.hoverBg}`}
      >
        ◇ BPMN
      </button>

      <div className={`w-px h-6 ${theme.dark ? 'bg-slate-600' : 'bg-black/10'}`} />

      <button onClick={run(props.onOpenTemplates)} className={plain}>📋 Шаблоны</button>
      <button onClick={run(props.onImportBpmn)} className={plain}>⇧ BPMN</button>

      {hasBpmnNodes && (
        <>
          <button onClick={run(props.onRunBpmn)} className={plain}>▶ Запуск</button>
          <button
            onClick={run(props.onOpenSimulation)}
            disabled={isPreview}
            className={`${plain} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ◌ Симуляция
          </button>
          <button onClick={run(props.onExportBpmn)} className={plain}>⇩ BPMN</button>
        </>
      )}

      <button onClick={run(props.onExportPng)} className={plain}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg> PNG
      </button>
      <button onClick={run(props.onNewDocument)} className={plain}>Новый</button>
      <button onClick={run(props.onOpenDocument)} className={plain}>Открыть</button>
      <button onClick={run(props.onSave)} className={plain}>⇩ Сохранить</button>
      <button onClick={run(props.onSaveAs)} className={plain}>⇩ Сохранить как</button>
      <button onClick={run(props.onMarkState)} className={plain}>◉ Отметить состояние</button>

      {retentionControls}

      <button onClick={run(props.onResetViewport)} className={plain}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg> Домой
      </button>
    </div>
  )
}
