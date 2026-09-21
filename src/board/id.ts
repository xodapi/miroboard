/**
 * Element identity. Extracted verbatim from App.tsx so the fallback ladder is
 * testable: `crypto.randomUUID` where it exists, `getRandomValues` where only
 * that does, and a Math.random last resort for environments with no Web Crypto
 * at all (which still has to produce ids that do not collide within a document).
 */
export function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  }
  // Final fallback (should never reach in modern browsers)
  return Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9)
}
