import { LINE_STROKE_WIDTHS, type ArrowHead, type LineDash } from '../board/stroke-style'
import type { StrokeStylePatch } from '../board/stroke-style'
import type { Theme } from '../board/theme'

export interface StrokeStyleBarProps {
  theme: Theme
  dash: LineDash
  arrowHead: ArrowHead
  stroke?: number
  onChange: (patch: StrokeStylePatch) => void
}

const chip = 'h-8 rounded-lg px-2.5 text-[12px] font-semibold transition active:scale-95'

/**
 * Dash, arrowhead and thickness for one selected arrow or line.
 *
 * Docked where the colour picker sits: those two never show together, because
 * a line has no fill. Thickness is the same four steps as the creation pen.
 */
export function StrokeStyleBar({ theme, dash, arrowHead, stroke, onChange }: StrokeStyleBarProps) {
  const pressed = theme.dark ? 'bg-slate-600 text-white' : 'bg-black/10 text-slate-900'
  const idle = `${theme.textSecondary} ${theme.hoverBg}`
  return (
    <div
      className={`absolute left-1/2 bottom-[104px] z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border p-1.5 shadow-xl ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} ${theme.border}`}
      data-ui
      data-testid="stroke-style-bar"
    >
      <button
        type="button"
        className={`${chip} ${dash === 'solid' ? pressed : idle}`}
        aria-pressed={dash === 'solid'}
        onClick={() => onChange({ dash: 'solid' })}
      >
        Сплошная
      </button>
      <button
        type="button"
        className={`${chip} ${dash === 'dashed' ? pressed : idle}`}
        aria-pressed={dash === 'dashed'}
        onClick={() => onChange({ dash: 'dashed' })}
      >
        Пунктир
      </button>
      <div className={`mx-0.5 h-6 w-px ${theme.divider}`} />
      <button
        type="button"
        className={`${chip} ${arrowHead === 'triangle' ? pressed : idle}`}
        aria-pressed={arrowHead === 'triangle'}
        aria-label="Наконечник"
        onClick={() => onChange({ arrowHead: 'triangle' })}
      >
        Наконечник
      </button>
      <button
        type="button"
        className={`${chip} ${arrowHead === 'none' ? pressed : idle}`}
        aria-pressed={arrowHead === 'none'}
        aria-label="Без наконечника"
        onClick={() => onChange({ arrowHead: 'none' })}
      >
        Без
      </button>
      <div className={`mx-0.5 h-6 w-px ${theme.divider}`} />
      {LINE_STROKE_WIDTHS.map(width => (
        <button
          key={width}
          type="button"
          aria-label={`Толщина ${width}`}
          aria-pressed={stroke === width}
          onClick={() => onChange({ stroke: width })}
          className={`grid size-8 place-items-center rounded-full transition ${stroke === width ? pressed : idle}`}
        >
          <span className="rounded-full bg-current" style={{ width: width * 2, height: width * 2 }} />
        </button>
      ))}
    </div>
  )
}
