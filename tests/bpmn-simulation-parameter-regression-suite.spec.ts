import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const modules = ['basic-fixed', 'parallel-queue', 'sla-calendar', 'batch-workload', 'priority-queue', 'fifo-vs-priority']
type Result = Record<string, unknown> & {
  runs: number
  minDurationMs: number
  meanDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  standardDeviationMs: number
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
    expect(values.padded).toEqual(values.plain)
    expect(values.large.runs).toBe(5)
  })

  test('CHARACTERIZATION: configured run count is reported and statistics are ordered', async ({ page }) => {
    await loadModule(page, 'basic-fixed')
    const result = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 37)) as Result
    expect(result.runs).toBe(37)
    expect(result.minDurationMs).toBeLessThanOrEqual(result.meanDurationMs)
    expect(result.meanDurationMs).toBeLessThanOrEqual(result.maxDurationMs)
    expect(result.minDurationMs).toBeLessThanOrEqual(result.p50DurationMs)
    expect(result.p50DurationMs).toBeLessThanOrEqual(result.p95DurationMs)
    expect(result.p95DurationMs).toBeLessThanOrEqual(result.maxDurationMs)
    expect(Number.isFinite(result.meanDurationMs)).toBe(true)
    expect(result.meanDurationMs).toBeGreaterThanOrEqual(0)
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

  test('CHARACTERIZATION: UI exposes all nine simulation parameters', async ({ page }) => {
    await loadModule(page, 'basic-fixed')
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByTitle('Открыть Monte Carlo симуляцию').click()
    for (const label of ['Seed', 'Прогоны', 'SLA, сек', 'Работа с', 'до', 'Instances', 'Arrival, сек']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(page.getByText(/Классы прибытия/)).toBeVisible()
    await expect(page.getByText(/Политики ресурсов/)).toBeVisible()
  })
})
