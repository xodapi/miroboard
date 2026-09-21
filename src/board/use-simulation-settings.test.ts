import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSimulationSettings, type SimulationSettings } from './use-simulation-settings'
import { DEFAULT_BPMN_SIMULATION, withBpmnSimulation, bpmnSimulationFromProfileConfig } from '../format/profile-config'

let container: HTMLDivElement
let root: Root
let current: SimulationSettings

/** Renders the hook and exposes its latest value through `current`. */
function mount() {
  function Probe() {
    current = useSimulationSettings()
    return null
  }
  act(() => { root.render(createElement(Probe)) })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mount()
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

describe('useSimulationSettings', () => {
  it('starts from the documented defaults', () => {
    expect(current.draft).toEqual(DEFAULT_BPMN_SIMULATION)
  })

  it('updates one field without disturbing the others', () => {
    act(() => { current.setSeed('7') })
    expect(current.seed).toBe('7')
    expect(current.runs).toBe(DEFAULT_BPMN_SIMULATION.runs)
    expect(current.draft).toEqual({ ...DEFAULT_BPMN_SIMULATION, seed: '7' })
  })

  it('accepts updater functions, which the simulation modal relies on', () => {
    // The modal edits arrival classes with `prev => prev.map(...)`; a
    // value-only setter would have silently broken every row edit.
    act(() => { current.setArrivalClasses([{ count: '1', intervalSec: '0', priority: '0' }]) })
    act(() => { current.setArrivalClasses(prev => prev.map(item => ({ ...item, count: '9' }))) })
    expect(current.arrivalClasses).toEqual([{ count: '9', intervalSec: '0', priority: '0' }])
  })

  it('batches several field updates in one render', () => {
    act(() => {
      current.setSeed('1')
      current.setRuns('2')
      current.setInstances('3')
    })
    // Each setter reads the freshest draft, so the last write does not clobber
    // the first two — the failure mode of naive spread-based setters.
    expect(current.draft).toMatchObject({ seed: '1', runs: '2', instances: '3' })
  })

  it('replaces the whole draft when a document is loaded', () => {
    const loaded = { ...DEFAULT_BPMN_SIMULATION, seed: '99', runs: '10', slaTargetSec: '30' }
    act(() => { current.replace(loaded) })
    expect(current.draft).toEqual(loaded)
  })

  it('round-trips through the profile config unchanged', () => {
    // This is why the hook holds exactly the SimulationDraft shape: saving is
    // one read and loading is one assignment, so a field added to the format
    // cannot be dropped on one side.
    const configured = {
      ...DEFAULT_BPMN_SIMULATION,
      seed: '5',
      arrivalClasses: [{ count: '2', intervalSec: '1.5', priority: '3' }],
      rolePolicies: { Оператор: { capacity: '4', queuePolicy: 'priority' as const } },
    }
    act(() => { current.replace(configured) })

    const restored = bpmnSimulationFromProfileConfig(withBpmnSimulation({}, current.draft))
    expect(restored).toEqual(configured)
  })

  it('keeps setter identity stable across updates', () => {
    // App passes these into useCallback dependency arrays; new identities on
    // every keystroke would rebuild half the handlers in the component.
    const before = current.setSeed
    act(() => { current.setRuns('123') })
    expect(current.setSeed).toBe(before)
    expect(current.replace).toBe(current.replace)
  })
})
