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

async function placeShortcut(page: Page, shortcut: 's' | 'e' | 'x', x: number, y: number) {
  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.keyboard.press(shortcut)
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
}

async function model(page: Page) {
  return page.evaluate(() => window.__MIROBOARD_DEBUG__!.validateBpmn())
}

async function elementId(page: Page, text: string) {
  return page.locator('[data-id]').filter({ hasText: text }).first().getAttribute('data-id')
}

async function connect(page: Page, source: string, target: string) {
  await palette(page)
  await page.locator('button[title="Поток"]').click({ force: true })
  const sourceNode = source === 'X' ? page.locator('[data-id]').nth(1) : page.locator('[data-id]').filter({ hasText: source }).first()
  const targetNode = target === 'X' ? page.locator('[data-id]').nth(1) : page.locator('[data-id]').filter({ hasText: target }).first()
  await sourceNode.click({ force: true })
  await targetNode.click({ force: true })
}

async function flowIdsBetween(page: Page, source: string, target: string) {
  const sourceId = source === 'X' ? await page.locator('[data-id]').nth(1).getAttribute('data-id') : await elementId(page, source)
  const targetId = await elementId(page, target)
  return page.evaluate(({ sourceId, targetId }) => window.__MIROBOARD_DEBUG__!.getElements()
    .filter(element => element.bpmnFlow?.sourceId === sourceId && element.bpmnFlow?.targetId === targetId)
    .map(element => element.id), { sourceId, targetId })
}

async function createTerminalTaskGraph(page: Page) {
  await placeShortcut(page, 's', 360, 220)
  await placeShortcut(page, 'e', 700, 220)
  await connect(page, 'Старт', 'Конец')
  await place(page, 'Задача', 500, 420)
  await page.locator('[data-testid^="bpmn-flow-"]').click({ force: true })
  await page.keyboard.press('Delete')
  await connect(page, 'Старт', 'Задача')
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

  test('characterizes a task with no incoming flow', async ({ page }) => {
    await palette(page)
    await placeShortcut(page, 's', 360, 220)
    await placeShortcut(page, 'e', 700, 220)
    await connect(page, 'Старт', 'Конец')
    await place(page, 'Задача', 500, 420)
    const validation = await model(page)
    console.log('NO_INCOMING_TASK', JSON.stringify(validation))
    expect(validation).toEqual({
      valid: true,
      issues: [{ severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: await elementId(page, 'Задача') }],
    })
  })

  test('characterizes a task with no outgoing flow', async ({ page }) => {
    await palette(page)
    await createTerminalTaskGraph(page)
    const validation = await model(page)
    console.log('NO_OUTGOING_TASK', JSON.stringify(validation))
    expect(validation).toEqual({
      valid: false,
      issues: [
        { severity: 'error', code: 'end-event-has-no-incoming', message: 'An end event needs an incoming flow.', elementId: await elementId(page, 'Конец') },
        { severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: await elementId(page, 'Конец') },
      ],
    })
  })

  test('characterizes a missing end path', async ({ page }) => {
    await palette(page)
    await createTerminalTaskGraph(page)
    const validation = await model(page)
    const simulation = await page.evaluate(() => {
      try { return { result: window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 10) } } catch (error) { return { error: String(error) } }
    })
    console.log('MISSING_END', JSON.stringify({ validation, simulation }))
    expect(validation).toEqual({
      valid: false,
      issues: [
        { severity: 'error', code: 'end-event-has-no-incoming', message: 'An end event needs an incoming flow.', elementId: await elementId(page, 'Конец') },
        { severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: await elementId(page, 'Конец') },
      ],
    })
    expect(simulation.error).toBe('Cannot run BPMN model until validation errors are resolved.')
  })

  test('characterizes XOR flows with no conditions or default', async ({ page }) => {
    await palette(page)
    await placeShortcut(page, 's', 320, 220)
    await placeShortcut(page, 'x', 500, 220)
    await placeShortcut(page, 'e', 700, 160)
    await placeShortcut(page, 'e', 700, 340)
    await connect(page, 'Старт', 'X')
    await connect(page, 'X', 'Конец')
    await palette(page)
    await page.locator('button[title="Поток"]').click({ force: true })
    await page.locator('[data-id]').nth(1).click({ force: true })
    await page.getByText('Конец', { exact: true }).last().click({ force: true })
    const validation = await model(page)
    console.log('XOR_NO_BRANCH_RULE', JSON.stringify(validation))
    expect(validation).toEqual({ valid: true, issues: [] })
  })

  test('characterizes XOR probability totals above one', async ({ page }) => {
    await palette(page)
    await placeShortcut(page, 's', 320, 220)
    await placeShortcut(page, 'x', 500, 220)
    await placeShortcut(page, 'e', 700, 160)
    await placeShortcut(page, 'e', 700, 340)
    await connect(page, 'Старт', 'X')
    await connect(page, 'X', 'Конец')
    await palette(page)
    await page.locator('button[title="Поток"]').click({ force: true })
    await page.locator('[data-id]').nth(1).click({ force: true })
    await page.getByText('Конец', { exact: true }).last().click({ force: true })
    const flowIds = await flowIdsBetween(page, 'X', 'Конец')
    for (const flowId of flowIds) {
      await page.locator(`[data-id="${flowId}"]`).click({ force: true })
      await page.locator('#bpmn-flow-probability').fill('0.7')
    }
    const validation = await model(page)
    const simulation = await page.evaluate(() => {
      try { return { result: window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 10) } } catch (error) { return { error: String(error) } }
    })
    console.log('XOR_PROBABILITY_TOTAL', JSON.stringify({ validation, simulation }))
    expect(validation).toEqual({ valid: true, issues: [] })
    expect(simulation.error).toBeUndefined()
    expect(simulation.result).toBeDefined()
  })
})
