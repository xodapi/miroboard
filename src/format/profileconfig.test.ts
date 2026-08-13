import { describe, expect, it } from 'vitest'
import { deserialise, serialise } from './mboard'
import { bpmnSimulationFromProfileConfig, withBpmnSimulation } from './profile-config'
import type { DocHistory, DocMeta } from './types'

const meta: DocMeta = {
  id: 'doc_profile-config',
  title: 'Simulation fidelity',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: '0.16.0', commit: 'test' },
  profiles: ['core'],
}

const history: DocHistory = {
  yjsState: null,
  snapshots: [],
  retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [], maxSnapshots: 120, maxHistoryRatio: 3 },
}

describe('profileConfig simulation fidelity', () => {
  it('round-trips every UI-held simulation value as an exact string', () => {
    const simulation = {
      seed: '042',
      runs: '00100',
      slaTargetSec: '000.25',
      instances: '0002',
      arrivalIntervalSec: '00.50',
      calendarStartHour: '08.00',
      calendarEndHour: '17.50',
      arrivalClasses: [
        { count: '002', intervalSec: '00.25', priority: '03' },
        { count: '001', intervalSec: '10.00', priority: '-01' },
      ],
      rolePolicies: {
        operations: { capacity: '004', queuePolicy: 'priority' as const },
        review: { capacity: '001', queuePolicy: 'fifo' as const },
      },
    }
    const profileConfig = withBpmnSimulation({ mindmap: { layout: 'radial' } }, simulation)

    const file = serialise({ elements: [], meta, profileConfig, history })
    const reloaded = deserialise(file)

    expect(reloaded.profileConfig).toEqual(profileConfig)
    expect(bpmnSimulationFromProfileConfig(reloaded.profileConfig)).toEqual(simulation)
    expect(file.profileConfig.bpmn?.simulation).toEqual(simulation)
    expect(file.profileConfig.mindmap).toEqual({ layout: 'radial' })
  })

  it('preserves arrival-class order and clones every nested parameter', () => {
    const source = {
      seed: '42', runs: '500', slaTargetSec: '', instances: '1', arrivalIntervalSec: '0',
      calendarStartHour: '', calendarEndHour: '',
      arrivalClasses: [
        { count: '10', intervalSec: '1', priority: '2' },
        { count: '20', intervalSec: '2', priority: '1' },
      ],
      rolePolicies: { ops: { capacity: '2', queuePolicy: 'fifo' as const } },
    }
    const config = withBpmnSimulation({}, source)
    const restored = bpmnSimulationFromProfileConfig(config)
    if (!restored) throw new Error('expected BPMN simulation')

    source.arrivalClasses[0].priority = 'changed'
    source.rolePolicies.ops.capacity = 'changed'

    expect(restored.arrivalClasses).toEqual([
      { count: '10', intervalSec: '1', priority: '2' },
      { count: '20', intervalSec: '2', priority: '1' },
    ])
    expect(restored.rolePolicies).toEqual({ ops: { capacity: '2', queuePolicy: 'fifo' } })
  })
})
