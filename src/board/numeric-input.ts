/**
 * Reading numbers out of `<input type="number">`.
 *
 * The trap this exists for: a number input reports `''` — not the text the user
 * typed — whenever its contents cannot be parsed. `Number('')` is `0`, so the
 * obvious `const n = Number(event.target.value)` turns "abc" into a silent zero
 * and passes every `Number.isFinite` / `>= 0` guard on the way through.
 *
 * `''` also arrives legitimately, when the field is simply empty. Both cases
 * mean "no usable value right now", and the right response to both is to leave
 * the document alone rather than write a zero the user never asked for.
 */

/**
 * Parses a numeric field, or returns undefined when there is nothing usable.
 *
 * Callers should treat undefined as "ignore this event": the previous value
 * stays in the document, and the user can keep typing.
 */
export function parseNumericInput(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export interface NumericBounds {
  min?: number
  max?: number
  /** Reject non-integers rather than rounding them. */
  integer?: boolean
}

/**
 * Parses a numeric field and rejects anything outside the given bounds.
 *
 * Out-of-range input is rejected rather than clamped: clamping while someone is
 * mid-keystroke rewrites what they are typing. Where a maximum should be a cap
 * rather than a limit, the caller clamps the result itself.
 */
export function parseBounded(raw: string, bounds: NumericBounds = {}): number | undefined {
  const value = parseNumericInput(raw)
  if (value === undefined) return undefined
  if (bounds.integer && !Number.isInteger(value)) return undefined
  if (bounds.min !== undefined && value < bounds.min) return undefined
  if (bounds.max !== undefined && value > bounds.max) return undefined
  return value
}
