import type { ReactNode } from 'react'
import { COLORS, EMOJIS } from '../board/palette'
import type { Theme } from '../board/theme'
import type { Tool } from '../board/types'

/** Drawing tools, usable while previewing history because they only pan/draw. */
const DRAW_TOOLS: { id: Tool; icon: ReactNode; label: string }[] = [
  { id: 'select', label: 'Выбор', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg> },
  { id: 'pan', label: 'Рука', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V8a1 1 0 0 0-1-1h-3M6 13v3a1 1 0 0 0 1 1h3M13 18h3a1 1 0 0 0 1-1v-3M11 6H8a1 1 0 0 0-1 1v3" /></svg> },
  { id: 'pen', label: 'Перо', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><path d="M11 11l4 4" /></svg> },
  { id: 'marker', label: 'Маркер', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.34 4.93l-3.59 3.59-1.41-1.42-1.42 1.42 1.42 1.41-3.6 3.59c-.39.39-.39 1.02 0 1.41L10.34 19c.39.39 1.02.39 1.41 0l3.6-3.59 1.41 1.42 1.42-1.42-1.42-1.41 3.59-3.59c.39-.39.39-1.02 0-1.41L15.75 4.93c-.39-.39-1.02-.39-1.41 0z" /></svg> },
]

/** Tools that create elements. All are unavailable in read-only preview. */
const CREATE_TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'sticky', label: 'Стикер', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#FFD93D" stroke="#000" strokeOpacity="0.1" /><path d="M7 8h10M7 12h7M7 16h4" stroke="#000" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" /></svg> },
  { id: 'text', label: 'Текст', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg> },
  { id: 'emoji', label: 'Эмодзи', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg> },
  { id: 'rect', label: 'Прямоугольник', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg> },
  { id: 'circle', label: 'Круг', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg> },
  { id: 'arrow', label: 'Стрелка', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 5l7 7-7 7" /></svg> },
]

const BPMN_TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'bpmnStart', label: 'Старт', icon: '○' },
  { id: 'bpmnTask', label: 'Задача', icon: '▭' },
  { id: 'bpmnGateway', label: 'Шлюз XOR', icon: '◇' },
  { id: 'bpmnParallel', label: 'Шлюз AND', icon: '+' },
  { id: 'bpmnEnd', label: 'Конец', icon: '◉' },
  { id: 'bpmnSequence', label: 'Поток', icon: '→' },
]

const STROKE_WIDTHS = [2, 4, 7, 12]

export interface BottomToolbarProps {
  theme: Theme
  tool: Tool
  color: string
  strokeWidth: number
  selectedEmoji: string
  /** History preview is read-only: only panning survives it. */
  isPreview: boolean
  showEmoji: boolean
  showBpmnPalette: boolean
  showColorPicker: boolean
  showMore: boolean
  onChooseTool: (tool: Tool) => void
  onSetColor: (color: string) => void
  onSetStrokeWidth: (width: number) => void
  onSetSelectedEmoji: (emoji: string) => void
  onToggleEmoji: () => void
  onToggleColorPicker: () => void
  onToggleMore: () => void
  onCloseEmoji: () => void
  onCloseColorPicker: () => void
}

/**
 * The floating bar at the bottom of the board, plus the three sheets that open
 * above it: the emoji picker, the BPMN palette and the colour/stroke picker.
 *
 * They travel together because each one is anchored to the bar and toggled by
 * it; splitting them further would mean threading the same open/close state
 * through two levels for no gain.
 */
export function BottomToolbar(props: BottomToolbarProps) {
  const { theme, tool, isPreview } = props
  const sheet = `mb-2 mx-auto w-fit p-2 rounded-2xl ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${theme.border}`
  const slot = 'size-11 grid place-items-center rounded-[14px] transition-all active:scale-90'
  const slotState = (on: boolean) => (on ? 'bg-black text-white shadow-md' : `${theme.textSecondary} ${theme.hoverBg}`)

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pb-[calc(env(safe-area-inset-bottom)+8px)]" data-ui>
      <div className="mx-auto w-fit max-w-[calc(100%-16px)]">
        {props.showEmoji && (
          <div className={sheet} data-testid="emoji-picker">
            <div className="flex flex-wrap gap-1 max-w-[280px]">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  aria-label={`Эмодзи ${emoji}`}
                  onClick={() => { props.onSetSelectedEmoji(emoji); props.onChooseTool('emoji'); props.onCloseEmoji() }}
                  className={`size-10 rounded-xl grid place-items-center text-[22px] transition active:scale-90 ${props.selectedEmoji === emoji ? (theme.dark ? 'bg-violet-600' : 'bg-violet-100') : theme.hoverBg}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {props.showBpmnPalette && (
          <div className={`relative z-10 ${sheet}`} data-testid="bpmn-palette">
            <div className="flex gap-1.5">
              {BPMN_TOOLS.map(item => (
                <button
                  key={item.id}
                  onClick={() => props.onChooseTool(item.id)}
                  className={`min-w-14 h-12 px-2 rounded-xl grid place-items-center text-center transition active:scale-90 ${tool === item.id ? 'bg-violet-600 text-white' : theme.hoverBg}`}
                  title={item.label}
                >
                  <span className="text-xl leading-none">{item.icon}</span>
                  <span className="text-[10px] leading-none mt-0.5">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {props.showColorPicker && (
          <div className={`${sheet} flex items-center gap-1.5`} data-testid="stroke-color-picker">
            {COLORS.map(swatch => (
              <button
                key={swatch}
                aria-label={`Цвет ${swatch}`}
                onClick={() => { props.onSetColor(swatch); props.onCloseColorPicker() }}
                className="size-8 rounded-full transition-all active:scale-90"
                style={{
                  backgroundColor: swatch,
                  border: swatch === '#FFFFFF' ? `1px solid ${theme.dark ? '#555' : '#e5e5e5'}` : 'none',
                  boxShadow: props.color === swatch ? '0 0 0 2px white, 0 0 0 4px #4D96FF' : 'none',
                }}
              />
            ))}
            <div className={`w-px h-6 ${theme.divider} mx-1`} />
            {STROKE_WIDTHS.map(width => (
              <button
                key={width}
                aria-label={`Толщина ${width}`}
                onClick={() => props.onSetStrokeWidth(width)}
                className={`size-8 rounded-full grid place-items-center transition ${props.strokeWidth === width ? (theme.dark ? 'bg-slate-600' : 'bg-black/10') : theme.hoverBg}`}
              >
                <div className="rounded-full bg-current" style={{ width: width * 2, height: width * 2, color: theme.dark ? '#fff' : '#000' }} />
              </button>
            ))}
          </div>
        )}

        <div
          className={`flex items-center gap-0.5 p-1.5 rounded-[22px] ${theme.barSurface} backdrop-blur-2xl shadow-2xl shadow-black/20 border ${theme.border}`}
          data-testid="bottom-toolbar"
        >
          {DRAW_TOOLS.map(item => (
            <button
              key={item.id}
              onClick={() => { props.onChooseTool(item.id); props.onCloseEmoji() }}
              // Panning is the one thing that still makes sense on a read-only
              // snapshot, so it stays live while previewing.
              disabled={isPreview && item.id !== 'pan'}
              className={`${slot} ${slotState(tool === item.id)}`}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}

          <div className={`w-px h-7 ${theme.divider} mx-0.5`} />

          {CREATE_TOOLS.map(item => (
            <button
              key={item.id}
              onClick={() => {
                // Emoji is the one tool that needs a choice before it can place
                // anything, so its button doubles as the sheet toggle.
                if (item.id === 'emoji') { props.onToggleEmoji(); props.onChooseTool('emoji') }
                else { props.onChooseTool(item.id); props.onCloseEmoji() }
              }}
              disabled={isPreview}
              aria-label={item.label}
              title={item.label}
              className={`${slot} ${slotState(tool === item.id)}`}
            >
              {item.icon}
            </button>
          ))}

          <div className={`w-px h-7 ${theme.divider} mx-0.5`} />

          <button
            onClick={props.onToggleColorPicker}
            aria-label="Цвет и толщина"
            className={`size-11 grid place-items-center rounded-[14px] ${theme.hoverBg} transition`}
          >
            <div
              className="size-6 rounded-full ring-2 ring-black/10 shadow-inner"
              style={{ backgroundColor: props.color, border: props.color === '#FFFFFF' ? `1px solid ${theme.dark ? '#555' : '#ddd'}` : 'none' }}
            />
          </button>

          <button
            onClick={props.onToggleMore}
            disabled={isPreview}
            aria-label="Дополнительные инструменты"
            className={`${slot} ${props.showMore ? 'bg-black text-white' : `${theme.textSecondary} ${theme.hoverBg}`}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
