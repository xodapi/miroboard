import type { BoardElement } from '../board/types'
import type { Theme } from '../board/theme'
import { parseBounded } from '../board/numeric-input'

export interface BpmnTaskPropertiesProps {
  task: BoardElement
  theme: Theme
  onUpdate: (id: string, updates: Partial<BoardElement>) => void
}

/** Side panel geometry, shared with the sequence-flow panel so they line up. */
export const PROPERTY_PANEL_CLASS =
  'absolute right-3 top-[68px] z-30 flex w-72 max-w-[calc(100vw-24px)] flex-col gap-3 rounded-2xl p-4 shadow-xl border max-md:inset-x-3 max-md:top-auto max-md:bottom-20 max-md:w-auto max-md:max-h-[46vh] max-md:overflow-y-auto'

function fieldClass(theme: Theme, width: string) {
  return `${width} rounded-lg border px-2 py-1 text-[12px] outline-none ${theme.dark ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`
}

/** Durations are stored in milliseconds and edited in seconds. */
const MAX_DURATION_SECONDS = 3600

/**
 * Simulation parameters of a single BPMN task: how long it takes, who performs
 * it, what it costs and how it queues.
 *
 * Every input validates before writing: the simulation reads these numbers
 * directly, so a NaN or a negative duration would produce a nonsense run rather
 * than a visible error. Out-of-range input is ignored, leaving the last good
 * value in the document.
 */
export function BpmnTaskProperties({ task, theme, onUpdate }: BpmnTaskPropertiesProps) {
  const distribution = task.bpmnDurationDistribution || 'fixed'
  const label = `text-[11px] font-semibold ${theme.textSecondary}`
  const update = (updates: Partial<BoardElement>) => onUpdate(task.id, updates)

  /** Seconds in the UI, milliseconds in the document. */
  const msFromSeconds = (value: string) => {
    const seconds = parseBounded(value, { min: 0 })
    return seconds === undefined ? undefined : Math.round(seconds * 1000)
  }

  /** Applies a spread bound only when the field holds a usable number. */
  const updateSpread = (key: 'bpmnDurationMinMs' | 'bpmnDurationModeMs' | 'bpmnDurationMaxMs', value: string) => {
    const ms = msFromSeconds(value)
    if (ms !== undefined) update({ [key]: ms })
  }

  return (
    <aside
      className={`${PROPERTY_PANEL_CLASS} ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} ${theme.border}`}
      data-ui
      data-testid="bpmn-task-properties"
    >
      <div className="text-xs font-bold text-slate-400">Свойства задачи</div>
      <div className="grid grid-cols-2 gap-2">
        <label className={label} htmlFor="bpmn-duration">Длительность, с</label>
        <input
          id="bpmn-duration"
          type="number"
          min="0"
          max={MAX_DURATION_SECONDS}
          step="0.1"
          value={(task.bpmnDurationMs ?? 1000) / 1000}
          onChange={event => {
            const seconds = parseBounded(event.target.value, { min: 0 })
            // The maximum is a cap rather than a rejection: typing a big number
            // should land on the ceiling, not be refused mid-keystroke.
            if (seconds !== undefined) {
              update({ bpmnDurationMs: Math.round(Math.min(seconds, MAX_DURATION_SECONDS) * 1000) })
            }
          }}
          className={fieldClass(theme, 'w-16')}
        />

        <select
          value={distribution}
          onChange={event => update({
            bpmnDurationDistribution: event.target.value as 'fixed' | 'uniform' | 'triangular',
            // Seed the spread from the fixed duration, so switching to a
            // distribution does not start from an empty range.
            bpmnDurationMinMs: task.bpmnDurationMinMs ?? task.bpmnDurationMs ?? 1000,
            bpmnDurationModeMs: task.bpmnDurationModeMs ?? task.bpmnDurationMs ?? 1000,
            bpmnDurationMaxMs: task.bpmnDurationMaxMs ?? task.bpmnDurationMs ?? 1000,
          })}
          className={fieldClass(theme, '')}
        >
          <option value="fixed">Fixed</option>
          <option value="uniform">Uniform</option>
          <option value="triangular">Triangular</option>
        </select>

        {(distribution === 'uniform' || distribution === 'triangular') && (
          <>
            <label className={label}>Min
              <input
                type="number" min="0"
                value={(task.bpmnDurationMinMs ?? 1000) / 1000}
                onChange={event => updateSpread('bpmnDurationMinMs', event.target.value)}
                className={`ml-1 ${fieldClass(theme, 'w-14')}`}
              />
            </label>
            {distribution === 'triangular' && (
              <label className={label}>Mode
                <input
                  type="number" min="0"
                  value={(task.bpmnDurationModeMs ?? 1000) / 1000}
                  onChange={event => updateSpread('bpmnDurationModeMs', event.target.value)}
                  className={`ml-1 ${fieldClass(theme, 'w-14')}`}
                />
              </label>
            )}
            <label className={label}>Max
              <input
                type="number" min="0"
                value={(task.bpmnDurationMaxMs ?? 1000) / 1000}
                onChange={event => updateSpread('bpmnDurationMaxMs', event.target.value)}
                className={`ml-1 ${fieldClass(theme, 'w-14')}`}
              />
            </label>
          </>
        )}

        <label className={label}>Роль
          <input
            value={task.bpmnResourceRole || ''}
            placeholder="Аналитик"
            onChange={event => update({ bpmnResourceRole: event.target.value || undefined })}
            className={`ml-1 ${fieldClass(theme, 'w-20')}`}
          />
        </label>

        <label className={label}>€/ч
          <input
            type="number" min="0" step="0.01"
            value={task.bpmnCostPerHour ?? ''}
            onChange={event => {
              // Clearing the field is meaningful here: it removes the cost.
              const raw = event.target.value
              if (raw.trim() === '') { update({ bpmnCostPerHour: undefined }); return }
              const cost = parseBounded(raw, { min: 0 })
              if (cost !== undefined) update({ bpmnCostPerHour: cost })
            }}
            className={`ml-1 ${fieldClass(theme, 'w-16')}`}
          />
        </label>

        <label className={label}>Capacity
          <input
            type="number" min="1" max="1000" step="1"
            value={task.bpmnResourceCapacity ?? 1}
            onChange={event => {
              const capacity = parseBounded(event.target.value, { min: 1, max: 1000, integer: true })
              if (capacity !== undefined) update({ bpmnResourceCapacity: capacity })
            }}
            className={`ml-1 ${fieldClass(theme, 'w-14')}`}
          />
        </label>

        <label className={label}>Priority
          <input
            type="number" min="-100" max="100" step="1"
            value={task.bpmnPriority ?? 0}
            onChange={event => {
              const priority = parseBounded(event.target.value, { min: -100, max: 100, integer: true })
              if (priority !== undefined) update({ bpmnPriority: priority })
            }}
            className="ml-1 w-14 rounded-lg border border-slate-200 px-2 py-1 text-[12px] outline-none"
          />
        </label>
      </div>
    </aside>
  )
}
