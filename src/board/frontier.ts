/**
 * Pareto frontier of staffing against cycle time.
 *
 * One simulation says how long *this* capacity takes. It does not say whether
 * the next person is worth hiring. A point is on the frontier when no other
 * point is at least as cheap and at least as fast, and strictly better on one
 * of those. Extra staff that does not shorten the process is dominated: it is
 * not an improvement.
 *
 * The sweep itself stays outside the document. Capacity variants are sent to
 * the existing WASM simulator and thrown away. Nothing here is written to the
 * .mboard file.
 */

export const FRONTIER_RUN_CAP = 40

export type CapacityModel = {
  nodes: { resourceRole?: string; resourceCapacity?: number }[]
  resourceRoles?: { name: string; capacity: number; queuePolicy?: string }[]
  slaTargetMs?: number
}

export type FrontierSample = {
  capacity: number
  meanDurationMs: number
  p95DurationMs: number
  meanCost: number
  onTimeRate?: number
}

export type FrontierPoint = FrontierSample & { onFrontier: boolean }

/** The sweep is several simulations. Cap the runs so a click cannot freeze the page. */
/** Bottleneck if it is still on the model, otherwise the first role by name. */
export function frontierRole(model: CapacityModel, preferred?: string | null): string | null {
  const names = new Set<string>()
  for (const role of model.resourceRoles ?? []) {
    const name = role.name.trim()
    if (name) names.add(name)
  }
  for (const node of model.nodes) {
    const name = node.resourceRole?.trim()
    if (name) names.add(name)
  }
  if (preferred && names.has(preferred)) return preferred
  return [...names].sort((left, right) => left.localeCompare(right))[0] ?? null
}

export function roleCapacity(model: CapacityModel, role: string): number {
  const policy = model.resourceRoles?.find(item => item.name === role)?.capacity
  const inline = model.nodes.find(node => node.resourceRole === role)?.resourceCapacity
  return Math.max(1, Math.floor(policy ?? inline ?? 1) || 1)
}

export function frontierRuns(requested: number): number {
  if (!Number.isInteger(requested) || requested < 1) return 1
  return Math.min(requested, FRONTIER_RUN_CAP)
}

/** A short ladder around the current staffing, always including one person. */
export function sweepCapacities(current: number): number[] {
  const base = Math.max(1, Math.min(8, Math.floor(current) || 1))
  return [...new Set([1, 2, 3, 4, base])].sort((left, right) => left - right)
}

/**
 * A copy of the model with one role's capacity replaced.
 * Both the role policy and the per-node fallback are set: the engine prefers
 * the policy, and a board without one still has to move.
 */
export function withRoleCapacity<T extends CapacityModel>(
  model: T,
  role: string,
  capacity: number,
): Omit<T, 'resourceRoles'> & { resourceRoles: { name: string; capacity: number; queuePolicy?: string }[] } {
  const next = Math.max(1, Math.floor(capacity))
  const roles = (model.resourceRoles ?? []).map(item => ({ ...item }))
  const index = roles.findIndex(item => item.name === role)
  if (index >= 0) roles[index] = { ...roles[index], capacity: next }
  else roles.push({ name: role, capacity: next, queuePolicy: 'fifo' })
  return {
    ...model,
    resourceRoles: roles,
    nodes: model.nodes.map(node => (
      node.resourceRole === role ? { ...node, resourceCapacity: next } : node
    )),
  }
}

export function dominates(left: FrontierSample, right: FrontierSample): boolean {
  const notWorse = left.capacity <= right.capacity && left.meanDurationMs <= right.meanDurationMs
  const strictlyBetter = left.capacity < right.capacity || left.meanDurationMs < right.meanDurationMs
  return notWorse && strictlyBetter
}

export function markFrontier(points: readonly FrontierSample[]): FrontierPoint[] {
  return points.map(point => ({
    ...point,
    onFrontier: !points.some(other => other !== point && dominates(other, point)),
  }))
}

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}с`
}

/** The staffing decision, not the chart. Cheapest point that still holds the SLA, else the fastest frontier point. */
export function frontierAdvice(role: string, points: readonly FrontierPoint[], slaTargetMs?: number): string {
  const front = points.filter(point => point.onFrontier)
  if (!front.length) return 'Фронтир пуст.'
  const wasted = points.filter(point => !point.onFrontier).map(point => point.capacity)
  const waste = wasted.length ? ` Лишняя мощность: ${wasted.join(', ')}.` : ''
  const meetsSla = slaTargetMs == null
    ? []
    : front.filter(point => (
      point.onTimeRate != null ? point.onTimeRate >= 0.999 : point.p95DurationMs <= slaTargetMs
    ))
  if (slaTargetMs != null && meetsSla.length === 0) {
    const fastest = [...front].sort((left, right) => left.meanDurationMs - right.meanDurationMs || left.capacity - right.capacity)[0]
    return `Роль «${role}»: ни одна точка фронтира не держит SLA. Быстрее всего ${fastest.capacity} чел. · ${seconds(fastest.meanDurationMs)}.${waste}`
  }
  // With an SLA, cheaper wins even if a larger team is faster: the extra
  // speed is optional. Without one, take the smallest team that already
  // reaches the best time on the frontier.
  const recommended = meetsSla.length
    ? [...meetsSla].sort((left, right) => left.capacity - right.capacity || left.meanDurationMs - right.meanDurationMs)[0]
    : front
      .filter(point => point.meanDurationMs === Math.min(...front.map(item => item.meanDurationMs)))
      .sort((left, right) => left.capacity - right.capacity)[0]
  const sla = meetsSla.length ? ' Это минимум, который держит SLA.' : ''
  return `Роль «${role}»: на фронтире достаточно ${recommended.capacity} чел. · ${seconds(recommended.meanDurationMs)}.${sla}${waste}`
}
