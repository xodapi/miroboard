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
  await toolbar.getByRole('button').last().click()
  if (!(await page.getByTitle('Старт').isVisible().catch(() => false))) {
    await page.getByText('◇ BPMN', { exact: true }).click()
  }
  await expect(bpmnPalette(page).getByTitle('Старт')).toBeVisible()
}

function bpmnPalette(page: Page) {
  return page.locator('div.mb-2.mx-auto.w-fit.p-2.rounded-2xl')
}

async function place(page: Page, title: string, x: number, y: number) {
  await palette(page)
  await bpmnPalette(page).getByTitle(title).click()
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
  await page.waitForTimeout(300)
}

async function placeShortcut(page: Page, shortcut: 's' | 'e' | 'x', x: number, y: number) {
  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.keyboard.press(shortcut)
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
  await page.waitForTimeout(300)
}

async function model(page: Page) {
  return page.evaluate(() => window.__MIROBOARD_DEBUG__!.validateBpmn())
}

async function elementId(page: Page, text: string) {
  return page.locator('[data-id]').filter({ hasText: text }).first().getAttribute('data-id')
}

async function bpmnNodeId(page: Page, nodeType: string) {
  return page.evaluate((type) => window.__MIROBOARD_DEBUG__!.getElements()
    .find(element => element.bpmnNodeType === type)?.id, nodeType)
}

async function unconnectedEndId(page: Page) {
  return page.evaluate(() => {
    const elements = window.__MIROBOARD_DEBUG__!.getElements()
    const incoming = new Set(elements.flatMap(element => element.bpmnFlow ? [element.bpmnFlow.targetId] : []))
    return elements.find(element => element.bpmnNodeType === 'endEvent' && !incoming.has(element.id))?.id
  })
}

async function connect(page: Page, source: string, target: string) {
  await palette(page)
  await bpmnPalette(page).getByTitle('Поток').click()
  const sourceId = source === 'X' ? await bpmnNodeId(page, 'xorGateway') : await elementId(page, source)
  const targetId = target === 'X' ? await bpmnNodeId(page, 'xorGateway') : await elementId(page, target)
  const sourceNode = page.locator(`[data-id="${sourceId}"]`)
  const targetNode = page.locator(`[data-id="${targetId}"]`)
  await sourceNode.click({ force: true })
  await targetNode.click({ force: true })
  await page.waitForTimeout(300)
}

async function flowIdsBetween(page: Page, source: string, target: string) {
  const sourceId = source === 'X' ? await bpmnNodeId(page, 'xorGateway') : await elementId(page, source)
  const targetId = await elementId(page, target)
  return page.evaluate(({ sourceId, targetId }) => window.__MIROBOARD_DEBUG__!.getElements()
    .filter(element => element.bpmnFlow?.sourceId === sourceId && element.bpmnFlow?.targetId === targetId)
    .map(element => element.id), { sourceId, targetId })
}

async function createTerminalTaskGraph(page: Page) {
  await placeShortcut(page, 's', 360, 220)
  await placeShortcut(page, 'e', 700, 220)
  await place(page, 'Задача', 500, 420)
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
        { severity: 'error', code: 'task-has-no-outgoing', message: 'A task needs an outgoing flow.', elementId: await elementId(page, 'Задача') },
        { severity: 'error', code: 'end-event-has-no-incoming', message: 'An end event needs an incoming flow.', elementId: await elementId(page, 'Конец') },
        { severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: await elementId(page, 'Задача') },
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
    await connect(page, 'Задача', 'Конец')
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
        { severity: 'error', code: 'task-has-no-outgoing', message: 'A task needs an outgoing flow.', elementId: await elementId(page, 'Задача') },
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
        { severity: 'error', code: 'task-has-no-outgoing', message: 'A task needs an outgoing flow.', elementId: await elementId(page, 'Задача') },
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
    await bpmnPalette(page).getByTitle('Поток').click()
    await page.locator(`[data-id="${await bpmnNodeId(page, 'xorGateway')}"]`).click({ force: true })
    await page.waitForTimeout(300)
    await page.getByText('Конец', { exact: true }).last().click({ force: true })
    await page.waitForTimeout(300)
    const validation = await model(page)
    console.log('XOR_NO_BRANCH_RULE', JSON.stringify(validation))
    expect(validation).toEqual({
      valid: false,
      issues: [
        { severity: 'warning', code: 'gateway-not-splitting', message: 'A splitting gateway normally has at least two outgoing flows.', elementId: await bpmnNodeId(page, 'xorGateway') },
        { severity: 'warning', code: 'gateway-not-joining', message: 'A joining gateway normally has at least two incoming flows.', elementId: await bpmnNodeId(page, 'xorGateway') },
        { severity: 'error', code: 'end-event-has-no-incoming', message: 'An end event needs an incoming flow.', elementId: await unconnectedEndId(page) },
        { severity: 'warning', code: 'node-unreachable', message: 'This BPMN node is unreachable from every start event.', elementId: await unconnectedEndId(page) },
      ],
    })
  })

  test('reports XOR probability totals above one for two valid branches', async ({ page }) => {
    const elements = [
      { id: 'start', type: 'sticky', x: 40, y: 160, w: 78, h: 78, text: 'Старт', color: '#6BCB77', fill: '#6BCB77', createdBy: 'test', bpmnNodeType: 'startEvent' },
      { id: 'xor', type: 'sticky', x: 180, y: 160, w: 78, h: 78, text: 'X', color: '#FFB020', fill: '#FFB020', createdBy: 'test', bpmnNodeType: 'xorGateway' },
      { id: 'end-a', type: 'sticky', x: 360, y: 80, w: 78, h: 78, text: 'Конец A', color: '#FF5D5D', fill: '#FF5D5D', createdBy: 'test', bpmnNodeType: 'endEvent' },
      { id: 'end-b', type: 'sticky', x: 360, y: 260, w: 78, h: 78, text: 'Конец B', color: '#FF5D5D', fill: '#FF5D5D', createdBy: 'test', bpmnNodeType: 'endEvent' },
      { id: 'start-xor', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'start', targetId: 'xor', flowType: 'sequence' } },
      { id: 'xor-a', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'xor', targetId: 'end-a', flowType: 'sequence', probability: 0.7 } },
      { id: 'xor-b', type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: 'test', bpmnFlow: { sourceId: 'xor', targetId: 'end-b', flowType: 'sequence', probability: 0.7 } },
    ]
    await page.addInitScript((board) => localStorage.setItem('board-local', JSON.stringify(board)), elements)
    await page.goto('/')
    await expect.poll(() => page.evaluate(() => window.__MIROBOARD_DEBUG__?.getElements().length)).toBe(elements.length)
    const validation = await model(page)
    const simulation = await page.evaluate(() => {
      try { return { result: window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 10) } } catch (error) { return { error: String(error) } }
    })
    console.log('XOR_PROBABILITY_TOTAL', JSON.stringify({ validation, simulation }))
    expect(validation).toEqual({
      valid: false,
      issues: [
        { severity: 'error', code: 'xor-probability-sum', message: 'XOR sequence-flow probabilities cannot sum to more than 1.', elementId: 'xor' },
      ],
    })
    expect(simulation.error).toBe('Cannot run BPMN model until validation errors are resolved.')
  })
})
