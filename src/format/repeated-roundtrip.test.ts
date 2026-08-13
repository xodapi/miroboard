import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deserialise, normalise, serialise, type BoardElement, type SerialiseInput } from './mboard'
import { loadMboard } from './schema'
import type { DocHistory, DocMeta, MboardFile } from './types'

const evidenceDirectory = resolve('evidence/format-repeated-roundtrip-stability')

const history: DocHistory = {
  yjsState: null,
  snapshots: [],
  retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [1, 6, 24, 168], maxSnapshots: 120, maxHistoryRatio: 3 },
}

const meta: DocMeta = {
  id: 'doc_repeated-roundtrip',
  title: 'Repeated round-trip fixture',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  createdWith: { version: 'test', commit: 'format-repeated-roundtrip-stability' },
  profiles: ['core', 'bpmn'],
}

const elements: BoardElement[] = [
  { id: 'start', type: 'circle', x: 10.123456, y: 20.987654, w: 78, h: 78, color: '#6BCB77', fill: '#6BCB77', bpmnNodeType: 'startEvent' },
  { id: 'task', type: 'sticky', x: 210.123456, y: 20.987654, w: 176, h: 76, color: '#4D96FF', fill: '#4D96FF', text: 'Проверить 👩‍👩‍👧‍👦', bpmnNodeType: 'task', bpmnDurationMs: 2_000, bpmnPriority: 0 },
  { id: 'end', type: 'circle', x: 410.123456, y: 20.987654, w: 78, h: 78, color: '#FF5D5D', fill: '#FF5D5D', bpmnNodeType: 'endEvent' },
  { id: 'flow-start-task', type: 'arrow', x: 0, y: 0, color: '#334155', stroke: 2, bpmnFlow: { sourceId: 'start', targetId: 'task', flowType: 'sequence', probability: 0, isDefault: false } },
  { id: 'flow-task-end', type: 'arrow', x: 0, y: 0, color: '#334155', stroke: 2, bpmnFlow: { sourceId: 'task', targetId: 'end', flowType: 'sequence' } },
]

function fixture(): SerialiseInput {
  return {
    elements,
    meta,
    profileConfig: {
      bpmn: {
        simulation: {
          seed: '042', runs: '500', slaTargetSec: '', instances: '1', arrivalIntervalSec: '0',
          calendarStartHour: '', calendarEndHour: '', arrivalClasses: [], rolePolicies: {},
        },
      },
    },
    history,
  }
}

function saveCycle(cycle: number, file: MboardFile): string {
  mkdirSync(evidenceDirectory, { recursive: true })
  const path = resolve(evidenceDirectory, `cycle-${cycle}.mboard`)
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
  return path
}

function normalisedDiff(left: MboardFile, right: MboardFile): string {
  const expected = JSON.stringify(normalise(left), null, 2)
  const actual = JSON.stringify(normalise(right), null, 2)
  return expected === actual ? '' : `normalised documents differ\n--- cycle 1\n+++ comparison cycle`
}

describe('VAL-FORMAT-027 repeated round-trip stability', () => {
  it('saves five identical normalised cycles and retains every saved path as evidence', () => {
    const evidencePaths: string[] = []
    let current = serialise(fixture())

    for (let cycle = 1; cycle <= 5; cycle += 1) {
      const savedPath = saveCycle(cycle, current)
      evidencePaths.push(savedPath)
      expect(existsSync(savedPath)).toBe(true)

      const loaded = loadMboard(readFileSync(savedPath, 'utf8'))
      expect(loaded.ok).toBe(true)
      if (!loaded.ok) throw new Error(`Cycle ${cycle} unexpectedly failed to load`)
      current = serialise(deserialise(loaded.file))
    }

    const savedCycles = evidencePaths.map(path => JSON.parse(readFileSync(path, 'utf8')) as MboardFile)
    expect(evidencePaths).toEqual([
      resolve(evidenceDirectory, 'cycle-1.mboard'),
      resolve(evidenceDirectory, 'cycle-2.mboard'),
      resolve(evidenceDirectory, 'cycle-3.mboard'),
      resolve(evidenceDirectory, 'cycle-4.mboard'),
      resolve(evidenceDirectory, 'cycle-5.mboard'),
    ])
    expect(savedCycles.slice(1).map(cycle => normalisedDiff(savedCycles[0], cycle))).toEqual(['', '', '', ''])
    expect(normalise(savedCycles[0])).toEqual(normalise(savedCycles[4]))
  })
})
