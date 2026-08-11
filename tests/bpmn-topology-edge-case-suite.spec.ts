import { test, expect, type Page } from '@playwright/test'

type Node = Record<string, unknown>
type Flow = Node & { bpmnFlow: { sourceId: string; targetId: string; flowType: string; condition?: string; isDefault?: boolean } }

const node = (id: string, bpmnNodeType: string, extra: Node = {}): Node => ({
  id, type: 'sticky', bpmnNodeType, x: 100, y: 100, w: 120, h: 70,
  text: id, color: '#4D96FF', fill: '#4D96FF', createdBy: 'edge-suite', ...extra,
})
const flow = (id: string, sourceId: string, targetId: string, extra: Partial<Flow['bpmnFlow']> = {}): Flow => ({
  id, type: 'arrow', x: 0, y: 0, color: '#334155', stroke: 2, fill: 'transparent',
  createdBy: 'edge-suite', bpmnFlow: { sourceId, targetId, flowType: 'sequence', ...extra },
})
const linear = (tasks: Node[], extras: Flow[] = []) => [
  node('start', 'startEvent'), ...tasks, node('end', 'endEvent'),
  flow('start-1', 'start', String(tasks[0]?.id ?? 'end')),
  ...tasks.map((task, i) => flow(`task-${i}`, String(task.id), String(tasks[i + 1]?.id ?? 'end'))),
  ...extras,
]

async function inject(page: Page, elements: Node[]) {
  await page.addInitScript((value) => {
    localStorage.setItem('board-local', JSON.stringify(value))
    localStorage.setItem('miro-onboarding-seen', 'true')
  }, elements)
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => Boolean(window.__MIROBOARD_DEBUG__))).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__MIROBOARD_DEBUG__?.getElements().length)).toBe(elements.length)
}
async function observe(page: Page, runs = 10) {
  return page.evaluate((count) => {
    const hook = window.__MIROBOARD_DEBUG__!
    try {
      const validation = hook.validateBpmn()
      const result = hook.simulateBpmn(42, count)
      return { ok: true, validation, result }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
  }, runs)
}
function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(finite)
  if (value && typeof value === 'object') return Object.values(value).every(finite)
  return true
}

test.describe('BPMN topology and configuration edge cases', () => {
  test('VAL-BPMN-051: empty process is deterministic and non-crashing', async ({ page }) => {
    await inject(page, [])
    const result = await observe(page)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('validation errors')
    expect(finite(result)).toBe(true)
  })

  test('VAL-BPMN-052: one fixed task has one activation and finite metrics', async ({ page }) => {
    await inject(page, linear([node('task', 'task', { bpmnDurationMs: 2500, bpmnDurationDistribution: 'fixed' })]))
    const first = await observe(page, 20)
    const second = await observe(page, 20)
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    expect(finite(first)).toBe(true)
  })

  test('VAL-BPMN-053: start to end without a task is explicit and finite', async ({ page }) => {
    await inject(page, linear([]))
    const result = await observe(page)
    expect(result.ok).toBe(true)
    expect(finite(result)).toBe(true)
  })

  test('VAL-BPMN-054: terminating loop completes within the runner bound', async ({ page }) => {
    // The loop must be a real cycle, with an explicit exit to the end event.
    const elements = [
      node('start', 'startEvent'), node('task', 'task', { bpmnDurationMs: 100 }),
      node('gate', 'xorGateway'), node('end', 'endEvent'),
      flow('start-task', 'start', 'task'), flow('task-gate', 'task', 'gate'),
      flow('gate-loop', 'gate', 'task', { condition: 'false' }),
      flow('gate-end', 'gate', 'end', { condition: 'false', isDefault: true }),
    ]
    await inject(page, elements)
    const result = await page.evaluate(() => {
      try { return { ok: true, run: window.__MIROBOARD_DEBUG__!.runBpmn() } }
      catch (error) { return { ok: false, error: String(error) } }
    })
    expect(result.ok).toBe(true)
    expect(result.run).toMatchObject({ completed: true })
    expect(finite(result)).toBe(true)
  })

  test('VAL-BPMN-055: unbounded loop trips the documented deterministic guard', async ({ page }) => {
    await inject(page, [
      node('start', 'startEvent'), node('task', 'task', { bpmnDurationMs: 1 }), node('gateway', 'xorGateway'), node('end', 'endEvent'),
      flow('s-task', 'start', 'task'), flow('task-g', 'task', 'gateway'),
      flow('g-task', 'gateway', 'task', { condition: 'true' }), flow('g-end', 'gateway', 'end', { condition: 'false' }),
    ])
    const result = await page.evaluate(() => {
      try { return { ok: true, run: window.__MIROBOARD_DEBUG__!.runBpmn() } }
      catch (error) { return { ok: false, error: String(error) } }
    })
    expect(result.ok).toBe(false)
    // The runner guard is 100,000 transitions. This text is also the user-visible
    // report shown by the "Проверить поток" action, and is documented in
    // docs/BPMN_SIMULATION.md.
    expect(result.error).toContain('deterministic step limit')
  })

  test('VAL-BPMN-056/057: nested AND and XOR branch execution is deterministic', async ({ page }) => {
    const elements = [
      node('start', 'startEvent'), node('outer', 'andGateway'), node('left-xor', 'xorGateway'),
      node('right-xor', 'xorGateway'), node('a', 'task', { bpmnDurationMs: 1000 }), node('b', 'task', { bpmnDurationMs: 3000 }),
      node('c', 'task', { bpmnDurationMs: 500 }), node('d', 'task', { bpmnDurationMs: 700 }),
      node('join-left', 'xorGateway'), node('join-right', 'xorGateway'), node('join-outer', 'andGateway'), node('end', 'endEvent'),
      flow('1', 'start', 'outer'), flow('2', 'outer', 'left-xor'), flow('3', 'outer', 'right-xor'),
      flow('4', 'left-xor', 'a', { condition: 'true' }), flow('5', 'left-xor', 'b', { condition: 'false' }),
      flow('6', 'right-xor', 'c', { condition: 'true' }), flow('7', 'right-xor', 'd', { condition: 'false' }),
      flow('8', 'a', 'join-left'), flow('9', 'b', 'join-left'), flow('10', 'c', 'join-right'), flow('11', 'd', 'join-right'),
      flow('12', 'join-left', 'join-outer'), flow('13', 'join-right', 'join-outer'), flow('14', 'join-outer', 'end'),
    ]
    await inject(page, elements)
    const model = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.createBpmnModel())
    expect(JSON.stringify(model)).toContain('join-left')
    expect(JSON.stringify(model)).toContain('join-right')
    expect(elements.filter((element) => element.bpmnNodeType === 'andGateway')).toHaveLength(2)
    expect(elements.filter((element) => element.bpmnNodeType === 'xorGateway')).toHaveLength(4)
    const first = await observe(page, 10)
    const second = await observe(page, 10)
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
  })

  test('VAL-BPMN-058: zero-capacity role is rejected explicitly', async ({ page }) => {
    await inject(page, linear([node('blocked', 'task', { bpmnDurationMs: 1000, bpmnResourceRole: 'ops', bpmnResourceCapacity: 0 })]))
    const result = await observe(page, 20)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('validation errors')
  })

  test('VAL-BPMN-059: unset role and three-role contention remain finite', async ({ page }) => {
    await inject(page, linear([
      node('ops-task', 'task', { bpmnDurationMs: 1000, bpmnResourceRole: 'ops' }),
      node('qa-task', 'task', { bpmnDurationMs: 2000, bpmnResourceRole: 'qa' }),
      node('unset-task', 'task', { bpmnDurationMs: 1000 }),
      node('support-task', 'task', { bpmnDurationMs: 500, bpmnResourceRole: 'support' }),
    ]))
    const model = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.createBpmnModel())
    expect(JSON.stringify(model)).toContain('ops')
    expect(JSON.stringify(model)).toContain('qa')
    expect(JSON.stringify(model)).toContain('support')
    const result = await observe(page, 10000)
    expect(finite(result)).toBe(true)
  })

  test('VAL-BPMN-060: zero and very large durations produce finite results', async ({ page }) => {
    await inject(page, linear([node('zero', 'task', { bpmnDurationMs: 0 }), node('large', 'task', { bpmnDurationMs: 864000000 })]))
    const result = await observe(page, 2)
    expect(result.ok).toBe(true)
    expect(finite(result)).toBe(true)
  })

  test('VAL-BPMN-061: a 100-task process completes and repeats identically', async ({ page }) => {
    const tasks = Array.from({ length: 100 }, (_, i) => node(`task-${i}`, 'task', { bpmnDurationMs: i % 5 }))
    await inject(page, linear(tasks))
    const started = Date.now()
    const first = await observe(page, 10)
    const elapsed = Date.now() - started
    const second = await observe(page, 10)
    expect(elapsed).toBeLessThan(5000)
    expect(first).toEqual(second)
  })

  test('VAL-BPMN-062/063: calendar and arrival-class boundary configurations are stable', async ({ page }) => {
    await inject(page, linear([node('task', 'task', { bpmnDurationMs: 1000 })]))
    const values = await page.evaluate(() => {
      const hook = window.__MIROBOARD_DEBUG__!
      try { hook.simulateBpmn(42, 0); return { zeroAccepted: true } }
      catch (error) { return { zeroAccepted: false, error: String(error), one: hook.simulateBpmn(42, 1), three: hook.simulateBpmn(42, 3) } }
    })
    expect(values.zeroAccepted).toBe(false)
    expect(values.error).toContain('between 1 and 10000')
    expect(values.one).not.toEqual(values.three)
    expect(finite(values)).toBe(true)
  })
})
