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

async function loadModule(page: Page, name: string) {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', `${name}.json`), 'utf8')) as { title: string }
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
    .getByRole('button', { name: new RegExp(fixture.title) }).click()
  await expect(page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })).toBeVisible()
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
