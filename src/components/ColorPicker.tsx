import { STICKY_COLORS } from '../board/palette'
import type { Theme } from '../board/theme'

export interface ColorPickerProps {
  theme: Theme
  onPick: (color: string) => void
}

/**
 * Fill colours for the selected sticky, rectangle or ellipse, docked above the
 * bottom toolbar.
 *
 * Picking sets both `color` and `fill` — for these shapes the palette means
 * "the colour of the thing", not a separate stroke and fill.
 */
export function ColorPicker({ theme, onPick }: ColorPickerProps) {
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 bottom-[104px] z-30 flex items-center gap-1 p-1.5 rounded-2xl ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${theme.border}`}
      data-ui
      data-testid="color-picker"
    >
      {STICKY_COLORS.map(color => (
        <button
          key={color}
          onClick={() => onPick(color)}
          className="size-7 rounded-full ring-1 ring-black/10 active:scale-90 transition"
          style={{ background: color }}
          aria-label={`Цвет ${color}`}
        />
      ))}
    </div>
  )
}
