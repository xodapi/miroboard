/**
 * Metadata stored inside the recovery Y.Doc alongside the board content.
 * FileSystemFileHandle objects cannot be serialized or restored after a browser
 * restart, so the cache keeps the stable display name and a fingerprint of the
 * last state written to that file instead.
 */
export const RECOVERY_SESSION_KEY = 'recoverySession'

export interface RecoverySession {
  fileName: string
  savedContentFingerprint: string
}

export interface RecoveryInspection {
  session: RecoverySession
  diverges: boolean
  message: string
}

interface RecoveryMetaStore {
  get(key: string): unknown
  set(key: string, value: unknown): unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Uses two independent 32-bit FNV-style accumulators. This is intentionally
 * synchronous because recovery metadata is checked during the first render;
 * it is a change detector, not a security or identity hash.
 */
function fingerprintString(value: string): string {
  let first = 2166136261
  let second = 16777619
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second ^ (code + index), 2246822519)
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${value.length}`
}

function serialiseForFingerprint(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch {
    // Yjs board values are expected to be JSON-safe. A fixed marker keeps a
    // malformed value from throwing during recovery detection.
    return '[unserialisable]'
  }
}

export function elementsFingerprint(elements: unknown[]): string {
  return fingerprintString(serialiseForFingerprint(elements))
}

export function recoveryFingerprint(elements: unknown[], profileConfig: unknown): string {
  return fingerprintString(serialiseForFingerprint({ elements, profileConfig }))
}

export function setRecoverySession(meta: RecoveryMetaStore, session: RecoverySession): void {
  meta.set(RECOVERY_SESSION_KEY, session)
}

export function createRecoverySession(fileName: string, elements: unknown[], profileConfig: unknown): RecoverySession {
  return { fileName, savedContentFingerprint: recoveryFingerprint(elements, profileConfig) }
}

export function getRecoverySession(meta: Pick<RecoveryMetaStore, 'get'>): RecoverySession | null {
  const value = meta.get(RECOVERY_SESSION_KEY)
  if (!isRecord(value) || typeof value.fileName !== 'string' || value.fileName.length === 0 || typeof value.savedContentFingerprint !== 'string') {
    return null
  }
  return {
    fileName: value.fileName,
    savedContentFingerprint: value.savedContentFingerprint,
  }
}

export function inspectRecoverySession(meta: Pick<RecoveryMetaStore, 'get'>, elements: unknown[], profileConfig: unknown): RecoveryInspection | null {
  const session = getRecoverySession(meta)
  if (!session) return null
  const diverges = recoveryFingerprint(elements, profileConfig) !== session.savedContentFingerprint
  return {
    session,
    diverges,
    message: `Восстановлено из локального кэша: файл «${session.fileName}» не содержит последние изменения.`,
  }
}
