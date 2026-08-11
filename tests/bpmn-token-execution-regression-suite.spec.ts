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

const xorModel = (unmatched: boolean) => [
  { id: 'start', type: 'sticky', bpmnNodeType: 'startEvent', x: 320, y: 160, w: 78, h: 78, text: 'Старт', color: '#6BCB77', fill: '#6BCB77', createdBy: 'test' },
  { id: 'gateway', type: 'sticky', bpmnNodeType: 'xorGateway', x: 460, y: 160, w: 78, h: 78, text: 'X', color: '#FFB020', fill: '#FFB020', createdBy: 'test' },
  { id: 'branch-a', type: 'sticky', bpmnNodeType: 'task', x: 620, y: 80, w: 176, h: 76, text: 'Ветвь A', color: '#4D96FF', fill: '#4D96FF', bpmnDurationMs: 2000, createdBy: 'test' },
  { id: 'branch-b', type: 'sticky', bpmnNodeType: 'task', x: 620, y: 240, w: 176, h: 76, text: 'Ветвь B', color: '#4D96FF', fill: '#4D96FF', bpmnDurationMs: 3000, createdBy: 'test' },
  { id: 'end', type: 'sticky', bpmnNodeType: 'endEvent', x: 860, y: 160, w: 78, h: 78, text: 'Конец', color: '#FF5D5D', fill: '#FF5D5D', createdBy: 'test' },
  { id: 'start-gateway', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'start', targetId: 'gateway', flowType: 'sequence' } },
  { id: 'gateway-a', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'gateway', targetId: 'branch-a', flowType: 'sequence', condition: unmatched ? '__never__' : 'true' } },
  { id: 'gateway-b', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'gateway', targetId: 'branch-b', flowType: 'sequence', condition: unmatched ? '__never__' : 'false' } },
  { id: 'a-end', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'branch-a', targetId: 'end', flowType: 'sequence' } },
  { id: 'b-end', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'branch-b', targetId: 'end', flowType: 'sequence' } },
]

async function injectXorModel(page: Page, unmatched: boolean) {
  await page.addInitScript((elements) => {
    localStorage.setItem('board-local', JSON.stringify(elements))
  }, xorModel(unmatched))
  await page.goto('/')
  await expect.poll(async () => page.evaluate(() => window.__MIROBOARD_DEBUG__?.getElements().length)).toBe(10)
}

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

test.describe('BPMN token execution regression surface', () => {
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

  test('CHARACTERIZATION: condition edits on the shipped parallel topology preserve its AND trace', async ({ page }) => {
    await loadModule(page, 'parallel-queue')
    const flows = page.locator('[data-testid^="bpmn-flow-"]')
    const firstFlow = flows.nth(1)
    await firstFlow.click({ force: true })
    await page.locator('#bpmn-flow-condition').fill('false')
    const secondFlow = flows.nth(2)
    await secondFlow.click({ force: true })
    await page.locator('#bpmn-flow-condition').fill('true')
    const run = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
    expect(run.completed).toBe(true)
    expect(run.tokenPath).toEqual(['start', 'split', 'left', 'join', 'right', 'join', 'end'])
  })

  test('CHARACTERIZATION: unmatched conditions on the shipped parallel topology preserve its AND trace', async ({ page }) => {
    await loadModule(page, 'parallel-queue')
    const flows = page.locator('[data-testid^="bpmn-flow-"]')
    const firstFlow = flows.nth(1)
    await firstFlow.click({ force: true })
    await page.locator('#bpmn-flow-condition').fill('false')
    const secondFlow = flows.nth(2)
    await secondFlow.click({ force: true })
    await page.locator('#bpmn-flow-condition').fill('false')
    const run = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
    expect(run.completed).toBe(true)
    expect(run.tokenPath).toEqual(['start', 'split', 'left', 'join', 'right', 'join', 'end'])
  })

  test('CHARACTERIZATION: XOR conditions route to exactly one intended branch', async ({ page }) => {
    await injectXorModel(page, false)
    const run = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
    expect(run.completed).toBe(true)
    expect(run.tokenPath).toEqual(['start', 'gateway', 'branch-a', 'end'])
    expect(run.tokenPath.filter((id) => id === 'branch-a' || id === 'branch-b')).toHaveLength(1)
  })

  test('CHARACTERIZATION: unmatched XOR without default falls back to its first outgoing flow', async ({ page }) => {
    await injectXorModel(page, true)
    const run = (await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn())) as Run
    expect(run.completed).toBe(true)
    expect(run.tokenPath).toEqual(['start', 'gateway', 'branch-a', 'end'])
    expect(run.tokenPath).not.toContain('branch-b')
  })
})
