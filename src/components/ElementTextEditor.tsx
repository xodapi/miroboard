import type { CSSProperties } from 'react'

export interface ElementTextEditorProps {
  /** Text currently in the document. */
  text: string
  /** True while this element is the one being edited. */
  editing: boolean
  /** Draft text, owned by the caller so one editor is open at a time. */
  draft: string
  /** History preview is read-only: editing must not even appear to start. */
  readOnly: boolean
  /**
   * Single-line commits on Enter; multi-line needs Shift+Enter for a newline
   * and commits on a bare Enter.
   */
  multiline?: boolean
  className?: string
  style?: CSSProperties
  onDraftChange: (value: string) => void
  onBeginEdit: () => void
  /** The field's current value, so a commit in the same tick as the last keystroke is not stale. */
  onCommit: (value: string) => void
}

/**
 * In-place text editing for a board element.
 *
 * Sticky notes, text elements, rectangles and ellipses each had their own copy
 * of this — four near-identical blocks whose commit-on-blur and commit-on-Enter
 * logic was written out four times. They had already drifted: the rect and
 * ellipse inner handlers skipped the read-only check that the outer ones and the
 * other two shapes applied.
 *
 * That drift was visible. In a history preview a double-click on a rectangle
 * opened the editor and accepted typing, then discarded it silently on blur,
 * because the write is refused further down in updateElement. The document was
 * never at risk; the interface just lied about what it was doing.
 */
export function ElementTextEditor(props: ElementTextEditorProps) {
  const { text, editing, draft, readOnly, multiline = true, className, style } = props

  const beginEdit = (event: { stopPropagation: () => void }) => {
    // Stop the canvas from also treating this as a double-click on empty space.
    event.stopPropagation()
    if (readOnly) return
    props.onBeginEdit()
  }

  if (!editing) {
    return (
      <div className={className} style={style} onDoubleClick={beginEdit} data-testid="element-text">
        {text}
      </div>
    )
  }

  const commitFrom = (event: { currentTarget: { value: string } }) => {
    props.onCommit(event.currentTarget.value)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    // Shift+Enter inserts a newline in a multi-line field; everywhere else
    // Enter is "done".
    if (multiline && event.shiftKey) return
    event.preventDefault()
    commitFrom(event)
  }

  const shared = {
    autoFocus: true,
    value: draft,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => props.onDraftChange(event.target.value),
    onBlur: commitFrom,
    onKeyDown,
    className,
    style,
    'data-testid': 'element-text-input',
  }

  return multiline ? <textarea {...shared} /> : <input {...shared} />
}
