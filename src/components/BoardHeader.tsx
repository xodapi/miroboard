import type { ReactNode } from 'react'
import { ProfileButton } from './ProfilePanel'
import type { Theme } from '../board/theme'
import type { Tool, WorkspaceMode } from '../board/types'
import type { UserProfile } from '../collab/user-profile'

const MODES: [WorkspaceMode, string][] = [
  ['board', 'Доска'],
  ['bpmn', 'BPMN'],
  ['simulation', 'Симуляция'],
]

export interface BoardHeaderProps {
  theme: Theme
  /** Document name, or null for a document that has never been saved. */
  documentName: string | null
  isDirty: boolean
  version: string
  workspaceMode: WorkspaceMode
  /** History preview is read-only; the editing affordances go quiet. */
  isPreview: boolean
  canUndo: boolean
  canRedo: boolean
  showTimeline: boolean
  snapGrid: boolean
  tool: Tool
  /** Set once the flow tool has a source and is waiting for a target. */
  bpmnFlowSourceId: string | null
  selectionCount: number
  /** Shown when the selection can be locked or unlocked. Hidden during preview. */
  lockLabel?: string | null
  hasBpmnNodes: boolean
  bpmnIssues: { severity: string; message: string }[]
  bpmnRunSummary: string | null
  simulationSummary: string | null
  userProfile: UserProfile
  showProfile: boolean
  /** RecoveryDivergenceNotice, rendered by App when a recovery diverged. */
  recoveryNotice: ReactNode
  onSelectMode: (mode: WorkspaceMode) => void
  onOpenProjectHistory: () => void
  onOpenTimeline: () => void
  onStartTour: () => void
  onOpenLearningModules: () => void
  onUndo: () => void
  onRedo: () => void
  onOpenSimulation: () => void
  onToggleSnapGrid: () => void
  onToggleDarkMode: () => void
  onToggleMiniMap: () => void
  onToggleProfile: () => void
  onToggleLock?: () => void
}

/**
 * The top bar: document identity and save state on the left, board status and
 * view toggles on the right.
 *
 * It is a status surface — everything it shows is derived from state App owns,
 * and every control delegates. The prop list is long because the header really
 * does report that much; grouping it into sub-objects would only move the
 * length around.
 */
export function BoardHeader(props: BoardHeaderProps) {
  const { theme, isPreview, bpmnIssues } = props
  const pill = 'h-7 px-2 rounded-lg text-[11px] font-semibold'
  const chip = `h-7 px-2 rounded-lg text-[11px] font-semibold transition ${theme.hoverBg} ${theme.textSecondary}`
  const hasErrors = bpmnIssues.some(issue => issue.severity === 'error')

  return (
    <div
      className={`absolute top-0 left-0 right-0 z-30 h-[52px] flex items-center justify-between px-3 ${theme.dark ? 'bg-slate-900/90' : 'bg-white/90'} backdrop-blur-xl border-b ${theme.border}`}
      data-ui
      data-testid="board-header"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="size-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 grid place-items-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <span className="text-[15px] font-bold tracking-tight text-slate-900">{props.documentName ?? 'Новый документ'}</span>
          <span
            role="status"
            aria-live="polite"
            className={`text-[11px] font-semibold ${props.isDirty ? 'text-amber-700' : theme.textSecondary}`}
          >
            {props.isDirty ? 'Не сохранено' : 'Сохранено'}
          </span>
          {props.recoveryNotice}
          <span
            className="select-text rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600"
            title="Build version: можно выделить и скопировать"
          >
            {props.version}
          </span>

          <div className="ml-1 hidden rounded-lg bg-slate-100 p-0.5 sm:flex">
            {MODES.map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => props.onSelectMode(mode)}
                disabled={mode === 'simulation' && isPreview}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${props.workspaceMode === mode ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <button onClick={props.onOpenProjectHistory} className={chip} title="История проекта">История</button>
          <button
            onClick={props.onOpenTimeline}
            className={`h-7 px-2 rounded-lg text-[11px] font-semibold transition ${props.showTimeline ? 'bg-violet-100 text-violet-700' : `${theme.hoverBg} ${theme.textSecondary}`}`}
            title="Контрольные точки документа"
          >
            Контрольные точки
          </button>
          <button
            onClick={props.onStartTour}
            className={`grid size-7 place-items-center rounded-lg text-[12px] font-bold transition ${theme.hoverBg} ${theme.textSecondary}`}
            title="Краткий тур по интерфейсу"
          >
            ?
          </button>
          <button onClick={props.onOpenLearningModules} className={chip} title="Учебные BPMN-примеры">Примеры</button>
        </div>

        <div className={`h-4 w-px ${theme.divider}`} />

        <button
          onClick={props.onUndo}
          disabled={!props.canUndo || isPreview}
          className={`size-8 grid place-items-center rounded-lg transition ${props.canUndo ? `${theme.hoverBg} ${theme.textSecondary}` : 'opacity-25 cursor-default'}`}
          title="Отменить (Ctrl+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h13a4 4 0 0 1 0 8H9M3 10l5-5M3 10l5 5" /></svg>
        </button>
        <button
          onClick={props.onRedo}
          disabled={!props.canRedo || isPreview}
          className={`size-8 grid place-items-center rounded-lg transition ${props.canRedo ? `${theme.hoverBg} ${theme.textSecondary}` : 'opacity-25 cursor-default'}`}
          title="Вернуть (Ctrl+Shift+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H8a4 4 0 0 0 0 8h7M21 10l-5-5M21 10l-5 5" /></svg>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {props.lockLabel && props.onToggleLock && !isPreview && (
          <button
            type="button"
            data-testid="lock-toggle"
            onClick={props.onToggleLock}
            className={chip}
            title="Заблокированный объект не сдвигается, не меняет размер и не поворачивается"
            aria-pressed={props.lockLabel === 'Разблокировать'}
          >
            {props.lockLabel}
          </button>
        )}

        {props.selectionCount > 1 && !isPreview && (
          <div
            className={`${pill} ${theme.dark ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-700'}`}
            data-testid="selection-count"
            title="Выделено объектов. Ctrl+G — сгруппировать, Ctrl+Shift+G — разгруппировать, Delete — удалить, Esc — снять выделение"
          >
            Выделено: {props.selectionCount}
          </div>
        )}

        {props.tool === 'bpmnSequence' && (
          <div className={`${pill} ${theme.dark ? 'bg-violet-900 text-violet-100' : 'bg-violet-100 text-violet-700'}`}>
            {props.bpmnFlowSourceId ? 'Поток: выберите цель' : 'Поток: выберите источник'}
          </div>
        )}

        {props.hasBpmnNodes && (
          <>
            <div
              className={`${pill} flex items-center gap-1 ${hasErrors ? 'bg-red-100 text-red-700' : bpmnIssues.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}
              title={bpmnIssues.map(issue => issue.message).join('\n') || 'BPMN-модель корректна'}
              data-testid="bpmn-status"
            >
              <span>{hasErrors ? '!' : '✓'}</span>
              BPMN {bpmnIssues.length || 'OK'}
            </div>
            <button
              onClick={props.onOpenSimulation}
              disabled={isPreview}
              className="h-7 rounded-lg bg-fuchsia-500 px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-fuchsia-600 disabled:cursor-not-allowed disabled:opacity-50"
              title="Открыть Monte Carlo симуляцию"
            >
              Симуляция
            </button>
            {props.bpmnRunSummary && (
              <div className={`${pill} ${theme.dark ? 'bg-indigo-950 text-indigo-200' : 'bg-indigo-50 text-indigo-700'}`}>
                {props.bpmnRunSummary}
              </div>
            )}
            {props.simulationSummary && (
              <div
                className={`h-7 max-w-[340px] truncate px-2 rounded-lg text-[11px] font-semibold ${theme.dark ? 'bg-fuchsia-950 text-fuchsia-200' : 'bg-fuchsia-50 text-fuchsia-700'}`}
                title={props.simulationSummary}
              >
                {props.simulationSummary}
              </div>
            )}
          </>
        )}

        <button
          onClick={props.onToggleSnapGrid}
          className={`h-7 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${props.snapGrid ? (theme.dark ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700') : (theme.dark ? 'text-slate-400 hover:bg-slate-700' : 'text-black/40 hover:bg-black/5')}`}
          title="Привязка к сетке"
          aria-pressed={props.snapGrid}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
          Сетка
        </button>

        <button
          onClick={props.onToggleDarkMode}
          className={`size-8 grid place-items-center rounded-lg transition ${theme.hoverBg} ${theme.textSecondary}`}
          title="Тёмная тема"
          aria-pressed={theme.dark}
        >
          {theme.dark
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
        </button>

        <button
          onClick={props.onToggleMiniMap}
          className={`size-8 grid place-items-center rounded-lg transition ${theme.hoverBg} ${theme.textSecondary}`}
          title="Мини-карта"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></svg>
        </button>

        <ProfileButton profile={props.userProfile} expanded={props.showProfile} onToggle={props.onToggleProfile} />
      </div>
    </div>
  )
}
