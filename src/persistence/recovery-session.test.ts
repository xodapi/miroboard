import { describe, expect, it } from 'vitest'
import {
  elementsFingerprint,
  getRecoverySession,
  RECOVERY_SESSION_KEY,
  recoveryFingerprint,
  inspectRecoverySession,
  type RecoverySession,
  setRecoverySession,
} from './recovery-session'

describe('recovery session metadata', () => {
  it('round-trips the file name and saved document fingerprint in a Yjs meta map', () => {
    const meta = new Map<string, unknown>()
    const session: RecoverySession = {
      fileName: 'process.mboard',
      savedContentFingerprint: 'abc123',
    }

    setRecoverySession(meta, session)

    expect(meta.get(RECOVERY_SESSION_KEY)).toEqual(session)
    expect(getRecoverySession(meta)).toEqual(session)
  })

  it('rejects malformed metadata instead of treating it as a file session', () => {
    const meta = new Map<string, unknown>([
      [RECOVERY_SESSION_KEY, { fileName: '', savedContentFingerprint: 42 }],
    ])

    expect(getRecoverySession(meta)).toBeNull()
  })

  it('changes when either board elements or persisted profile configuration changes', () => {
    const elements = [{ id: 'one', type: 'sticky', text: 'saved' }]
    const saved = recoveryFingerprint(elements, { bpmn: { simulation: { seed: '42' } } })

    expect(recoveryFingerprint(elements, { bpmn: { simulation: { seed: '42' } } })).toBe(saved)
    expect(recoveryFingerprint([{ ...elements[0], text: 'recovered' }], { bpmn: { simulation: { seed: '42' } } })).not.toBe(saved)
    expect(recoveryFingerprint(elements, { bpmn: { simulation: { seed: '43' } } })).not.toBe(saved)
  })

  it('fingerprints Yjs array JSON using the same representation as recovery comparison', () => {
    expect(elementsFingerprint([{ id: 'one' }])).toBe(elementsFingerprint([{ id: 'one' }]))
    expect(elementsFingerprint([{ id: 'one' }])).not.toBe(elementsFingerprint([{ id: 'two' }]))
  })

  it('reports a clean recovery when the cache matches the saved file', () => {
    const meta = new Map<string, unknown>()
    const elements = [{ id: 'one', type: 'sticky', text: 'saved' }]
    const profileConfig = { bpmn: { simulation: { seed: '42' } } }
    setRecoverySession(meta, {
      fileName: 'process.mboard',
      savedContentFingerprint: recoveryFingerprint(elements, profileConfig),
    })

    expect(inspectRecoverySession(meta, elements, profileConfig)).toEqual({
      session: {
        fileName: 'process.mboard',
        savedContentFingerprint: recoveryFingerprint(elements, profileConfig),
      },
      diverges: false,
      message: 'Восстановлено из локального кэша: файл «process.mboard» не содержит последние изменения.',
    })
  })

  it('reports divergence when recovered content is ahead of the saved file', () => {
    const meta = new Map<string, unknown>()
    const savedElements = [{ id: 'one', type: 'sticky', text: 'saved' }]
    const recoveredElements = [...savedElements, { id: 'two', type: 'sticky', text: 'local only' }]
    const profileConfig = { bpmn: { simulation: { seed: '42' } } }
    setRecoverySession(meta, {
      fileName: 'process.mboard',
      savedContentFingerprint: recoveryFingerprint(savedElements, profileConfig),
    })

    const inspection = inspectRecoverySession(meta, recoveredElements, profileConfig)

    expect(inspection?.diverges).toBe(true)
    expect(inspection?.session.fileName).toBe('process.mboard')
    expect(inspection?.message).toContain('локального кэша')
    expect(inspection?.message).toContain('process.mboard')
  })
})
