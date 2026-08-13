import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { loadMboard } from './schema'

export const BPMN_LEARNING_MODULE_PATHS = [
  'examples/basic-fixed.json',
  'examples/batch-workload.json',
  'examples/fifo-vs-priority.json',
  'examples/parallel-queue.json',
  'examples/priority-queue.json',
  'examples/sla-calendar.json',
] as const

export const MBOARD_FIXTURE_PATHS = [
  'examples/freeform-board.mboard',
  'examples/bpmn-process.mboard',
  'examples/mixed.mboard',
  'examples/legacy/v0-synthetic.mboard',
] as const

function readFixture(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('shipped format fixtures', () => {
  it('loads every shipped .mboard fixture without errors or migration warnings', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      for (const path of MBOARD_FIXTURE_PATHS) {
        const result = loadMboard(readFixture(path))
        expect(result.ok, path).toBe(true)
      }
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
      warn.mockRestore()
    }
  })

  it('keeps the six BPMN learning modules as the explicit zero-warning migration inventory', () => {
    expect(BPMN_LEARNING_MODULE_PATHS).toHaveLength(6)
    for (const path of BPMN_LEARNING_MODULE_PATHS) {
      const module = readFixture(path)
      expect(module.model, path).toBeDefined()
    }
  })

  it('covers freeform geometry, all BPMN node types, and an unknown profile namespace', () => {
    const freeform = readFixture(MBOARD_FIXTURE_PATHS[0])
    const freeformKinds = (freeform.nodes as Array<{ kind: string }>).map(node => node.kind)
    expect(freeformKinds).toEqual(expect.arrayContaining(['sticky', 'path', 'text', 'emoji', 'arrow']))
    expect(freeform.edges).toEqual([])

    const bpmn = readFixture(MBOARD_FIXTURE_PATHS[1])
    const bpmnTypes = (bpmn.nodes as Array<{ profileData: { bpmn?: { nodeType?: string } } }>)
      .map(node => node.profileData.bpmn?.nodeType)
    expect(bpmnTypes).toEqual(expect.arrayContaining(['startEvent', 'endEvent', 'task', 'xorGateway', 'andGateway', 'orGateway']))
    expect((bpmn.profileConfig as { bpmn: { simulation: { arrivalClasses: unknown[] } } }).bpmn.simulation.arrivalClasses).toHaveLength(2)

    const mixed = readFixture(MBOARD_FIXTURE_PATHS[2])
    expect((mixed.nodes as Array<{ profileData: Record<string, unknown> }>)
      .some(node => node.profileData.mindmap !== undefined)).toBe(true)
  })
})
