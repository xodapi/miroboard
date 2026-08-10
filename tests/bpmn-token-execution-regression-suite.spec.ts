import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const modules = [
  'basic-fixed',
  'parallel-queue',
  'sla-calendar',
  'batch-workload',
  'priority-queue',
  'fifo-vs-priority',
]

type Run = { completed: boolean; tokenPath: string[]; [key: string]: unknown }

async function loadModule(page: Page, title: string) {
  await page.getByRole('button', { name: 'Примеры' }).click()
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', `${title}.json`), 'utf8')) as { title: string }
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

test.describe('BPMN token execution, baseline-invariance and characterization', () => {
  for (const module of modules) {
    test(`BASELINE-INVARIANCE: ${module} run_bpmn matches M0 seed 42/runs 500`, async ({ page }) => {
      await loadModule(page, module)
      const actual = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
      const baseline = JSON.parse(readFileSync(join(process.cwd(), 'baseline', module, 'baseline.json'), 'utf8')) as { payload: { runBpmn: Run } }
      expect(actual).toEqual(baseline.payload.runBpmn)
      expect(actual.tokenPath.length).toBeGreaterThan(0)
    })
  }

  test('RELATIONAL characterization: same seed is deterministic and changed seed diverges', async ({ page }) => {
    await loadModule(page, 'parallel-queue')
    const result = await page.evaluate(() => {
      const hook = window.__MIROBOARD_DEBUG__!
      return [hook.simulateBpmn(42, 500), hook.simulateBpmn(42, 500), hook.simulateBpmn(7, 500)]
    })
    expect(result[0]).toEqual(result[1])
    expect(result[2]).not.toEqual(result[0])
  })

  test('CHARACTERIZATION: changing runs changes completedRuns without changing model validity', async ({ page }) => {
    await loadModule(page, 'basic-fixed')
    const result = await page.evaluate(() => {
      const hook = window.__MIROBOARD_DEBUG__!
      return { valid: hook.validateBpmn(), long: hook.simulateBpmn(42, 500), short: hook.simulateBpmn(42, 10) }
    })
    expect(result.valid).toEqual({ valid: true, issues: [] })
    expect(result.long.completedRuns).toBe(500)
    expect(result.short.completedRuns).toBe(10)
  })

  test('CHARACTERIZATION: parallel AND split activates both branches and join waits for both', async ({ page }) => {
    await loadModule(page, 'parallel-queue')
    const run = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
    expect(run.tokenPath).toEqual(['start', 'split', 'left', 'join', 'right', 'join', 'end'])
    expect(run.tokenPath.filter(id => id === 'join')).toHaveLength(2)
  })

  test('CHARACTERIZATION: token execution exposes a non-empty ordered trace for canvas playback', async ({ page }) => {
    await loadModule(page, 'basic-fixed')
    const run = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
    expect(run.completed).toBe(true)
    expect(run.tokenPath.every(Boolean)).toBe(true)
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByTitle('Проверить поток').click()
    await expect(page.getByText('Оценка:', { exact: false })).toBeVisible()
  })
})
