/**
 * Stroke style of a selected arrow or line, including a BPMN connector.
 *
 * Thickness is the existing `stroke` number. The arrowhead is the element
 * type: `arrow` draws a triangle, `line` does not. A connector stays an edge
 * either way — `bpmnFlow` is what makes it a connector, not the head — so
 * turning the head off must not send it through the freeform line renderer,
 * which positions from the frame instead of the anchors.
 *
 * Dash is the only new field. It is written only as `'dashed'`; absence is
 * solid, the same way `locked` is written only as `true`.
 */

export const LINE_STROKE_WIDTHS = [2, 4, 7, 12] as const

export type ArrowHead = 'none' | 'triangle'
export type LineDash = 'solid' | 'dashed'

/** World-space dash. It scales with the line, unlike the selection outline. */
export const LINE_DASHARRAY = '8 6'

export type StrokeStylePatch = {
  arrowHead?: ArrowHead
  dash?: LineDash
  stroke?: number
}

export function isLineElement(element: { type?: string } | null | undefined): boolean {
  return element?.type === 'arrow' || element?.type === 'line'
}

export function arrowHeadOf(element: { type?: string }): ArrowHead {
  return element.type === 'arrow' ? 'triangle' : 'none'
}

export function dashOf(element: { dash?: string }): LineDash {
  return element.dash === 'dashed' ? 'dashed' : 'solid'
}

export function strokeDasharray(element: { dash?: string }): string | undefined {
  return dashOf(element) === 'dashed' ? LINE_DASHARRAY : undefined
}

/**
 * Next element after a style edit.
 *
 * Returns the same object when nothing would change, so a no-op write can
 * skip the transaction. Solid deletes `dash` rather than setting it to
 * `undefined`: a spread of `undefined` would leave the key on the record.
 */
export function withStrokeStyle<T extends { type: string; dash?: 'dashed'; stroke?: number }>(
  element: T,
  patch: StrokeStylePatch,
): T {
  if (!isLineElement(element)) return element
  let next = element
  if (patch.arrowHead && patch.arrowHead !== arrowHeadOf(element)) {
    next = { ...next, type: patch.arrowHead === 'triangle' ? 'arrow' : 'line' }
  }
  if (patch.dash && patch.dash !== dashOf(next)) {
    if (patch.dash === 'dashed') {
      next = { ...next, dash: 'dashed' }
    } else {
      const cleared = { ...next }
      delete cleared.dash
      next = cleared
    }
  }
  if (patch.stroke !== undefined && Number.isFinite(patch.stroke) && patch.stroke > 0 && patch.stroke !== next.stroke) {
    next = { ...next, stroke: patch.stroke }
  }
  return next
}
