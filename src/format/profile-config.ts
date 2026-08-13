import type { BpmnProfileConfig, ProfileConfig } from './types'

export type SimulationDraft = BpmnProfileConfig['simulation']

export const DEFAULT_BPMN_SIMULATION: SimulationDraft = {
  seed: '42',
  runs: '500',
  slaTargetSec: '',
  instances: '1',
  arrivalIntervalSec: '0',
  calendarStartHour: '',
  calendarEndHour: '',
  arrivalClasses: [],
  rolePolicies: {},
}

/** Returns BPMN settings only when the document explicitly enables that profile. */
export function bpmnSimulationFromProfileConfig(config: ProfileConfig): SimulationDraft | null {
  const simulation = config.bpmn?.simulation
  return simulation ? {
    ...simulation,
    arrivalClasses: simulation.arrivalClasses.map(item => ({ ...item })),
    rolePolicies: Object.fromEntries(Object.entries(simulation.rolePolicies).map(([role, policy]) => [role, { ...policy }])),
  } : null
}

export function withBpmnSimulation(config: ProfileConfig, simulation: SimulationDraft): ProfileConfig {
  return {
    ...config,
    bpmn: {
      simulation: {
        ...simulation,
        arrivalClasses: simulation.arrivalClasses.map(item => ({ ...item })),
        rolePolicies: Object.fromEntries(Object.entries(simulation.rolePolicies).map(([role, policy]) => [role, { ...policy }])),
      },
    },
  }
}
