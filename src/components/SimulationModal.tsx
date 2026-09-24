import type { Dispatch, SetStateAction } from 'react'
import type { FrontierPoint } from '../board/frontier'

type ArrivalClassDraft = { count: string; intervalSec: string; priority: string }
type QueuePolicy = 'fifo' | 'priority'
type RolePolicyDraft = { capacity: string; queuePolicy: QueuePolicy }
type BpmnSimulationResult = {
  seed: number; runs: number; completedRuns: number; simulationInstances: number; arrivalIntervalMs: number
  minDurationMs: number; meanDurationMs: number; standardDeviationMs: number
  p50DurationMs: number; p90DurationMs: number; p95DurationMs: number; maxDurationMs: number; meanCost: number
  slaTargetMs?: number; onTimeRate?: number; roleUtilization: { role: string; capacity: number; meanWorkloadMs: number; meanWaitingMs: number; utilization: number }[]; priorityClasses: { priority: number; instances: number; meanWaitingMs: number; meanDurationMs: number }[]
}

type Props = {
  arrivalClasses: ArrivalClassDraft[]
  arrivalInterval: string
  calendarEnd: string
  calendarStart: string
  detectedRoles: [string, number][]
  dk: boolean
  hoverBg: string
  rolePolicies: Record<string, RolePolicyDraft>
  setArrivalClasses: Dispatch<SetStateAction<ArrivalClassDraft[]>>
  setArrivalInterval: Dispatch<SetStateAction<string>>
  setCalendarEnd: Dispatch<SetStateAction<string>>
  setCalendarStart: Dispatch<SetStateAction<string>>
  setRolePolicies: Dispatch<SetStateAction<Record<string, RolePolicyDraft>>>
  setSimulationInstances: Dispatch<SetStateAction<string>>
  setSimulationRuns: Dispatch<SetStateAction<string>>
  setSimulationSeed: Dispatch<SetStateAction<string>>
  setSimulationTarget: Dispatch<SetStateAction<string>>
  simulationInstances: string
  simulationRuns: string
  simulationSeed: string
  simulationTarget: string
  simulateBpmn: () => void
  textSec: string
  visibleBottleneckRole: string | null
  visibleSimulationResult: BpmnSimulationResult | null
  frontierRole: string | null
  frontierAdvice: string | null
  frontierPoints: FrontierPoint[] | null
  frontierRuns: number | null
  onTraceFrontier: () => void
  onApplyFrontierCapacity: (capacity: number) => void
  onClose: () => void
}

export function SimulationModal({
  arrivalClasses, arrivalInterval, calendarEnd, calendarStart, detectedRoles, dk, hoverBg, rolePolicies,
  setArrivalClasses, setArrivalInterval, setCalendarEnd, setCalendarStart, setRolePolicies, setSimulationInstances, setSimulationRuns, setSimulationSeed, setSimulationTarget,
  simulationInstances, simulationRuns, simulationSeed, simulationTarget, simulateBpmn, textSec, visibleBottleneckRole, visibleSimulationResult,
  frontierRole, frontierAdvice, frontierPoints, frontierRuns, onTraceFrontier, onApplyFrontierCapacity, onClose,
}: Props) {
  const longest = frontierPoints?.reduce((max, point) => Math.max(max, point.meanDurationMs), 1) ?? 1
  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-xl" onClick={() => onClose()} data-ui>
          <section className={`w-full max-w-md rounded-[28px] ${dk ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'} shadow-2xl p-6`} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) { if (event.key === 'Delete' || event.key === 'Backspace') event.preventDefault(); event.stopPropagation() } }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold">Monte Carlo симуляция</h2>
                <p className={`mt-1 text-sm ${textSec}`}>Вероятности XOR, фиксированный seed и воспроизводимый результат.</p>
              </div>
              <button onClick={() => onClose()} className={`size-9 rounded-xl text-lg ${hoverBg}`} aria-label="Закрыть симуляцию">×</button>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-5">
              <label className={`text-[12px] font-semibold ${textSec}`}>Seed
                <input value={simulationSeed} onChange={event => setSimulationSeed(event.target.value)} onKeyDown={event => { if (event.key === 'Delete' || event.key === 'Backspace') event.preventDefault(); event.stopPropagation() }} className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
              <label className={`text-[12px] font-semibold ${textSec}`}>Прогоны
                <input type="number" min="1" max="10000" value={simulationRuns} onChange={event => setSimulationRuns(event.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
              <label className={`text-[12px] font-semibold ${textSec}`}>SLA, сек
                <input type="number" min="0" value={simulationTarget} onChange={event => setSimulationTarget(event.target.value)} placeholder="не задано" className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
              <label className={`text-[12px] font-semibold ${textSec}`}>Работа с
                <input type="number" min="0" max="23.99" step="0.5" value={calendarStart} onChange={event => setCalendarStart(event.target.value)} placeholder="0" className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
              <label className={`text-[12px] font-semibold ${textSec}`}>до
                <input type="number" min="0" max="24" step="0.5" value={calendarEnd} onChange={event => setCalendarEnd(event.target.value)} placeholder="24" className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
              <label className={`text-[12px] font-semibold ${textSec}`}>Instances
                <input type="number" min="1" max="1000" value={simulationInstances} onChange={event => setSimulationInstances(event.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
              <label className={`text-[12px] font-semibold ${textSec}`}>Arrival, сек
                <input type="number" min="0" step="0.1" value={arrivalInterval} onChange={event => setArrivalInterval(event.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
            </div>
            {/* Arrival Classes */}
            <details className={`mt-4 rounded-xl border ${dk ? 'border-slate-600' : 'border-slate-200'}`}>
              <summary className={`cursor-pointer px-3 py-2 text-sm font-semibold ${textSec} hover:bg-slate-50 rounded-xl`}>
                Классы прибытия ({arrivalClasses.length})
              </summary>
              <div className="p-3 space-y-2">
                {arrivalClasses.map((ac, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input type="number" min="1" placeholder="Кол-во" value={ac.count} onChange={event => setArrivalClasses(prev => prev.map((item, i) => i === index ? { ...item, count: event.target.value } : item))} className={`w-20 rounded-lg border px-2 py-1 text-xs outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
                    <input type="number" min="0" step="0.1" placeholder="Интервал, с" value={ac.intervalSec} onChange={event => setArrivalClasses(prev => prev.map((item, i) => i === index ? { ...item, intervalSec: event.target.value } : item))} className={`flex-1 rounded-lg border px-2 py-1 text-xs outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
                    <input type="number" placeholder="Priority" value={ac.priority} onChange={event => setArrivalClasses(prev => prev.map((item, i) => i === index ? { ...item, priority: event.target.value } : item))} className={`w-20 rounded-lg border px-2 py-1 text-xs outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
                    <button onClick={() => setArrivalClasses(prev => prev.filter((_, i) => i !== index))} className="size-7 rounded-lg bg-red-100 text-red-700 text-xs hover:bg-red-200">−</button>
                  </div>
                ))}
                <button onClick={() => setArrivalClasses(prev => [...prev, { count: '1', intervalSec: '0', priority: '0' }])} className={`w-full rounded-lg border-2 border-dashed px-3 py-2 text-xs font-semibold ${dk ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                  + Добавить класс
                </button>
              </div>
            </details>
            {/* Role Policies */}
            {detectedRoles.length > 0 && (
              <details className={`mt-3 rounded-xl border ${dk ? 'border-slate-600' : 'border-slate-200'}`}>
                <summary className={`cursor-pointer px-3 py-2 text-sm font-semibold ${textSec} hover:bg-slate-50 rounded-xl`}>
                  Политики ресурсов ({detectedRoles.length} ролей)
                </summary>
                <div className="p-3 space-y-2">
                  {detectedRoles.map(([role, inlineCapacity]) => {
                    const policy = rolePolicies[role] || { capacity: String(inlineCapacity), queuePolicy: 'fifo' as QueuePolicy }
                    return (
                      <div key={role} className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-semibold truncate">{role}</span>
                        <input type="number" min="1" value={policy.capacity} onChange={event => setRolePolicies(prev => ({ ...prev, [role]: { ...policy, capacity: event.target.value } }))} className={`w-16 rounded-lg border px-2 py-1 text-xs outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
                        <select value={policy.queuePolicy} onChange={event => setRolePolicies(prev => ({ ...prev, [role]: { ...policy, queuePolicy: event.target.value as QueuePolicy } }))} className={`rounded-lg border px-2 py-1 text-xs outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`}>
                          <option value="fifo">FIFO</option>
                          <option value="priority">Priority</option>
                        </select>
                      </div>
                    )
                  })}
                </div>
              </details>
            )}
            <button onClick={simulateBpmn} className="w-full mt-4 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2.5 text-sm font-bold text-white">
              Запустить симуляцию
            </button>
            <button
              type="button"
              onClick={onTraceFrontier}
              disabled={detectedRoles.length === 0}
              data-testid="trace-frontier"
              className="mt-2 w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Фронтир мощности
            </button>
            <p className={`mt-1 text-[11px] leading-4 ${textSec}`}>
              Одна роль, тот же seed. Точка на фронтире — её время уже не улучшить, не добавив людей. Остальные точки — лишняя мощность.
            </p>
            {frontierPoints && frontierPoints.length > 0 && (
              <div className={`mt-3 rounded-2xl p-3 ${dk ? 'bg-slate-700' : 'bg-violet-50/70'}`} data-testid="frontier-panel">
                <div className="text-xs font-bold">Фронтир · {frontierRole}</div>
                {frontierRuns != null && (
                  <div className={`mt-0.5 text-[10px] ${textSec}`}>По {frontierRuns} прогонов на точку, не больше 40.</div>
                )}
                {frontierAdvice && <p className="mt-2 text-xs leading-5">{frontierAdvice}</p>}
                <ul className="mt-2 space-y-1.5">
                  {frontierPoints.map(point => (
                    <li key={point.capacity} className="flex items-center gap-2 text-[11px]" data-testid={point.onFrontier ? 'frontier-point' : 'frontier-dominated'}>
                      <span className="w-8 shrink-0 font-semibold">{point.capacity}</span>
                      <span className={`h-1.5 flex-1 overflow-hidden rounded-full ${dk ? 'bg-slate-600' : 'bg-white'}`}>
                        <span
                          className={`block h-full rounded-full ${point.onFrontier ? 'bg-violet-500' : 'bg-slate-300'}`}
                          style={{ width: `${Math.max(8, (point.meanDurationMs / longest) * 100)}%` }}
                        />
                      </span>
                      <span className="w-12 shrink-0 text-right font-semibold">{(point.meanDurationMs / 1000).toFixed(1)}с</span>
                      <span className={`w-16 shrink-0 text-right ${textSec}`}>{point.onFrontier ? 'фронтир' : 'лишняя'}</span>
                      {point.onFrontier && (
                        <button
                          type="button"
                          onClick={() => onApplyFrontierCapacity(point.capacity)}
                          className="shrink-0 rounded-lg bg-white px-2 py-0.5 text-[10px] font-bold text-violet-700"
                        >
                          взять
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {visibleSimulationResult && (
              <div className={`mt-5 grid grid-cols-3 gap-2 rounded-2xl p-3 ${dk ? 'bg-slate-700' : 'bg-slate-50'}`}>
                {([
                  ['Min', visibleSimulationResult.minDurationMs],
                  ['Mean', visibleSimulationResult.meanDurationMs],
                  ['σ', visibleSimulationResult.standardDeviationMs],
                  ['P50', visibleSimulationResult.p50DurationMs],
                  ['P90', visibleSimulationResult.p90DurationMs],
                  ['P95', visibleSimulationResult.p95DurationMs],
                  ['Max', visibleSimulationResult.maxDurationMs],
                ] as const).map(([label, milliseconds]) => (
                  <div key={label} className="text-center">
                    <div className={`text-[10px] font-semibold ${textSec}`}>{label}</div>
                    <div className="text-sm font-bold">{(milliseconds / 1000).toFixed(1)}с</div>
                  </div>
                ))}
                <div className="col-span-3 mt-1 border-t border-black/10 pt-2 text-center">
                  <span className={`text-[10px] font-semibold ${textSec}`}>Средняя стоимость: </span>
                  <span className="text-sm font-bold">€{visibleSimulationResult.meanCost.toFixed(2)}</span>
                </div>
                {visibleBottleneckRole && (
                  <div className="col-span-3 rounded-xl bg-orange-50 px-3 py-2 text-center text-xs text-orange-800">
                    <b>Bottleneck:</b> роль «{visibleBottleneckRole}» имеет наибольшую utilisation. Её задачи подсвечены на схеме.
                  </div>
                )}
                {visibleSimulationResult.onTimeRate !== undefined && (
                  <div className="col-span-3 text-center text-sm font-bold">
                    В срок: {(visibleSimulationResult.onTimeRate * 100).toFixed(1)}% при SLA {(visibleSimulationResult.slaTargetMs! / 1000).toFixed(1)}с
                  </div>
                )}
                {visibleSimulationResult.simulationInstances > 1 && (
                  <div className="col-span-3 text-center text-xs text-slate-600">
                    Batch: {visibleSimulationResult.simulationInstances} instances, interval {(visibleSimulationResult.arrivalIntervalMs / 1000).toFixed(1)}с
                  </div>
                )}
                {visibleSimulationResult.roleUtilization.map((role) => (
                  <div key={role.role} className="col-span-3 flex items-center justify-between border-t border-black/10 pt-2 text-[11px]">
                    <span className={textSec}>{role.role} · capacity {role.capacity} · work {(role.meanWorkloadMs / 1000).toFixed(1)}с · wait {(role.meanWaitingMs / 1000).toFixed(1)}с</span>
                    <span className="font-bold">{(role.utilization * 100).toFixed(0)}%</span>
                  </div>
                ))}
                {visibleSimulationResult.priorityClasses.length > 0 && (
                  <div className="col-span-3 border-t border-black/10 pt-2">
                    <div className={`text-[10px] font-semibold ${textSec} mb-2`}>По приоритетам:</div>
                    {visibleSimulationResult.priorityClasses.map((pc) => (
                      <div key={pc.priority} className="flex items-center justify-between text-[11px] py-1">
                        <span className={textSec}>Priority {pc.priority} · {pc.instances} inst · wait {(pc.meanWaitingMs / 1000).toFixed(1)}с</span>
                        <span className="font-bold">{(pc.meanDurationMs / 1000).toFixed(1)}с</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
  )
}
