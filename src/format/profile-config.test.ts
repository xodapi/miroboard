import { describe, expect, it } from 'vitest'
import { bpmnSimulationFromProfileConfig, DEFAULT_BPMN_SIMULATION, withBpmnSimulation } from './profile-config'

describe('profileConfig BPMN activation', () => {
  it('does not activate BPMN for an absent or non-BPMN profileConfig', () => {
    expect(bpmnSimulationFromProfileConfig({})).toBeNull()
    expect(bpmnSimulationFromProfileConfig({ mindmap: { layout: 'radial' } })).toBeNull()
  })

  it('round-trips every simulation draft value without sharing mutable collections', () => {
    const simulation = {
      ...DEFAULT_BPMN_SIMULATION,
      seed: '042',
      arrivalClasses: [{ count: '2', intervalSec: '0.5', priority: '3' }],
      rolePolicies: { ops: { capacity: '4', queuePolicy: 'priority' as const } },
    }
    const config = withBpmnSimulation({ mindmap: { layout: 'radial' } }, simulation)

    expect(bpmnSimulationFromProfileConfig(config)).toEqual(simulation)
    simulation.arrivalClasses[0].count = 'changed'
    expect(config.bpmn?.simulation.arrivalClasses[0].count).toBe('2')
  })
})
