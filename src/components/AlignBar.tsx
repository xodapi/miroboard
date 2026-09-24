import type { AlignAxis } from '../board/arrange'
import type { Theme } from '../board/theme'

export interface AlignBarProps {
  theme: Theme
  onAlign: (axis: AlignAxis) => void
}

const chip = 'h-8 rounded-lg px-2.5 text-[12px] font-semibold transition active:scale-95'

const AXES: { axis: AlignAxis; label: string }[] = [
  { axis: 'left', label: 'Слева' },
  { axis: 'centerX', label: 'Центр' },
  { axis: 'right', label: 'Справа' },
  { axis: 'top', label: 'Сверху' },
  { axis: 'centerY', label: 'Середина' },
  { axis: 'bottom', label: 'Снизу' },
]

/**
 * Edge and center alignment for a multi-selection.
 *
 * Same dock as the stroke bar: those two never show together, because a line
 * style is a single selection. Not six buttons in the header — that row is
 * already full.
 */
export function AlignBar({ theme, onAlign }: AlignBarProps) {
  const idle = `${theme.textSecondary} ${theme.hoverBg}`
  return (
    <div
      className={`absolute left-1/2 bottom-[104px] z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border p-1.5 shadow-xl ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} ${theme.border}`}
      data-ui
      data-testid="align-bar"
    >
      {AXES.map((action, index) => (
        <span key={action.axis} className="contents">
          {index === 3 && <div className={`mx-0.5 h-6 w-px ${theme.divider}`} />}
          <button
            type="button"
            className={`${chip} ${idle}`}
            aria-label={`Выровнять: ${action.label}`}
            onClick={() => onAlign(action.axis)}
          >
            {action.label}
          </button>
        </span>
      ))}
    </div>
  )
}
