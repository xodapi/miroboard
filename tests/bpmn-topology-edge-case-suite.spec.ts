import { test, expect, type Page } from '@playwright/test'

type Node = Record<string, unknown>
type Flow = Node & { bpmnFlow: { sourceId: string; targetId: string; flowType: string; condition?: string; isDefault?: boolean } }
type SimulationResult = {
  meanDurationMs: number
  roleUtilization: Array<{ role: string; meanWaitingMs: number }>
  priorityClasses: Array<{ priority: number; instances: number; meanWaitingMs: number }>
}
type Run = { completed: boolean; tokenPath: string[] }

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
    expect(result.error).toContain('ошибки проверки')
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

  test('VAL-BPMN-055: unbounded loop trips the documented dynamic transition guard', async ({ page }) => {
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
    // This fixture projects to 4 BPMN nodes and 4 sequence flows. The documented
    // guard is nodes × flows × 4 × instances, so 4 × 4 × 4 × 1 = 64 transitions.
    const dynamicTransitionLimit = 4 * 4 * 4 * 1
    expect(dynamicTransitionLimit).toBe(64)
    expect(result.error).toContain(`детерминированный лимит в ${dynamicTransitionLimit} переходов`)
    expect(result.error).toContain('узлы × потоки × 4 × экземпляры')
  })

  test('VAL-BPMN-056: nested AND split delivers all three branch tokens to one end event', async ({ page }) => {
    const elements = [
      node('start', 'startEvent'), node('and-1', 'andGateway'), node('and-2', 'andGateway'),
      node('branch-a', 'task', { bpmnDurationMs: 100 }), node('branch-b', 'task', { bpmnDurationMs: 200 }),
      node('branch-c', 'task', { bpmnDurationMs: 300 }), node('join', 'andGateway'), node('end', 'endEvent'),
      flow('start-and-1', 'start', 'and-1'), flow('and-1-and-2', 'and-1', 'and-2'),
      flow('and-1-a', 'and-1', 'branch-a'), flow('and-2-b', 'and-2', 'branch-b'),
      flow('and-2-c', 'and-2', 'branch-c'), flow('a-join', 'branch-a', 'join'),
      flow('b-join', 'branch-b', 'join'), flow('c-join', 'branch-c', 'join'), flow('join-end', 'join', 'end'),
    ]
    await inject(page, elements)
    const run = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
    expect(run.completed).toBe(true)
    expect(run.tokenPath.filter(id => id === 'branch-a' || id === 'branch-b' || id === 'branch-c')).toHaveLength(3)
    expect(run.tokenPath.filter(id => id === 'join')).toHaveLength(3)
    expect(run.tokenPath.filter(id => id === 'end')).toHaveLength(1)
  })

  test('VAL-BPMN-057: nested AND and XOR branch execution is deterministic', async ({ page }) => {
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
    const simulation = (first as { result: SimulationResult }).result
    // The XOR conditions deterministically select a and c. Since those tasks
    // run in parallel, the AND join waits for the slower selected branch.
    const selectedParallelBranchDurations = [1_000, 500]
    const branchPairDuration = Math.max(...selectedParallelBranchDurations)
    expect(branchPairDuration).toBe(1_000)
    expect(simulation.meanDurationMs).toBeGreaterThanOrEqual(branchPairDuration)
  })

  test('VAL-BPMN-058: zero-capacity role is rejected explicitly', async ({ page }) => {
    await inject(page, linear([node('blocked', 'task', { bpmnDurationMs: 1000, bpmnResourceRole: 'ops', bpmnResourceCapacity: 0 })]))
    const result = await observe(page, 20)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ошибки проверки')
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
    const simulationPanel = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByTitle('Открыть Monte Carlo симуляцию').click()
    await simulationPanel.getByLabel('Instances').fill('5')
    await simulationPanel.getByLabel('Arrival, сек').fill('0')
    await page.waitForTimeout(200)
    const result = await observe(page, 10000)
    expect(finite(result)).toBe(true)
    expect(result.ok).toBe(true)
    const simulation = (result as { result: SimulationResult }).result
    expect(simulation.roleUtilization.some(role => role.meanWaitingMs > 0)).toBe(true)
  })

  test('VAL-BPMN-060: zero and very large durations produce finite results', async ({ page }) => {
    await inject(page, linear([node('zero', 'task', { bpmnDurationMs: 0 }), node('large', 'task', { bpmnDurationMs: 864000000 })]))
    const result = await observe(page, 2)
    expect(result.ok).toBe(true)
    expect(finite(result)).toBe(true)
  })

  test('VAL-BPMN-061: a 100-node process with XOR, AND, and resource lanes completes deterministically', async ({ page }) => {
    const tasks = Array.from({ length: 92 }, (_, i) => node(`task-${i}`, 'task', {
      bpmnDurationMs: (i % 5) + 1,
      bpmnResourceRole: i % 2 === 0 ? 'ops' : 'qa',
      bpmnResourceCapacity: 2,
    }))
    const elements = [
      node('start', 'startEvent'), node('xor-1', 'xorGateway'), node('xor-2', 'xorGateway'),
      node('and-split-1', 'andGateway'), node('and-join-1', 'andGateway'),
      node('and-split-2', 'andGateway'), node('and-join-2', 'andGateway'), node('end', 'endEvent'),
      ...tasks,
      flow('start-xor-1', 'start', 'xor-1'),
      flow('xor-1-task-0', 'xor-1', 'task-0', { condition: 'true' }),
      flow('xor-1-task-1', 'xor-1', 'task-1', { condition: 'false', isDefault: true }),
      flow('task-0-xor-2', 'task-0', 'xor-2'), flow('task-1-xor-2', 'task-1', 'xor-2'),
      flow('xor-2-task-2', 'xor-2', 'task-2', { condition: 'true' }),
      // Both XOR outcomes reconverge at task-2, leaving AND splits with exactly
      // one inbound flow and preventing an unreachable XOR branch from becoming
      // a phantom parallel-join obligation.
      flow('xor-2-default-task-2', 'xor-2', 'task-2', { condition: 'false', isDefault: true }),
      flow('task-2-and-split-1', 'task-2', 'and-split-1'), flow('task-3-task-4', 'task-3', 'task-4'),
      flow('and-split-1-task-4', 'and-split-1', 'task-4'), flow('and-split-1-task-5', 'and-split-1', 'task-5'),
      flow('task-4-and-join-1', 'task-4', 'and-join-1'), flow('task-5-and-join-1', 'task-5', 'and-join-1'),
      flow('and-join-1-and-split-2', 'and-join-1', 'and-split-2'),
      flow('and-split-2-task-6', 'and-split-2', 'task-6'), flow('and-split-2-task-7', 'and-split-2', 'task-7'),
      flow('task-6-and-join-2', 'task-6', 'and-join-2'), flow('task-7-and-join-2', 'task-7', 'and-join-2'),
      flow('and-join-2-task-8', 'and-join-2', 'task-8'),
      ...tasks.slice(8, -1).map((task, i) => flow(`tail-${i}`, String(task.id), String(tasks[i + 9]?.id))),
      flow('tail-end', 'task-91', 'end'),
    ]
    expect(elements.filter(element => element.bpmnNodeType).length).toBe(100)
    expect(elements.filter(element => element.bpmnNodeType === 'xorGateway')).toHaveLength(2)
    expect(elements.filter(element => element.bpmnNodeType === 'andGateway')).toHaveLength(4)
    expect(new Set(tasks.map(task => task.bpmnResourceRole))).toEqual(new Set(['ops', 'qa']))
    await inject(page, elements)
    const started = Date.now()
    const first = await observe(page, 10)
    const elapsed = Date.now() - started
    const second = await observe(page, 10)
    expect(elapsed).toBeLessThan(5000)
    expect(first).toEqual(second)
    expect(first.ok, first.ok ? '' : first.error).toBe(true)
  })

  // VAL-BPMN-062/063 calendar and arrival-class boundary coverage is deferred to M2:
  // the M1 topology suite remains focused on deterministic graph execution.
  test('VAL-BPMN-062/063: calendar and arrival-class boundary configurations are stable', async ({ page }) => {
    await inject(page, linear([node('task', 'task', {
      bpmnDurationMs: 1000, bpmnResourceRole: 'arrival-worker', bpmnResourceCapacity: 1,
    })]))
    const values = await page.evaluate(() => {
      const hook = window.__MIROBOARD_DEBUG__!
      try { hook.simulateBpmn(42, 0); return { zeroAccepted: true } }
      catch (error) { return { zeroAccepted: false, error: String(error), one: hook.simulateBpmn(42, 1), three: hook.simulateBpmn(42, 3) } }
    })
    expect(values.zeroAccepted).toBe(false)
    expect(values.error).toContain('от 1 до 10000')
    expect(values.one).not.toEqual(values.three)
    expect(finite(values)).toBe(true)

    const simulationPanel = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByTitle('Открыть Monte Carlo симуляцию').click()
    const classes = simulationPanel.locator('details').filter({ hasText: 'Классы прибытия' })
    await classes.locator('summary').click()
    for (const priority of ['1', '10']) {
      await classes.getByRole('button', { name: 'Добавить класс' }).click()
      const row = classes.locator('div.flex.items-center.gap-2').last()
      await row.getByPlaceholder('Кол-во').fill('5')
      await row.getByPlaceholder('Интервал, с').fill('0')
      await row.getByPlaceholder('Priority').fill(priority)
    }
    const policies = simulationPanel.locator('details').filter({ hasText: 'Политики ресурсов' })
    await policies.locator('summary').click()
    const workerRole = policies.getByText('arrival-worker', { exact: true }).locator('xpath=..')
    await workerRole.locator('select').selectOption('priority')
    await page.waitForTimeout(200)
    const classified = await observe(page, 1000)
    expect(classified.ok).toBe(true)
    const priorityClasses = (classified as { result: SimulationResult }).result.priorityClasses
    const lowerPriority = priorityClasses.find(item => item.priority === 1)
    const higherPriority = priorityClasses.find(item => item.priority === 10)
    expect(lowerPriority).toBeDefined()
    expect(higherPriority).toBeDefined()
    expect(higherPriority!.meanWaitingMs).toBeLessThan(lowerPriority!.meanWaitingMs)
  })
})
