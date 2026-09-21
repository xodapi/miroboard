/** The paper colour behind the grids. Constant in both themes today. */
export const CANVAS_BACKGROUND = '#F7F8FC'

export interface CanvasBackgroundProps {
  dark: boolean
  snapGrid: boolean
  transform: { x: number; y: number; scale: number }
}

/**
 * The dotted paper under the board: two dot grids at different densities, plus
 * ruled lines when snapping is on.
 *
 * The patterns are panned and zoomed through patternTransform rather than being
 * redrawn, so the background costs the same at any scale or element count.
 *
 * Renders a <defs> and the backing rects together — they are one unit, and
 * splitting them would let a pattern id go referenced but undefined.
 */
export function CanvasBackground({ dark, snapGrid, transform }: CanvasBackgroundProps) {
  const pan = `translate(${transform.x},${transform.y}) scale(${transform.scale})`
  const ink = dark ? '#fff' : '#000'

  return (
    <>
      <defs>
        <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse" patternTransform={pan}>
          {/* Snapping makes the 40px dots meaningful, so they get bolder. */}
          <circle cx="0" cy="0" r={snapGrid ? 1.5 : 1} fill={ink} fillOpacity={snapGrid ? (dark ? 0.12 : 0.1) : (dark ? 0.05 : 0.06)} />
        </pattern>
        <pattern id="grid-large" width={200} height={200} patternUnits="userSpaceOnUse" patternTransform={pan}>
          <circle cx="0" cy="0" r={1.8} fill={ink} fillOpacity={dark ? 0.08 : 0.1} />
        </pattern>
        {snapGrid && (
          <pattern id="snap-grid" width={40} height={40} patternUnits="userSpaceOnUse" patternTransform={pan}>
            <line x1={0} y1={0} x2={40} y2={0} stroke={ink} strokeOpacity={0.04} strokeWidth={0.5} />
            <line x1={0} y1={0} x2={0} y2={40} stroke={ink} strokeOpacity={0.04} strokeWidth={0.5} />
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={CANVAS_BACKGROUND} />
      {snapGrid && <rect width="100%" height="100%" fill="url(#snap-grid)" />}
      <rect width="100%" height="100%" fill="url(#grid)" />
      <rect width="100%" height="100%" fill="url(#grid-large)" />
    </>
  )
}
