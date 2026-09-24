/**
 * Separate fill and stroke.
 *
 * The file already stores them apart (`style.fill` and `style.color`). The
 * palette used to write both from one click, so a rectangle could not have a
 * yellow interior and a black outline. A click now writes exactly one field.
 *
 * Which field is paintable depends on what the renderer actually reads:
 * a sticky paints `fill`, a BPMN node paints `color`, a rectangle or ellipse
 * paints both. A connector follows its endpoints and is not recolored here.
 */

export type PaintChannel = 'fill' | 'stroke'

/** The in-memory spelling of "no interior". The file stores it as a string, not null. */
export const NO_FILL = 'transparent'

export function paintChannels(element: {
  type?: string
  bpmnNodeType?: string
  bpmnFlow?: unknown
} | null | undefined): PaintChannel[] {
  if (!element || element.bpmnFlow) return []
  // A BPMN glyph is drawn from `color` even though the element is stored as a sticky.
  if (element.bpmnNodeType) return ['stroke']
  if (element.type === 'sticky') return ['fill']
  if (element.type === 'rect' || element.type === 'circle') return ['fill', 'stroke']
  return []
}

/**
 * The document patch for one swatch. The other field is absent, so an update
 * of the selection cannot paint it by accident.
 */
export function paintPatch(channel: PaintChannel, color: string): { fill: string } | { color: string } {
  return channel === 'fill' ? { fill: color } : { color }
}

/** True when the renderer will draw no interior. */
export function isNoFill(fill: string | null | undefined): boolean {
  return fill == null || fill === '' || fill === NO_FILL || fill === 'none'
}
