import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const examples = ['basic-fixed.json', 'parallel-queue.json', 'sla-calendar.json', 'batch-workload.json', 'priority-queue.json', 'fifo-vs-priority.json']

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(window.__MIROBOARD_DEBUG__))).toBe(true)
})

async function palette(page: Page) {
  if (!(await page.getByTitle('Старт').isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'BPMN' }).click()
  }
  const toolbar = page.locator('div.absolute.bottom-0')
  await toolbar.getByRole('button').last().click({ force: true })
  if (!(await page.getByTitle('Старт').isVisible().catch(() => false))) {
    await page.getByText('◇ BPMN', { exact: true }).click()
  }
  await expect(page.getByTitle('Старт')).toBeVisible()
}

async function place(page: Page, title: string, x: number, y: number) {
  await palette(page)
  await page.getByTitle(title).click({ force: true })
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
}

async function model(page: Page) {
  return page.evaluate(() => window.__MIROBOARD_DEBUG__!.validateBpmn())
}

async function elementId(page: Page, text: string) {
  return page.locator('[data-id]').filter({ hasText: text }).first().getAttribute('data-id')
}

test.describe('validate_bpmn characterization and invariance', () => {
  for (const name of examples) {
    test(`valid ${name} remains equal to M0 validation payload`, async ({ page }) => {
      await page.getByRole('button', { name: 'Примеры' }).click()
      const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', name), 'utf8')) as { title: string }
      await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section').getByRole('button', { name: new RegExp(fixture.title) }).click()
      const actual = await model(page)
      const baseline = JSON.parse(readFileSync(join(process.cwd(), 'baseline', name.replace('.json', ''), 'baseline.json'), 'utf8')) as { payload: { validateBpmn: unknown } }
      expect(actual).toEqual(baseline.payload.validateBpmn)
    })
  }

  test('characterizes missing start and simulation refusal', async ({ page }) => {
    await palette(page)
    await place(page, 'Задача', 360, 220)
    await place(page, 'Конец', 650, 220)
    const validation = await model(page)
    const simulation = await page.evaluate(() => {
      try { return { result: window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 10) } } catch (error) { return { error: String(error) } }
    })
    console.log('MISSING_START', JSON.stringify({ validation, simulation }))
    expect(validation).toEqual({
      valid: false,
      issues: [
        { severity: 'error', code: 'start-event-missing', message: 'A BPMN process needs at least one start event.', elementId: null },
        { severity: 'error', code: 'end-event-has-no-incoming', message: 'An end event needs an incoming flow.', elementId: await elementId(page, 'Конец') },
        { severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: await elementId(page, 'Конец') },
      ],
    })
    expect(simulation.error).toBe('Cannot run BPMN model until validation errors are resolved.')
  })

  test('characterizes orphaned task diagnostics', async ({ page }) => {
    await palette(page)
    await place(page, 'Задача', 360, 220)
    await place(page, 'Задача', 650, 220)
    const validation = await model(page)
    console.log('ORPHAN_TASKS', JSON.stringify(validation))
    expect(validation).toEqual({
      valid: false,
      issues: [
        { severity: 'error', code: 'start-event-missing', message: 'A BPMN process needs at least one start event.', elementId: null },
        { severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: await elementId(page, 'Задача') },
      ],
    })
  })

  test('characterizes gateway branch diagnostics', async ({ page }) => {
    await palette(page)
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.keyboard.press('x')
    await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x: 400, y: 220 }, force: true })
    await place(page, 'Конец', 700, 180)
    await place(page, 'Конец', 700, 320)
    console.log('GATEWAY_ELEMENTS', JSON.stringify(await page.evaluate(() => window.__MIROBOARD_DEBUG__!.getElements())))
    await palette(page)
    await page.locator('button[title="Поток"]').click({ force: true })
    await page.locator('[data-id]').first().click({ force: true })
    await page.getByText('Конец', { exact: true }).first().click({ force: true })
    await palette(page)
    await page.locator('button[title="Поток"]').click({ force: true })
    await page.locator('[data-id]').first().click({ force: true })
    await page.getByText('Конец', { exact: true }).last().click({ force: true })
    const validation = await model(page)
    console.log('XOR_NO_BRANCH_RULE', JSON.stringify(validation))
    const gatewayId = await page.locator('[data-id]').first().getAttribute('data-id')
    const endIds = await page.locator('[data-id]').filter({ hasText: 'Конец' }).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')))
    expect(validation).toEqual({
      valid: false,
      issues: [
        { severity: 'error', code: 'start-event-missing', message: 'A BPMN process needs at least one start event.', elementId: null },
        { severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: gatewayId },
        ...endIds.map(elementId => ({ severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId })),
      ],
    })
  })
})
