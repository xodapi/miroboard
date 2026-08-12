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

type SimulationSnapshot = {
  tokenPath: string[]
  simulation: Result
}

const TIME_TOLERANCE_MS = 1
const PROBABILITY_TOLERANCE = 0.01

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

async function configureUniformDuration(page: Page) {
  await page.getByText('Обработать заявку', { exact: true }).click({ force: true })
  const task = page.getByText('Свойства задачи').locator('xpath=..')
  await task.locator('select').first().selectOption('uniform')
  await task.getByText('Min', { exact: true }).locator('input').fill('1')
  await task.getByText('Max', { exact: true }).locator('input').fill('9')
  // Inspector updates React state asynchronously. The debug hook deliberately
  // reads that state, so wait before sampling the stochastic engine.
  await page.waitForTimeout(300)
}

async function sampleSimulation(page: Page, seed: number, runs: number): Promise<SimulationSnapshot> {
  return page.evaluate(({ seedValue, runCount }) => {
    const hook = window.__MIROBOARD_DEBUG__!
    return {
      tokenPath: hook.runBpmn().tokenPath,
      simulation: hook.simulateBpmn(seedValue, runCount),
    }
  }, { seedValue: seed, runCount: runs }) as Promise<SimulationSnapshot>
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

  test('RELATIONAL: fixed seeds converge bitwise while multiple distinct seeds change stochastic output', async ({ page }) => {
    await loadModule(page, 'batch-workload')
    await configureUniformDuration(page)
    const [first42, second42, seed99, seed7] = await Promise.all([
      sampleSimulation(page, 42, 1_000),
      sampleSimulation(page, 42, 1_000),
      sampleSimulation(page, 99, 1_000),
      sampleSimulation(page, 7, 1_000),
    ])

    // A seeded PRNG must replay the complete observable result, not merely echo
    // the requested seed. Exact equality intentionally proves bitwise convergence:
    // token paths, unrounded timings, percentile metrics, and every nested metric
    // must all replay from the same deterministic random stream.
    expect(first42).toEqual(second42)
    expect(first42.tokenPath).toEqual(second42.tokenPath)
    expect(first42.simulation).toEqual(second42.simulation)

    // Different seeds sample different deterministic streams. A time delta must
    // exceed ±1 ms and a probability delta ±0.01, so display rounding cannot
    // masquerade as a stochastic effect. Checking two alternate seeds prevents a
    // seed=42 versus seed=99-only special case from passing.
    const differsBeyondTolerance = (candidate: SimulationSnapshot) => {
      const timingChanged = [
        'meanDurationMs',
        'standardDeviationMs',
        'p50DurationMs',
        'p95DurationMs',
      ].some((metric) => Math.abs(
        Number(first42.simulation[metric]) - Number(candidate.simulation[metric]),
      ) > TIME_TOLERANCE_MS)
      const probabilityChanged = Math.abs(
        (first42.simulation.onTimeRate ?? 0) - (candidate.simulation.onTimeRate ?? 0),
      ) > PROBABILITY_TOLERANCE
      return timingChanged || probabilityChanged || first42.tokenPath.join('|') !== candidate.tokenPath.join('|')
    }
    expect(differsBeyondTolerance(seed99)).toBe(true)
    expect(differsBeyondTolerance(seed7)).toBe(true)
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

  test('RELATIONAL: runs alter aggregate distribution statistics, not only echoed metadata', async ({ page }) => {
    await loadModule(page, 'batch-workload')
    await configureUniformDuration(page)
    const [ten, thousand] = await Promise.all([
      sampleSimulation(page, 42, 10),
      sampleSimulation(page, 42, 1_000),
    ])

    expect(ten.simulation.runs).toBe(10)
    expect(thousand.simulation.runs).toBe(1_000)
    // A uniform 1–9 second task has non-zero variance. Ten observations are a
    // deliberately coarse sample, while 1,000 observations stabilise the mean and
    // percentile spread. Mean, variance (the square of the exposed standard
    // deviation), and p95-p50 spread are independent aggregate evidence that
    // `runs` controls sampling behaviour, rather than merely echoing metadata.
    const variance = (result: Result) => result.standardDeviationMs ** 2
    const percentileSpread = (result: Result) => result.p95DurationMs - result.p50DurationMs
    const aggregateDeltas = [
      Math.abs(ten.simulation.meanDurationMs - thousand.simulation.meanDurationMs),
      Math.abs(variance(ten.simulation) - variance(thousand.simulation)),
      Math.abs(percentileSpread(ten.simulation) - percentileSpread(thousand.simulation)),
    ]
    // The explicit ±1 ms tolerance applies to completion-time measures. Variance
    // is in ms², so its matching floor is (±1 ms)² = 1 ms².
    expect(aggregateDeltas.filter((delta) => delta > TIME_TOLERANCE_MS)).toHaveLength(aggregateDeltas.length)
    expect(thousand.simulation.standardDeviationMs).toBeGreaterThan(TIME_TOLERANCE_MS)
    expect(percentileSpread(thousand.simulation)).toBeGreaterThan(TIME_TOLERANCE_MS)
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
