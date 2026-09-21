import type { Theme } from '../board/theme'

export interface ZoomControlsProps {
  theme: Theme
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToContent: () => void
}

export function ZoomControls({ theme, scale, onZoomIn, onZoomOut, onFitToContent }: ZoomControlsProps) {
  const surface = `${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${theme.border}`
  const button = `size-10 grid place-items-center ${theme.hoverBg} ${theme.textSecondary}`

  return (
    <div className="absolute right-3 bottom-[120px] z-20 flex flex-col gap-1.5" data-ui data-testid="zoom-controls">
      <div className={`flex flex-col rounded-2xl ${surface} overflow-hidden`}>
        <button onClick={onZoomIn} className={button} aria-label="Увеличить" title="Увеличить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <div className={`h-px ${theme.divider}`} />
        <button onClick={onZoomOut} className={button} aria-label="Уменьшить" title="Уменьшить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /></svg>
        </button>
        <div className={`h-px ${theme.divider}`} />
        <button onClick={onFitToContent} title="Подогнать содержимое (0)" aria-label="Подогнать содержимое" className={button}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
      <div
        className={`h-8 px-2.5 grid place-items-center rounded-xl ${surface} text-[11px] font-medium ${theme.dark ? 'text-slate-300' : 'text-black/60'} tabular-nums`}
        data-testid="zoom-level"
      >
        {Math.round(scale * 100)}%
      </div>
    </div>
  )
}

export interface ElementCountProps {
  theme: Theme
  count: number
}

/**
 * A read-out of how many elements the board holds.
 *
 * pointer-events-none is load-bearing: the badge floats over the top-left of the
 * canvas, which is where a marquee naturally starts. Without it the badge
 * swallowed the pointerdown and the rubber band never appeared.
 */
export function ElementCount({ theme, count }: ElementCountProps) {
  return (
    <div
      className={`pointer-events-none absolute top-[60px] left-3 z-10 h-6 px-2.5 rounded-full ${theme.dark ? 'bg-slate-800/80 border-slate-600' : 'bg-white/80 border-black/5'} border backdrop-blur-sm text-[11px] font-medium ${theme.dark ? 'text-slate-400' : 'text-black/40'} flex items-center gap-1`}
      data-testid="element-count"
    >
      {count} элем.
    </div>
  )
}
