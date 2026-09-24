/**
 * The words on an arrow or a line.
 *
 * The chip is drawn after the bend grips so a caption sitting on the route
 * wins the hit. The shift is a delta from the middle of the route, not a
 * world point — the caller already resolved the anchor in the group's space.
 */
import { captionPoint } from '../board/label'
import type { Point } from '../board/types'
import { ElementTextEditor } from './ElementTextEditor'

export function LineCaption({
  anchor,
  text,
  offset,
  editing,
  draft,
  readOnly,
  onDraftChange,
  onBeginEdit,
  onCommit,
}: {
  anchor: Point
  text: string
  offset?: Point
  editing: boolean
  draft: string
  readOnly: boolean
  onDraftChange: (value: string) => void
  onBeginEdit: () => void
  onCommit: (value: string) => void
}) {
  const shown = (editing ? draft : text).trim()
  if (!editing && !shown) return null
  const at = captionPoint(anchor, offset)
  const width = editing ? 148 : Math.max(44, Math.min(240, shown.length * 7 + 18))
  if (editing) {
    return (
      <foreignObject data-label="" data-testid="line-label" x={at.x - width / 2} y={at.y - 14} width={width} height={28}>
        <ElementTextEditor
          text={text}
          editing
          draft={draft}
          readOnly={readOnly}
          multiline={false}
          className="w-full h-full bg-white text-center text-[12px] leading-7 outline-none rounded-md border border-slate-300"
          onDraftChange={onDraftChange}
          onBeginEdit={onBeginEdit}
          onCommit={onCommit}
        />
      </foreignObject>
    )
  }
  return (
    <g data-label="" data-testid="line-label" transform={`translate(${at.x},${at.y})`}>
      <rect x={-width / 2} y={-12} width={width} height={20} rx={6} fill="white" stroke="#CBD5E1" />
      <text textAnchor="middle" y={4} fontSize={12} fill="#1f2937" className="pointer-events-none">{shown}</text>
    </g>
  )
}
