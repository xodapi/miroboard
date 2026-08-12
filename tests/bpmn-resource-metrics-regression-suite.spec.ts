import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const modules = ['basic-fixed', 'parallel-queue', 'sla-calendar', 'batch-workload', 'priority-queue', 'fifo-vs-priority']

type Metrics = {
  meanDurationMs: number
  meanCost: number
  roleUtilization: Array<{ role: string; capacity: number; meanWorkloadMs: number; utilization: number; meanWaitingMs: number }>
  priorityClasses: Array<{ priority: number; instances: number; meanWaitingMs: number; meanDurationMs: number }>
  onTimeRate: number | null
}

type BpmnModel = {
  nodes: Array<{ type: string; resourceRole?: string }>
  resourceRoles: Array<{ name: string; capacity: number; queuePolicy: 'fifo' | 'priority' }>
}

const UTILIZATION_TOLERANCE_PERCENTAGE_POINTS = 1e-9

function expectUtilizationInvariant(role: Metrics['roleUtilization'][number], simulationDurationMs: number) {
  const expectedPercentage = (role.meanWorkloadMs / (role.capacity * simulationDurationMs)) * 100
  const actualPercentage = role.utilization * 100
  expect(Math.abs(actualPercentage - expectedPercentage)).toBeLessThanOrEqual(UTILIZATION_TOLERANCE_PERCENTAGE_POINTS)
}

async function loadModule(page: Page, name: string) {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', `${name}.json`), 'utf8')) as { title: string }
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
    .getByRole('button', { name: new RegExp(fixture.title) }).click()
  await expect(page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })).toBeVisible()
}

async function openSimulation(page: Page) {
  const existing = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
  if (await existing.count()) return existing
  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  return page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
}

async function setRolePolicy(page: Page, role: string, capacity: number, queuePolicy: 'fifo' | 'priority') {
  const modal = await openSimulation(page)
  const policies = modal.locator('details').filter({ hasText: 'Политики ресурсов' })
  if (!await policies.evaluate(details => details.open)) await policies.locator('summary').click()
  const row = policies.getByText(role, { exact: true }).locator('xpath=..')
  await row.locator('input').fill(String(capacity))
  await row.locator('select').selectOption(queuePolicy)
}

async function setBatchLoad(page: Page, instances: number, arrivalSeconds: number) {
  const modal = await openSimulation(page)
  await modal.getByText('Instances', { exact: true }).locator('input').fill(String(instances))
  await modal.getByText('Arrival, сек', { exact: true }).locator('input').fill(String(arrivalSeconds))
}

async function selectTask(page: Page, taskName: string) {
  const simulation = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
  if (await simulation.count()) await simulation.getByRole('button', { name: 'Закрыть симуляцию' }).click()
  await page.getByText(taskName, { exact: true }).click({ force: true })
  return page.locator('aside').filter({ hasText: 'Свойства задачи' })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(window.__MIROBOARD_DEBUG__))).toBe(true)
})

test.describe('BPMN resource and cost metrics', () => {
  for (const name of modules) {
    test(`BASELINE-INVARIANCE: ${name} reports the M0 resource metrics`, async ({ page }) => {
      await loadModule(page, name)
      const actual = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
      const baseline = JSON.parse(readFileSync(join(process.cwd(), 'baseline', name, 'baseline.json'), 'utf8')) as { payload: { simulateBpmn: Metrics } }
      expect({ meanDurationMs: actual.meanDurationMs, meanCost: actual.meanCost, roleUtilization: actual.roleUtilization, priorityClasses: actual.priorityClasses, onTimeRate: actual.onTimeRate })
        .toEqual({ meanDurationMs: baseline.payload.simulateBpmn.meanDurationMs, meanCost: baseline.payload.simulateBpmn.meanCost, roleUtilization: baseline.payload.simulateBpmn.roleUtilization, priorityClasses: baseline.payload.simulateBpmn.priorityClasses, onTimeRate: baseline.payload.simulateBpmn.onTimeRate })
    })
  }

  test('CHARACTERIZATION: every reported role metric is finite and bounded, including unused roles', async ({ page }) => {
    await loadModule(page, 'fifo-vs-priority')
    const result = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 37)) as Metrics
    expect(result.roleUtilization.length).toBeGreaterThan(0)
    for (const role of result.roleUtilization) {
      expect(Number.isFinite(role.utilization)).toBe(true)
      expect(role.utilization).toBeGreaterThanOrEqual(0)
      expect(role.utilization).toBeLessThanOrEqual(100)
      expect(role.meanWorkloadMs).toBeGreaterThanOrEqual(0)
      expect(role.meanWaitingMs).toBeGreaterThanOrEqual(0)
    }
  })

  test('CHARACTERIZATION: priority queue gives higher priority less waiting under contention', async ({ page }) => {
    await loadModule(page, 'fifo-vs-priority')
    const result = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    const high = result.priorityClasses.find((entry) => entry.priority === 10)
    const low = result.priorityClasses.find((entry) => entry.priority === 1)
    expect(high).toBeDefined()
    expect(low).toBeDefined()
    expect(high!.meanWaitingMs).toBeLessThan(low!.meanWaitingMs)
  })

  test('CHARACTERIZATION: constrained resource is identified as the bottleneck', async ({ page }) => {
    await loadModule(page, 'fifo-vs-priority')
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByTitle('Открыть Monte Carlo симуляцию').click()
    await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
    await expect(page.getByText(/Bottleneck:/).locator('..')).toContainText('Оператор')
    const result = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    const bottleneck = result.roleUtilization.reduce((max, role) => role.utilization > max.utilization ? role : max)
    expect(bottleneck.role).toBe('Оператор')
  })

  test('RELATIONAL characterization: capacity and FIFO versus priority change contended queue outcomes', async ({ page }) => {
    await loadModule(page, 'fifo-vs-priority')
    const priority = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics

    await setRolePolicy(page, 'Оператор', 1, 'fifo')
    const fifo = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    const priorityHigh = priority.priorityClasses.find(entry => entry.priority === 10)!
    const fifoHigh = fifo.priorityClasses.find(entry => entry.priority === 10)!
    expect(fifoHigh.meanWaitingMs).toBeGreaterThan(priorityHigh.meanWaitingMs)

    await setRolePolicy(page, 'Оператор', 3, 'fifo')
    const unconstrained = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    expect(unconstrained.roleUtilization[0].meanWaitingMs).toBeLessThan(fifo.roleUtilization[0].meanWaitingMs)
    expect(unconstrained.meanDurationMs).toBeLessThan(fifo.meanDurationMs)
  })

  test('RELATIONAL characterization: utilization follows busy time, capacity, and arrival load', async ({ page }) => {
    await loadModule(page, 'batch-workload')
    await setBatchLoad(page, 5, 0)
    await setRolePolicy(page, 'Оператор', 1, 'fifo')
    const constrained = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    const constrainedRole = constrained.roleUtilization[0]
    expect(constrainedRole.utilization).toBeGreaterThan(0)
    expect(constrainedRole.meanWorkloadMs).toBeGreaterThan(0)
    expectUtilizationInvariant(constrainedRole, constrained.meanDurationMs)

    await setRolePolicy(page, 'Оператор', 5, 'fifo')
    const moreCapacity = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    const moreCapacityRole = moreCapacity.roleUtilization[0]
    expect(moreCapacityRole.utilization).toBeLessThan(constrainedRole.utilization)
    expect(moreCapacityRole.meanWaitingMs).toBeLessThan(constrainedRole.meanWaitingMs)
    expectUtilizationInvariant(moreCapacityRole, moreCapacity.meanDurationMs)

    await setBatchLoad(page, 1, 0)
    const lowerArrivalLoad = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    const lowerArrivalLoadRole = lowerArrivalLoad.roleUtilization[0]
    expect(lowerArrivalLoadRole.utilization).toBeLessThan(moreCapacityRole.utilization)
    // With capacity held at five, fewer arriving instances reduce both busy work and utilization.
    expect(lowerArrivalLoadRole.meanWorkloadMs).toBeLessThan(moreCapacityRole.meanWorkloadMs)
    expectUtilizationInvariant(lowerArrivalLoadRole, lowerArrivalLoad.meanDurationMs)
  })

  test('CHARACTERIZATION: defined roles with no assigned tasks report zero utilization', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('board-local', JSON.stringify([
        // Two role definitions live on events, never on tasks. This distinguishes
        // zero assigned work from a role omitted because its task path was untaken.
        { id: 'start', type: 'sticky', x: 40, y: 120, w: 78, h: 78, text: 'Старт', color: '#6BCB77', fill: '#6BCB77', createdBy: 'test', bpmnNodeType: 'startEvent', bpmnResourceRole: 'Незадействованный A', bpmnResourceCapacity: 2 },
        { id: 'end', type: 'sticky', x: 440, y: 120, w: 78, h: 78, text: 'Конец', color: '#FF5D5D', fill: '#FF5D5D', createdBy: 'test', bpmnNodeType: 'endEvent', bpmnResourceRole: 'Незадействованный B', bpmnResourceCapacity: 3 },
        { id: 'f1', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'start', targetId: 'end', flowType: 'sequence' } },
      ]))
    })
    await page.reload()
    await expect.poll(() => page.evaluate(() => (window.__MIROBOARD_DEBUG__?.createBpmnModel() as BpmnModel | undefined)?.nodes.length ?? 0)).toBe(2)
    await setRolePolicy(page, 'Незадействованный A', 2, 'fifo')
    await setRolePolicy(page, 'Незадействованный B', 3, 'fifo')
    await page.waitForTimeout(200)

    const model = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.createBpmnModel()) as BpmnModel
    expect(model.nodes.filter((node) => node.type === 'task' && node.resourceRole).length).toBe(0)
    expect(model.resourceRoles).toEqual([
      { name: 'Незадействованный A', capacity: 2, queuePolicy: 'fifo' },
      { name: 'Незадействованный B', capacity: 3, queuePolicy: 'fifo' },
    ])
    const result = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 100)) as Metrics
    for (const roleName of ['Незадействованный A', 'Незадействованный B']) {
      const unusedRole = result.roleUtilization.find((role) => role.role === roleName)
      expect(unusedRole).toBeDefined()
      expect(Math.abs(unusedRole!.utilization * 100)).toBeLessThanOrEqual(UTILIZATION_TOLERANCE_PERCENTAGE_POINTS)
      expect(Math.abs(unusedRole!.meanWorkloadMs)).toBeLessThanOrEqual(UTILIZATION_TOLERANCE_PERCENTAGE_POINTS)
    }
  })

  test('RELATIONAL characterization: relieving one constrained role moves the bottleneck', async ({ page }) => {
    await loadModule(page, 'parallel-queue')
    const task = await selectTask(page, 'Собрать данные')
    await task.getByText('Роль', { exact: false }).locator('input').fill('Аналитик')

    await setRolePolicy(page, 'Аналитик', 1, 'fifo')
    const constrained = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    expect(constrained.roleUtilization[0].role).toBe('Аналитик')

    await setRolePolicy(page, 'Аналитик', 10, 'fifo')
    const relieved = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    expect(relieved.roleUtilization[0].role).toBe('Оператор')
    expect(relieved.roleUtilization[0].utilization).toBeGreaterThan(relieved.roleUtilization[1].utilization)
  })

  test('RELATIONAL characterization: cost scales with task rate and busy time, not queue wait', async ({ page }) => {
    await loadModule(page, 'batch-workload')
    await setBatchLoad(page, 5, 0)
    const task = await selectTask(page, 'Обработать заявку')
    await task.getByText('€/ч', { exact: false }).locator('input').fill('25')
    await task.locator('#bpmn-duration').fill('3')
    const base = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics

    await task.getByText('€/ч', { exact: false }).locator('input').fill('50')
    const doubledRate = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    expect(doubledRate.meanCost).toBeCloseTo(base.meanCost * 2, 10)

    await task.locator('#bpmn-duration').fill('6')
    const doubledBusyTime = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    expect(doubledBusyTime.meanCost).toBeCloseTo(doubledRate.meanCost * 2, 10)

    await setRolePolicy(page, 'Оператор', 5, 'fifo')
    const noQueue = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500)) as Metrics
    expect(noQueue.roleUtilization[0].meanWaitingMs).toBeLessThan(doubledBusyTime.roleUtilization[0].meanWaitingMs)
    // Characterized rule: meanCost is based on task busy duration only. Queue wait is not charged.
    expect(noQueue.meanCost).toBeCloseTo(doubledBusyTime.meanCost, 10)
  })

  test('RELATIONAL characterization: same seed reproduces and different seed diverges', async ({ page }) => {
    await loadModule(page, 'fifo-vs-priority')
    const values = await page.evaluate(() => {
      const hook = window.__MIROBOARD_DEBUG__!
      return [hook.simulateBpmn(42, 500), hook.simulateBpmn(42, 500), hook.simulateBpmn(43, 500)]
    })
    expect(values[0]).toEqual(values[1])
    expect(values[2]).not.toEqual(values[0])
  })

  test('CHARACTERIZATION: unset SLA reports null on-time rate', async ({ page }) => {
    await loadModule(page, 'sla-calendar')
    const result = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 100)) as Metrics
    // Characterized shipped behaviour: this fixture has no configured SLA.
    expect(result.onTimeRate).toBeNull()
  })

  test('CHARACTERIZATION: changing the UI SLA target moves on-time rate coherently', async ({ page }) => {
    await loadModule(page, 'sla-calendar')
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByTitle('Открыть Monte Carlo симуляцию').click()
    const slaInput = page.getByRole('spinbutton', { name: 'SLA, сек' })
    await slaInput.fill('1')
    await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
    const strict = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 100)) as Metrics
    await slaInput.fill('60')
    await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
    const lenient = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 100)) as Metrics
    expect(strict.onTimeRate).toBe(0)
    expect(lenient.onTimeRate).toBe(1)
    expect(lenient.onTimeRate).toBeGreaterThan(strict.onTimeRate)
  })
})
