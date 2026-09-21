/**
 * Local participant profile.
 *
 * The board used to identify its author with a bare random UUID in
 * `localStorage['miro-author-id']`, which is enough to attribute an element but
 * useless to a human: nobody can tell "who" 3f9c… is, and nothing in the UI
 * ever showed it. A collaboration session needs a name and a stable colour
 * before it needs a transport, so this is the first piece of the collaboration
 * foundation rather than a cosmetic addition.
 *
 * Deliberately local-only: no accounts, no server, no sync. The profile is
 * device state, exactly like the onboarding flag. What ends up in the document
 * is `createdBy` on nodes plus (later) an author registry — see
 * docs/COLLABORATION_ANALYSIS.md, section 3.
 */

export const PROFILE_STORAGE_KEY = 'miro-user-profile'

/** Legacy key kept readable so existing documents keep their author identity. */
export const LEGACY_AUTHOR_ID_KEY = 'miro-author-id'

export interface UserProfile {
  readonly id: string
  readonly name: string
  readonly color: string
}

/**
 * Participant colours, chosen to stay distinguishable on both the light and the
 * dark canvas and to not collide with the sticky-note palette semantics.
 */
export const PARTICIPANT_COLORS = [
  '#4D96FF', '#FF5D5D', '#6BCB77', '#9D65C9',
  '#FF9F43', '#00A8A8', '#EC4899', '#F59E0B',
] as const

export const DEFAULT_PROFILE_NAME = 'Участник'

/** FNV-1a: tiny, stable across platforms, and good enough for a colour pick. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Derives a participant colour that is stable for a given author id. */
export function colorForId(id: string): string {
  return PARTICIPANT_COLORS[hash(id) % PARTICIPANT_COLORS.length]
}

/**
 * The single leading character for an avatar, upper-cased.
 *
 * Singular by design: the avatar is a 32px circle and one glyph reads cleanly at
 * that size, including for names that are one word or start with an emoji. It
 * was called initialsOf, which implied the usual two-letter treatment and set
 * the wrong expectation for anyone reading a call site.
 */
export function initialOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '•'
  return [...trimmed][0].toUpperCase()
}

export function createProfile(id: string, name = DEFAULT_PROFILE_NAME, color = colorForId(id)): UserProfile {
  return { id, name: name.trim() || DEFAULT_PROFILE_NAME, color }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Reads the stored profile, adopting the legacy anonymous author id when this
 * is the first run after the upgrade. Never throws: a corrupted or unavailable
 * store must not stop the editor from opening.
 */
export function readProfile(storage: Pick<Storage, 'getItem'>, generateId: () => string): UserProfile {
  let raw: string | null = null
  try {
    raw = storage.getItem(PROFILE_STORAGE_KEY)
  } catch {
    raw = null
  }
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed) && typeof parsed.id === 'string' && parsed.id) {
        return createProfile(
          parsed.id,
          typeof parsed.name === 'string' ? parsed.name : DEFAULT_PROFILE_NAME,
          typeof parsed.color === 'string' && parsed.color ? parsed.color : colorForId(parsed.id),
        )
      }
    } catch {
      // fall through to the legacy/new-profile path
    }
  }

  let legacyId: string | null = null
  try {
    legacyId = storage.getItem(LEGACY_AUTHOR_ID_KEY)
  } catch {
    legacyId = null
  }
  const id = legacyId || generateId()
  return createProfile(id)
}

/** Persists the profile. Fail-soft: private mode and full quota are normal. */
export function writeProfile(storage: Pick<Storage, 'setItem'>, profile: UserProfile): void {
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // A profile that cannot be stored simply will not survive a reload.
  }
}

/** Returns a copy with the new name, normalising empties to the default. */
export function withName(profile: UserProfile, name: string): UserProfile {
  return { ...profile, name: name.trim() || DEFAULT_PROFILE_NAME }
}

/** Returns a copy with a new colour, keeping the id (and thus attribution) intact. */
export function withColor(profile: UserProfile, color: string): UserProfile {
  return { ...profile, color }
}
