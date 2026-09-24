/**
 * UI preferences that used to die with the tab.
 *
 * Theme, grid, minimap, ink colour and stroke are device state, like the
 * onboarding flag — not document state. Putting them in the .mboard file would
 * make one person's dark theme travel with a shared file. localStorage keeps
 * them on this machine and adds no dependency and no network.
 */

export const UI_PREFS_KEY = 'miro-ui-prefs'

export interface UiPreferences {
  readonly darkMode: boolean
  readonly snapGrid: boolean
  readonly showMiniMap: boolean
  readonly color: string
  readonly strokeWidth: number
  /** Creation default for the next arrow or line. Not written into the .mboard file. */
  readonly lineDash: 'solid' | 'dashed'
  /** Creation default for the next arrow or line. Not written into the .mboard file. */
  readonly arrowHead: 'none' | 'triangle'
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  darkMode: false,
  snapGrid: false,
  showMiniMap: true,
  color: '#000000',
  strokeWidth: 3,
  lineDash: 'solid',
  arrowHead: 'triangle',
}

const MAX_COLOR_LENGTH = 32
const MIN_STROKE = 1
const MAX_STROKE = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function colorOrDefault(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_UI_PREFERENCES.color
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_COLOR_LENGTH) return DEFAULT_UI_PREFERENCES.color
  return trimmed
}

function strokeOrDefault(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_UI_PREFERENCES.strokeWidth
  if (value < MIN_STROKE || value > MAX_STROKE) return DEFAULT_UI_PREFERENCES.strokeWidth
  return value
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function lineDashOrDefault(value: unknown): UiPreferences['lineDash'] {
  return value === 'dashed' ? 'dashed' : DEFAULT_UI_PREFERENCES.lineDash
}

function arrowHeadOrDefault(value: unknown): UiPreferences['arrowHead'] {
  return value === 'none' || value === 'triangle' ? value : DEFAULT_UI_PREFERENCES.arrowHead
}

/** Never throws. A corrupt or missing store is a first run, not an error. */
export function readUiPreferences(storage: Pick<Storage, 'getItem'>): UiPreferences {
  let raw: string | null = null
  try {
    raw = storage.getItem(UI_PREFS_KEY)
  } catch {
    return DEFAULT_UI_PREFERENCES
  }
  if (!raw) return DEFAULT_UI_PREFERENCES
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return DEFAULT_UI_PREFERENCES
    return {
      darkMode: flag(parsed.darkMode, DEFAULT_UI_PREFERENCES.darkMode),
      snapGrid: flag(parsed.snapGrid, DEFAULT_UI_PREFERENCES.snapGrid),
      showMiniMap: flag(parsed.showMiniMap, DEFAULT_UI_PREFERENCES.showMiniMap),
      color: colorOrDefault(parsed.color),
      strokeWidth: strokeOrDefault(parsed.strokeWidth),
      lineDash: lineDashOrDefault(parsed.lineDash),
      arrowHead: arrowHeadOrDefault(parsed.arrowHead),
    }
  } catch {
    return DEFAULT_UI_PREFERENCES
  }
}

/** Fail-soft: private mode and a full quota must not break the editor. */
export function writeUiPreferences(storage: Pick<Storage, 'setItem'>, prefs: UiPreferences): void {
  try {
    storage.setItem(UI_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Preferences that cannot be stored simply will not survive a reload.
  }
}
