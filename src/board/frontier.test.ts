import { describe, expect, it } from 'vitest'
import {
  dominates, frontierAdvice, frontierRole, frontierRuns, markFrontier, roleCapacity, sweepCapacities, withRoleCapacity,
} from './frontier'

describe('frontierRole', () => {
  it('keeps the bottleneck when it is still on the model, else the first role by name', () => {
    const model = {
      nodes: [{ resourceRole: 'clerk' }, { resourceRole: 'operator' }],
      resourceRoles: [{ name: 'operator', capacity: 2 }],
    }
    expect(frontierRole(model, 'operator')).toBe('operator')
    expect(frontierRole(model, 'gone')).toBe('clerk')
    expect(frontierRole({ nodes: [] }, 'operator')).toBeNull()
    expect(roleCapacity(model, 'operator')).toBe(2)
    expect(roleCapacity({ nodes: [{ resourceRole: 'clerk', resourceCapacity: 3 }] }, 'clerk')).toBe(3)
  })
})

describe('sweepCapacities', () => {
  it('always includes one person and stays inside 1..8', () => {
    expect(sweepCapacities(1)).toEqual([1, 2, 3, 4])
    expect(sweepCapacities(6)).toEqual([1, 2, 3, 4, 6])
    expect(sweepCapacities(0)).toEqual([1, 2, 3, 4])
    expect(sweepCapacities(40)).toEqual([1, 2, 3, 4, 8])
  })
})

describe('frontierRuns', () => {
  it('caps a long sweep so the click cannot ask for thousands of runs per point', () => {
    expect(frontierRuns(500)).toBe(40)
    expect(frontierRuns(10)).toBe(10)
    expect(frontierRuns(0)).toBe(1)
  })
})

describe('withRoleCapacity', () => {
  it('replaces the role policy and the per-node fallback without mutating the source', () => {
    const model = {
      slaTargetMs: 5000,
      nodes: [
        { resourceRole: 'operator', resourceCapacity: 1 },
        { resourceRole: 'clerk', resourceCapacity: 2 },
      ],
      resourceRoles: [{ name: 'operator', capacity: 1, queuePolicy: 'fifo' }],
    }
    const next = withRoleCapacity(model, 'operator', 3)
    expect(next.resourceRoles).toEqual([{ name: 'operator', capacity: 3, queuePolicy: 'fifo' }])
    expect(next.nodes[0].resourceCapacity).toBe(3)
    expect(next.nodes[1].resourceCapacity).toBe(2)
    expect(model.nodes[0].resourceCapacity).toBe(1)
    expect(model.resourceRoles[0].capacity).toBe(1)
  })

  it('adds a policy when the board only has the per-node fallback', () => {
    const next = withRoleCapacity({ nodes: [{ resourceRole: 'operator' }] }, 'operator', 2)
    expect(next.resourceRoles).toEqual([{ name: 'operator', capacity: 2, queuePolicy: 'fifo' }])
  })
})

describe('markFrontier', () => {
  it('keeps the cheap fast points and drops staff that does not shorten the process', () => {
    const points = markFrontier([
      { capacity: 1, meanDurationMs: 7000, p95DurationMs: 7000, meanCost: 1 },
      { capacity: 2, meanDurationMs: 4000, p95DurationMs: 4000, meanCost: 1 },
      { capacity: 4, meanDurationMs: 4000, p95DurationMs: 4000, meanCost: 1 },
    ])
    expect(points.map(point => point.onFrontier)).toEqual([true, true, false])
    expect(dominates(points[1], points[2])).toBe(true)
    expect(dominates(points[1], points[0])).toBe(false)
  })

  it('does not let equal points dominate each other', () => {
    const points = markFrontier([
      { capacity: 2, meanDurationMs: 4000, p95DurationMs: 4000, meanCost: 1 },
      { capacity: 2, meanDurationMs: 4000, p95DurationMs: 4000, meanCost: 9 },
    ])
    expect(points.every(point => point.onFrontier)).toBe(true)
  })
})

describe('frontierAdvice', () => {
  const points = markFrontier([
    { capacity: 1, meanDurationMs: 7000, p95DurationMs: 7000, meanCost: 1, onTimeRate: 0 },
    { capacity: 2, meanDurationMs: 4000, p95DurationMs: 4000, meanCost: 1, onTimeRate: 1 },
    { capacity: 4, meanDurationMs: 4000, p95DurationMs: 4000, meanCost: 1, onTimeRate: 1 },
  ])

  it('names the cheapest frontier point that already has the best time', () => {
    expect(frontierAdvice('operator', points)).toContain('достаточно 2')
    expect(frontierAdvice('operator', points)).toContain('Лишняя мощность: 4')
  })

  it('picks the smallest capacity that holds the SLA, even if a larger team is faster', () => {
    const faster = markFrontier([
      ...points,
      { capacity: 3, meanDurationMs: 3000, p95DurationMs: 3000, meanCost: 1, onTimeRate: 1 },
    ])
    expect(frontierAdvice('operator', faster, 5000)).toContain('держит SLA')
    expect(frontierAdvice('operator', faster, 5000)).toContain('достаточно 2')
  })

  it('says so when even the fastest frontier point misses the SLA', () => {
    const missed = points.map(point => ({ ...point, onTimeRate: 0, p95DurationMs: 9000 }))
    expect(frontierAdvice('operator', missed, 1000)).toContain('не держит SLA')
  })

  it('falls back to p95 when the engine did not report an on-time rate', () => {
    const timed = points.map(({ onTimeRate: _rate, ...point }) => point)
    expect(frontierAdvice('operator', timed, 1000)).toContain('не держит SLA')
    expect(frontierAdvice('operator', timed, 5000)).toContain('держит SLA')
  })
})
