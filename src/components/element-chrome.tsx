/**
 * The decorations drawn around an element: the history-preview highlight, the
 * selection outline and the resize handles.
 *
 * Every branch of renderElement repeated these by hand, which is how the corner
 * radii and the dash patterns drifted apart. They take an inverse-scale factor
 * because strokes and handles must keep a constant size on screen: at 4x zoom a
 * 2px outline would otherwise render 8px thick.
 */

/** Orange, matching HistoryPreviewBanner. */
const CHANGED_STROKE = '#F97316'
/** The selection blue used across the board. */
const SELECTION_STROKE = '#4D96FF'

export type ResizeCornerId = 'nw' | 'ne' | 'sw' | 'se'

export interface ChangedInPreviewProps {
  /** Inverse of the viewport scale: 1 / transform.scale. */
  invScale: number
  x: number
  y: number
  width: number
  height: number
  /** Corner radius, following the shape it surrounds. */
  radius: number
}

/** Marks an element that differs from the live document while previewing. */
export function ChangedInPreview({ invScale, x, y, width, height, radius }: ChangedInPreviewProps) {
  return (
    <rect
      x={x} y={y} width={width} height={height}
      fill="none"
      stroke={CHANGED_STROKE}
      strokeWidth={3 * invScale}
      strokeDasharray={`${6 * invScale}`}
      rx={radius}
      data-testid="changed-in-preview"
    />
  )
}

export interface SelectionOutlineProps {
  invScale: number
  x: number
  y: number
  width: number
  height: number
  radius: number
  /** Solid for a directly selected element, dashed for a derived highlight. */
  dashed?: boolean
}

export function SelectionOutline({ invScale, x, y, width, height, radius, dashed = false }: SelectionOutlineProps) {
  return (
    <rect
      x={x} y={y} width={width} height={height}
      fill="none"
      stroke={SELECTION_STROKE}
      strokeWidth={2 * invScale}
      strokeDasharray={dashed ? `${4 * invScale}` : undefined}
      rx={radius}
      data-testid="selection-outline"
    />
  )
}

export interface ResizeHandlesProps {
  invScale: number
  width: number
  height: number
}

/**
 * The four corner grips.
 *
 * Single selection only: resizing several elements at once needs an anchor and
 * a scaling rule that the board does not have yet. The `data-resize` attribute
 * is what the pointer handler reads to start a resize gesture.
 */
export function ResizeHandles({ invScale, width, height }: ResizeHandlesProps) {
  const corners: [ResizeCornerId, number, number][] = [
    ['nw', -6, -6],
    ['ne', width - 2, -6],
    ['sw', -6, height - 2],
    ['se', width - 2, height - 2],
  ]

  return (
    <>
      {corners.map(([corner, cx, cy]) => (
        <circle
          key={corner}
          data-resize={corner}
          cx={cx} cy={cy} r={7 * invScale}
          fill="white"
          stroke={SELECTION_STROKE}
          strokeWidth={2 * invScale}
          className="cursor-nwse-resize"
          style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))' }}
        />
      ))}
    </>
  )
}
