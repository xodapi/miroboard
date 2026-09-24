import { COLORS, STICKY_COLORS } from '../board/palette'
import { isNoFill, NO_FILL, type PaintChannel } from '../board/paint'
import type { Theme } from '../board/theme'

export interface ColorPickerProps {
  theme: Theme
  /** Channels this selection actually paints. One row per channel, never a combined write. */
  channels: readonly PaintChannel[]
  fill?: string
  stroke?: string
  onPick: (channel: PaintChannel, color: string) => void
}

function rowLabel(channel: PaintChannel, alone: boolean): string {
  if (alone) return 'Цвет'
  return channel === 'fill' ? 'Заливка' : 'Обводка'
}

/**
 * Swatches for one channel.
 *
 * A lone row keeps the sticky palette, including for a BPMN glyph whose accent
 * was always chosen from it. A shape's stroke row adds black and white, which
 * a note colour does not need.
 */
function swatchesFor(channel: PaintChannel, alone: boolean): readonly string[] {
  if (channel === 'fill' || alone) return STICKY_COLORS
  return COLORS
}

/**
 * Fill and stroke for the selected sticky, rectangle or ellipse, docked above
 * the bottom toolbar.
 *
 * A sticky note has no stroke, and a BPMN glyph is drawn from its accent, so
 * those selections get one row. A rectangle or ellipse gets both, and picking
 * one does not write the other.
 */
export function ColorPicker({ theme, channels, fill, stroke, onPick }: ColorPickerProps) {
  if (channels.length === 0) return null
  const alone = channels.length === 1
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 ${alone ? 'bottom-[104px]' : 'bottom-[168px]'} z-30 flex flex-col gap-1.5 p-1.5 rounded-2xl ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${theme.border}`}
      data-ui
      data-testid="color-picker"
    >
      {channels.map(channel => {
        const label = rowLabel(channel, alone)
        const current = channel === 'fill' ? fill : stroke
        return (
          <div key={channel} className="flex items-center gap-1" data-testid={`paint-${channel}`}>
            {!alone && (
              <span className={`w-16 shrink-0 pl-1 text-[10px] font-semibold uppercase tracking-wide ${theme.textSecondary}`}>
                {label}
              </span>
            )}
            {swatchesFor(channel, alone).map(color => {
              const pressed = current?.toLowerCase() === color.toLowerCase()
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => onPick(channel, color)}
                  className="size-7 rounded-full ring-1 ring-black/10 active:scale-90 transition"
                  style={{
                    background: color,
                    border: color === '#FFFFFF' ? '1px solid rgba(0,0,0,0.15)' : undefined,
                    boxShadow: pressed ? '0 0 0 2px white, 0 0 0 4px #4D96FF' : undefined,
                  }}
                  aria-label={`${label} ${color}`}
                  aria-pressed={pressed}
                />
              )
            })}
            {channel === 'fill' && !alone && (
              <button
                type="button"
                data-testid="fill-none"
                onClick={() => onPick('fill', NO_FILL)}
                className="size-7 rounded-full ring-1 ring-black/10 active:scale-90 transition bg-white"
                style={{
                  backgroundImage: 'linear-gradient(to top right, transparent calc(50% - 1px), #FF5D5D, transparent calc(50% + 1px))',
                  boxShadow: isNoFill(fill) ? '0 0 0 2px white, 0 0 0 4px #4D96FF' : undefined,
                }}
                aria-label="Без заливки"
                aria-pressed={isNoFill(fill)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
