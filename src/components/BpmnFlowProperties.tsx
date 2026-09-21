import type { BoardElement } from '../board/types'
import type { Theme } from '../board/theme'
import { parseBounded } from '../board/numeric-input'
import { PROPERTY_PANEL_CLASS } from './BpmnTaskProperties'

export interface BpmnFlowPropertiesProps {
  flow: BoardElement
  /** True when the flow leaves an XOR gateway, where branch weights apply. */
  isXorBranch: boolean
  theme: Theme
  onUpdate: (id: string, updates: Partial<BoardElement>) => void
}

/**
 * Properties of a sequence flow: its kind, its guard condition, and — only for
 * branches out of an XOR gateway — the branch probability and the default flag.
 *
 * Probability and «default» are hidden elsewhere because they are meaningless
 * there: a flow out of a parallel gateway is always taken.
 */
export function BpmnFlowProperties({ flow, isXorBranch, theme, onUpdate }: BpmnFlowPropertiesProps) {
  const label = `text-[11px] font-semibold ${theme.textSecondary}`
  const field = `rounded-lg border px-2 py-1 text-[12px] outline-none ${theme.dark ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`
  // The panel only renders for elements that carry a bpmnFlow, so spreading the
  // existing flow keeps every field the editor does not expose.
  const patch = (updates: Partial<NonNullable<BoardElement['bpmnFlow']>>) =>
    onUpdate(flow.id, { bpmnFlow: { ...flow.bpmnFlow!, ...updates } })

  return (
    <aside
      className={`${PROPERTY_PANEL_CLASS} ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} ${theme.border}`}
      data-ui
      data-testid="bpmn-flow-properties"
    >
      <div className="text-xs font-bold text-slate-400">Свойства sequence flow</div>
      <div className="flex flex-col gap-3">
        <label className={label} htmlFor="bpmn-flow-type">Тип потока</label>
        <select
          id="bpmn-flow-type"
          data-testid="bpmn-flow-type"
          value={flow.bpmnFlow?.flowType || 'sequence'}
          onChange={event => patch({ flowType: event.target.value as 'sequence' | 'message' })}
          className={`w-32 ${field}`}
        >
          <option value="sequence">sequence</option>
          <option value="message">message</option>
        </select>

        <label className={label} htmlFor="bpmn-flow-condition">Условие</label>
        <input
          id="bpmn-flow-condition"
          value={flow.bpmnFlow?.condition || ''}
          placeholder="true"
          onChange={event => patch({ condition: event.target.value || undefined })}
          className={`w-20 ${field}`}
        />

        {isXorBranch && (
          <>
            <label className={label} htmlFor="bpmn-flow-probability">P</label>
            <input
              id="bpmn-flow-probability"
              type="number" min="0" max="1" step="0.01"
              value={flow.bpmnFlow?.probability ?? ''}
              onChange={event => {
                // Clearing the field is meaningful: it drops the explicit
                // probability and lets the branch fall back to the default.
                const raw = event.target.value
                if (raw.trim() === '') { patch({ probability: undefined }); return }
                const probability = parseBounded(raw, { min: 0, max: 1 })
                if (probability !== undefined) patch({ probability })
              }}
              className={`w-14 ${field}`}
            />
            <label className={`flex items-center gap-1 text-[11px] font-semibold ${theme.textSecondary}`}>
              <input
                type="checkbox"
                checked={flow.bpmnFlow?.isDefault || false}
                onChange={event => patch({ isDefault: event.target.checked })}
              />
              default
            </label>
          </>
        )}
      </div>
    </aside>
  )
}
