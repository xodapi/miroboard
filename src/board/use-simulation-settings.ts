import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_BPMN_SIMULATION, type SimulationDraft } from '../format/profile-config'

export type ArrivalClassDraft = SimulationDraft['arrivalClasses'][number]
export type RolePolicyDraft = SimulationDraft['rolePolicies'][string]

/**
 * One setter per field, each accepting a value or an updater, so callers keep
 * reading exactly like useState.
 *
 * The fields are strings because they bind straight to text and number inputs.
 * An empty string means "not set" and is coerced at the engine boundary, not
 * here — see createBpmnModel.
 */
export interface SimulationSettings extends SimulationDraft {
  /** The whole draft, ready to persist into the profile config. */
  draft: SimulationDraft
  setSeed: Dispatch<SetStateAction<string>>
  setRuns: Dispatch<SetStateAction<string>>
  setSlaTargetSec: Dispatch<SetStateAction<string>>
  setInstances: Dispatch<SetStateAction<string>>
  setArrivalIntervalSec: Dispatch<SetStateAction<string>>
  setCalendarStartHour: Dispatch<SetStateAction<string>>
  setCalendarEndHour: Dispatch<SetStateAction<string>>
  setArrivalClasses: Dispatch<SetStateAction<ArrivalClassDraft[]>>
  setRolePolicies: Dispatch<SetStateAction<Record<string, RolePolicyDraft>>>
  /** Adopt a whole draft at once — loading a document or an example. */
  replace: Dispatch<SetStateAction<SimulationDraft>>
}

/**
 * The Monte Carlo simulation inputs, as one value.
 *
 * These nine fields were nine separate useState calls that always travelled
 * together: written as a group when a document or an example loads, read as a
 * group to build the profile config, and listed as a group in three dependency
 * arrays. Splitting them bought nothing and cost a nine-line rebuild of the same
 * object DEFAULT_BPMN_SIMULATION already describes.
 *
 * Holding the exact shape of SimulationDraft is the point: loading becomes one
 * assignment and saving one read, so a field added to the on-disk format cannot
 * be silently dropped on one side.
 */
export function useSimulationSettings(): SimulationSettings {
  const [draft, setDraft] = useState<SimulationDraft>(DEFAULT_BPMN_SIMULATION)

  // Each setter takes a value or an updater, like the useState calls it
  // replaces — the simulation modal edits arrival classes and role policies
  // through `prev => …`, which a value-only setter would have broken.
  // Built once. Folding them into the value memo below would hand out new
  // setter identities on every keystroke, and App feeds these into useCallback
  // dependency arrays.
  const setters = useMemo(() => {
    const field = <K extends keyof SimulationDraft>(key: K): Dispatch<SetStateAction<SimulationDraft[K]>> =>
      action => setDraft(current => ({
        ...current,
        [key]: typeof action === 'function'
          ? (action as (prev: SimulationDraft[K]) => SimulationDraft[K])(current[key])
          : action,
      }))
    return {
      setSeed: field('seed'),
      setRuns: field('runs'),
      setSlaTargetSec: field('slaTargetSec'),
      setInstances: field('instances'),
      setArrivalIntervalSec: field('arrivalIntervalSec'),
      setCalendarStartHour: field('calendarStartHour'),
      setCalendarEndHour: field('calendarEndHour'),
      setArrivalClasses: field('arrivalClasses'),
      setRolePolicies: field('rolePolicies'),
      replace: setDraft,
    }
  }, [])

  return useMemo(() => ({ ...draft, draft, ...setters }), [draft, setters])
}
