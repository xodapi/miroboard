import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const modules = ['basic-fixed', 'parallel-queue', 'sla-calendar', 'batch-workload', 'priority-queue', 'fifo-vs-priority']
type Result = Record<string, unknown> & {
  runs: number
  slaTargetMs?: number
  onTimeRate?: number | null
  simulationInstances: number
  arrivalIntervalMs: number
  minDurationMs: number
  meanDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  standardDeviationMs: number
  roleUtilization: Array<{ capacity: number; meanWaitingMs: number }>
  priorityClasses: Array<{ priority: number; instances: number; meanWaitingMs: number }>
}

async function loadModule(page: Page, name: string) {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', `${name}.json`), 'utf8')) as { title: string }
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
    .getByRole('button', { name: new RegExp(fixture.title) }).click()
  await expect(page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })).toBeVisible()
}

async function openSimulation(page: Page) {
  const panel = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
  if (await panel.count()) return panel
  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  return page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
}

async function runScenario(page: Page): Promise<Result> {
  const panel = await openSimulation(page)
  await panel.getByRole('button', { name: 'Запустить симуляцию' }).click()
  await expect(panel.getByText('Средняя стоимость:', { exact: false })).toBeVisible()
  const runs = Number(await panel.getByLabel('Прогоны').inputValue())
  const seed = await panel.getByLabel('Seed').inputValue()
  return page.evaluate(
    ({ seedValue, runCount }) => window.__MIROBOARD_DEBUG__!.simulateBpmn(seedValue, runCount),
    { seedValue: seed, runCount: runs },
  ) as Promise<Result>
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(window.__MIROBOARD_DEBUG__))).toBe(true)
})

test.describe('BPMN simulation parameter surface', () => {
  for (const name of modules) {
    test(`BASELINE-INVARIANCE: ${name} preserves M0 seed 42/runs 500 result`, async ({ page }) => {
      await loadModule(page, name)
      const actual = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 500))
      const baseline = JSON.parse(readFileSync(join(process.cwd(), 'baseline', name, 'baseline.json'), 'utf8')) as { payload: { simulateBpmn: Result } }
      expect(actual).toEqual(baseline.payload.simulateBpmn)
    })
  }

  test('RELATIONAL characterization: same seed is identical and another seed diverges', async ({ page }) => {
    await loadModule(page, 'parallel-queue')
    const values = await page.evaluate(() => {
      const h = window.__MIROBOARD_DEBUG__!
      return [h.simulateBpmn('42', 500), h.simulateBpmn('42', 500), h.simulateBpmn('43', 500)]
    })
    expect(values[0]).toEqual(values[1])
    expect(values[2]).not.toEqual(values[0])
  })

  test('CHARACTERIZATION: leading-zero seed reaches BigInt as a string', async ({ page }) => {
    await loadModule(page, 'basic-fixed')
    const values = await page.evaluate(() => {
      const h = window.__MIROBOARD_DEBUG__!
      return { padded: h.simulateBpmn('042', 50), plain: h.simulateBpmn('42', 50), large: h.simulateBpmn('9007199254740993', 5) }
    })
    // Profile configuration preserves user-entered strings. A padded seed must
    // therefore remain a distinct simulation input rather than being coerced to 42.
    expect(values.padded).not.toEqual(values.plain)
    expect(values.large.runs).toBe(5)
  })

  test('CHARACTERIZATION: increasing runs converge aggregate statistics', async ({ page }) => {
    await loadModule(page, 'batch-workload')
    await page.getByText('Обработать заявку', { exact: true }).click({ force: true })
    const task = page.getByText('Свойства задачи').locator('xpath=..')
    await task.locator('select').first().selectOption('uniform')
    await task.getByText('Min', { exact: true }).locator('input').fill('1')
    await task.getByText('Max', { exact: true }).locator('input').fill('9')
    const values = await page.evaluate(() => {
      const hook = window.__MIROBOARD_DEBUG__!
      return {
        low: hook.simulateBpmn(42, 37),
        medium: hook.simulateBpmn(42, 500),
        reference: hook.simulateBpmn(42, 10_000),
      }
    }) as { low: Result; medium: Result; reference: Result }
    expect(values.low.runs).toBe(37)
    expect(values.medium.runs).toBe(500)
    expect(values.reference.runs).toBe(10_000)
    // Aggregate characterization: Uniform(1s, 9s) has an analytical mean of
    // 5s. This prevents an implementation from merely echoing seed and runs.
    expect(values.medium.meanDurationMs).toBeGreaterThanOrEqual(4_000)
    expect(values.medium.meanDurationMs).toBeLessThanOrEqual(6_000)
    expect(Math.abs(values.medium.meanDurationMs - values.reference.meanDurationMs))
      .toBeLessThan(Math.abs(values.low.meanDurationMs - values.reference.meanDurationMs))
  })

  test('CHARACTERIZATION: duration distributions retain their characteristic spread', async ({ page }) => {
    await loadModule(page, 'basic-fixed')
    await page.getByText('Подготовить данные', { exact: true }).click({ force: true })
    const panel = page.getByText('Свойства задачи').locator('xpath=..')
    const distribution = panel.locator('select').first()
    const fixed = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 200)) as Result
    await distribution.selectOption('uniform')
    await panel.getByText('Min', { exact: true }).locator('input').fill('1')
    await panel.getByText('Max', { exact: true }).locator('input').fill('5')
    const uniform = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 200)) as Result
    await distribution.selectOption('triangular')
    await panel.getByText('Mode', { exact: true }).locator('input').fill('3')
    const triangular = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 200)) as Result
    expect(fixed.standardDeviationMs).toBe(0)
    expect(uniform.standardDeviationMs).toBeGreaterThan(0)
    expect(triangular.standardDeviationMs).toBeGreaterThan(0)
    expect(uniform.minDurationMs).toBeGreaterThanOrEqual(6_000)
    expect(uniform.maxDurationMs).toBeLessThanOrEqual(10_000)
  })

  test('CHARACTERIZATION: all nine simulation parameters alter a run scenario', async ({ page }) => {
    await loadModule(page, 'batch-workload')
    const panel = await openSimulation(page)

    // Seed and runs: make duration stochastic, then change both controls and run.
    await panel.getByRole('button', { name: 'Закрыть симуляцию' }).click()
    await page.getByText('Обработать заявку', { exact: true }).click({ force: true })
    const task = page.getByText('Свойства задачи').locator('xpath=..')
    await task.locator('select').first().selectOption('uniform')
    await task.getByText('Min', { exact: true }).locator('input').fill('1')
    await task.getByText('Max', { exact: true }).locator('input').fill('9')
    const simulation = await openSimulation(page)
    const seed = simulation.getByLabel('Seed')
    const runs = simulation.getByLabel('Прогоны')
    await seed.fill('42')
    await runs.fill('100')
    const seed42 = await runScenario(page)
    await seed.fill('43')
    const seed43 = await runScenario(page)
    expect(seed43).not.toEqual(seed42)
    await runs.fill('300')
    const moreRuns = await runScenario(page)
    expect(moreRuns.runs).toBe(300)
    expect(moreRuns).not.toEqual(seed43)
    await simulation.getByRole('button', { name: 'Закрыть симуляцию' }).click()

    // SLA, calendar start/end: the short working window makes each change observable.
    await loadModule(page, 'sla-calendar')
    const calendar = await openSimulation(page)
    await calendar.getByLabel('SLA, сек').fill('1')
    const strictSla = await runScenario(page)
    await calendar.getByLabel('SLA, сек').fill('60')
    const lenientSla = await runScenario(page)
    expect(lenientSla.onTimeRate).toBeGreaterThan(strictSla.onTimeRate ?? -1)
    await calendar.getByLabel('Работа с').fill('0')
    await calendar.getByLabel('до').fill('0.001')
    const earlyWindow = await runScenario(page)
    await calendar.getByLabel('Работа с').fill('0.0005')
    const laterStart = await runScenario(page)
    expect(laterStart.meanDurationMs).not.toBe(earlyWindow.meanDurationMs)
    await calendar.getByLabel('до').fill('0.002')
    const laterEnd = await runScenario(page)
    expect(laterEnd.meanDurationMs).not.toBe(laterStart.meanDurationMs)
    await calendar.getByRole('button', { name: 'Закрыть симуляцию' }).click()

    // Instances, arrival interval, arrival classes, and resource policy all
    // exercise their expandable UI controls and execute a fresh simulation.
    await loadModule(page, 'batch-workload')
    const workload = await openSimulation(page)
    await workload.getByLabel('Instances').fill('1')
    const oneInstance = await runScenario(page)
    await workload.getByLabel('Instances').fill('5')
    const fiveInstances = await runScenario(page)
    expect(fiveInstances.simulationInstances).toBe(5)
    expect(fiveInstances.meanDurationMs).toBeGreaterThan(oneInstance.meanDurationMs)
    await workload.getByLabel('Arrival, сек').fill('3')
    const spacedArrival = await runScenario(page)
    expect(spacedArrival.arrivalIntervalMs).toBe(3_000)
    expect(spacedArrival.meanDurationMs).toBeLessThan(fiveInstances.meanDurationMs)
    const classes = workload.locator('details').filter({ hasText: 'Классы прибытия' })
    await classes.locator('summary').click()
    await classes.getByRole('button', { name: 'Добавить класс' }).click()
    await classes.getByPlaceholder('Кол-во').fill('5')
    await classes.getByPlaceholder('Интервал, с').fill('0')
    await classes.getByPlaceholder('Priority').fill('10')
    const classifiedArrival = await runScenario(page)
    const configuredClasses = await page.evaluate(() => (
      window.__MIROBOARD_DEBUG__!.createBpmnModel() as { arrivalClasses: Array<{ count: number; intervalMs: number; priority: number }> }
    ).arrivalClasses)
    expect(configuredClasses).toContainEqual({ count: 5, intervalMs: 0, priority: 10 })
    expect(classifiedArrival.meanDurationMs).not.toBe(spacedArrival.meanDurationMs)
    const policies = workload.locator('details').filter({ hasText: 'Политики ресурсов' })
    await policies.locator('summary').click()
    const role = policies.getByText('Оператор', { exact: true }).locator('xpath=..')
    await role.locator('input').fill('1')
    await role.locator('select').selectOption('fifo')
    const fifo = await runScenario(page)
    await role.locator('input').fill('5')
    await role.locator('select').selectOption('priority')
    const higherCapacity = await runScenario(page)
    expect(higherCapacity.roleUtilization[0].capacity).toBe(5)
    expect(higherCapacity.roleUtilization[0].meanWaitingMs).not.toBe(fifo.roleUtilization[0].meanWaitingMs)
  })
})
