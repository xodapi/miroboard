import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
})

async function openBpmnPalette(page: Page) {
  const toolbar = page.locator('div.absolute.bottom-0')
  await toolbar.getByRole('button').last().click({ force: true })
  await expect(page.getByText('◇ BPMN', { exact: true })).toBeVisible()
  await page.getByText('◇ BPMN', { exact: true }).click()
  await expect(bpmnPalette(page)).toBeVisible()
  await expect(bpmnPalette(page).getByTitle('Старт')).toBeVisible()
}

function bpmnPalette(page: Page) {
  return page.locator('div.mb-2.mx-auto.w-fit.p-2.rounded-2xl')
}

async function place(page: Page, title: string, x: number, y: number) {
  await openBpmnPalette(page)
  await bpmnPalette(page).getByTitle(title).dispatchEvent('click')
  await page.waitForTimeout(100)
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
}

async function elements(page: Page) {
  return page.evaluate(() => window.__MIROBOARD_DEBUG__!.getElements())
}

async function dragElement(page: Page, id: string, deltaX: number, deltaY: number) {
  const target = page.locator(`[data-id="${id}"]`)
  const box = await target.boundingBox()
  if (!box) throw new Error(`Cannot drag missing element ${id}`)
  await page.getByRole('button', { name: 'Выбор' }).click()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2 + deltaY)
  await page.mouse.up()
}

test.describe('BPMN authoring regression surface', () => {
  test('toolbar creates every node tool with its type, shape, selection, and task inspector', async ({ page }) => {
    page.on('console', message => {
      if (message.text().startsWith('[BPMN diagnostic]')) {
        void Promise.all(message.args().map(argument => argument.jsonValue())).then(values => {
          console.log('[BPMN diagnostic browser]', JSON.stringify(values))
        })
      }
    })
    await page.getByRole('button', { name: 'BPMN' }).click()
    const tools = [
      ['Старт', 'startEvent'], ['Задача', 'task'], ['Шлюз XOR', 'xorGateway'],
      ['Шлюз AND', 'andGateway'], ['Конец', 'endEvent'],
    ] as const
    for (const [index, [title, nodeType]] of tools.entries()) {
      // Keep placement outside the BPMN workspace panel, which is a [data-ui]
      // overlay and deliberately consumes pointer events.
      const x = 300 + index * 150
      const y = 340 + (index % 2) * 140
      await openBpmnPalette(page)
      await bpmnPalette(page).getByTitle(title).dispatchEvent('click')
      await page.waitForTimeout(100)
      await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
      await page.screenshot({ path: `evidence/bpmn-toolbar-placement-iteration-${index + 1}-${title}.png`, fullPage: true })
      const appeared = (await elements(page)).some(e => e.bpmnNodeType === nodeType)
      expect(appeared, `${title} should create ${nodeType}`).toBe(true)
      const created = (await elements(page)).find(e => e.bpmnNodeType === nodeType)
      if (!created) throw new Error(`Tool ${title} did not create ${nodeType}`)
      expect(created.bpmnNodeType).toBe(nodeType)
      expect(created.type).toBe('sticky')
      expect(created.w).toBeGreaterThan(0)
      expect(created.h).toBeGreaterThan(0)
      const rendered = page.locator(`[data-id="${created.id}"]`)
      await expect(rendered).toBeVisible()
      await rendered.click({ force: true })
      const shape = rendered.locator(nodeType === 'task' ? 'rect' : nodeType.endsWith('Event') ? 'circle' : 'polygon')
      await expect(shape).toHaveCount(nodeType === 'task' ? 3 : nodeType === 'endEvent' ? 2 : 1)
      if (nodeType === 'task') {
        const inspector = page.locator('aside').filter({ hasText: 'Свойства задачи' })
        await expect(inspector).toBeVisible()
        await expect(inspector.locator('#bpmn-duration')).toBeVisible()
        await expect(inspector.locator('select')).toHaveValue('fixed')
      }
    }
    const before = (await elements(page)).length
    await openBpmnPalette(page)
    await bpmnPalette(page).getByTitle('Поток').dispatchEvent('click')
    await page.screenshot({ path: 'evidence/bpmn-toolbar-placement-iteration-6-Поток.png', fullPage: true })
    await expect(bpmnPalette(page).getByTitle('Поток')).toBeVisible()
    expect((await elements(page)).length).toBe(before)
  })

  test('sequence flow records selected endpoints and re-anchors after moving its source', async ({ page }) => {
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.keyboard.press('s')
    await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x: 250, y: 250 }, force: true })
    await page.keyboard.press('e')
    await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x: 650, y: 250 }, force: true })
    await openBpmnPalette(page)
    await bpmnPalette(page).getByTitle('Поток').dispatchEvent('click')
    await page.locator('[data-id]').filter({ hasText: 'Старт' }).click({ force: true })
    await page.locator('[data-id]').filter({ hasText: 'Конец' }).click({ force: true })
    const created = await elements(page)
    const nodes = created.filter(e => e.bpmnNodeType)
    const flowData = created.find(e => e.bpmnFlow)!
    expect(flowData.bpmnFlow?.sourceId).toBe(nodes[0].id)
    expect(flowData.bpmnFlow?.targetId).toBe(nodes[1].id)
    const flow = page.locator('[data-testid^="bpmn-flow-"]')
    await expect(flow).toHaveCount(1)
    const flowTransform = await flow.getAttribute('transform')
    expect(flowTransform).toMatch(/translate\(/)
    const sourceBeforeMove = nodes[0]
    await dragElement(page, sourceBeforeMove.id, 90, 45)
    await expect.poll(async () => (await elements(page)).find(element => element.id === sourceBeforeMove.id)?.x).toBe(sourceBeforeMove.x + 90)
    const reanchoredTransform = await flow.getAttribute('transform')
    expect(reanchoredTransform).not.toBe(flowTransform)
  })

  test('free arrow has geometry but never becomes a BPMN edge or changes validation/simulation', async ({ page }) => {
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.keyboard.press('s')
    await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x: 250, y: 250 }, force: true })
    await page.keyboard.press('e')
    await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x: 650, y: 250 }, force: true })
    await openBpmnPalette(page)
    await bpmnPalette(page).getByTitle('Поток').dispatchEvent('click')
    await page.locator('[data-id]').filter({ hasText: 'Старт' }).click({ force: true })
    await page.locator('[data-id]').filter({ hasText: 'Конец' }).click({ force: true })
    const before = await page.evaluate(() => {
      const debug = window.__MIROBOARD_DEBUG__!
      return { model: debug.createBpmnModel(), validation: debug.validateBpmn(), simulation: debug.simulateBpmn(42, 20) }
    })
    const canvas = page.locator('div.absolute.inset-0.touch-none > svg')
    await page.keyboard.press('a')
    await canvas.dispatchEvent('pointerdown', { clientX: 100, clientY: 500, pointerId: 2, button: 0 })
    await canvas.dispatchEvent('pointermove', { clientX: 300, clientY: 500, pointerId: 2 })
    await canvas.dispatchEvent('pointerup', { clientX: 300, clientY: 500, pointerId: 2 })
    const arrows = page.locator('[data-id]')
    await expect(arrows).toHaveCount(4)
    const freeArrow = (await elements(page)).find(e => e.type === 'arrow' && !e.bpmnFlow)!
    expect(freeArrow.bpmnFlow).toBeUndefined()
    expect(freeArrow.w).toBeGreaterThan(0)
    expect(freeArrow.h).toBeGreaterThanOrEqual(0)
    expect(freeArrow.x).toBe(100)
    expect(freeArrow.y).toBe(500)
    expect(freeArrow.w).toBe(200)
    expect(freeArrow.type).toBe('arrow')
    await expect(page.locator('[data-testid^="bpmn-flow-"]')).toHaveCount(1)
    const after = await page.evaluate(() => {
      const debug = window.__MIROBOARD_DEBUG__!
      return { model: debug.createBpmnModel(), validation: debug.validateBpmn(), simulation: debug.simulateBpmn(42, 20) }
    })
    expect(after.model).toEqual(before.model)
    expect(after.validation).toEqual(before.validation)
    expect(after.simulation).toEqual(before.simulation)
  })

  test('duration distribution reveals exactly the required parameters', async ({ page }) => {
    await place(page, 'Задача', 350, 250)
    await expect(page.getByText('Свойства задачи', { exact: true })).toBeVisible()
    const distribution = page.locator('aside select')
    await expect(distribution).toHaveValue('fixed')
    await expect(page.getByText('Min', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Mode', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Max', { exact: true })).toHaveCount(0)
    await distribution.selectOption('uniform')
    await expect(page.getByText('Min', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Max', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Mode', { exact: true })).toHaveCount(0)
    await distribution.selectOption('triangular')
    await expect(page.getByText('Min', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Mode', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Max', { exact: true })).toHaveCount(1)
    const labels = panelLabels(page)
    expect(labels).toBeDefined()
  })

  test('task inspector writes all node fields and flow inspector persists all flow fields', async ({ page }) => {
    await place(page, 'Задача', 300, 250)
    const panel = page.locator('aside').filter({ hasText: 'Свойства задачи' })
    await panel.locator('#bpmn-duration').fill('12.5')
    await panel.locator('select').selectOption('triangular')
    await panel.getByText('Роль', { exact: false }).locator('input').fill('Оператор')
    await panel.getByText('€/ч', { exact: false }).locator('input').fill('42')
    await panel.getByText('Capacity', { exact: false }).locator('input').fill('3')
    await panel.getByText('Priority', { exact: false }).locator('input').fill('7')
    await expect.poll(async () => (await elements(page)).find(e => e.bpmnNodeType === 'task')?.bpmnDurationMinMs).toBe(12500)
    await expect.poll(async () => (await elements(page)).find(e => e.bpmnNodeType === 'task')?.bpmnDurationModeMs).toBe(12500)
    await expect.poll(async () => (await elements(page)).find(e => e.bpmnNodeType === 'task')?.bpmnDurationMaxMs).toBe(12500)
    const editedTask = (await elements(page)).find(e => e.bpmnNodeType === 'task')!
    expect(editedTask.bpmnResourceRole).toBe('Оператор')
    expect(editedTask.bpmnCostPerHour).toBe(42)
    expect(editedTask.bpmnResourceCapacity).toBe(3)
    expect(editedTask.bpmnPriority).toBe(7)
    await page.getByRole('button', { name: 'Выбор' }).click()
    await page.locator('[data-id]').filter({ hasText: 'Задача' }).click()
    await expect(panel.locator('#bpmn-duration')).toHaveValue('12.5')
    await expect(panel.locator('select')).toHaveValue('triangular')
    await expect(panel.locator('input').nth(4)).toHaveValue('Оператор')
    await page.getByRole('button', { name: 'Доска' }).click()
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.locator('[data-id]').filter({ hasText: 'Задача' }).click()
    await expect(panel.locator('#bpmn-duration')).toHaveValue('12.5')
    await expect(panel.locator('input').nth(4)).toHaveValue('Оператор')
    const task = (await elements(page)).find(element => element.bpmnNodeType === 'task')!
    expect(task).toMatchObject({
      bpmnNodeType: 'task', bpmnDurationMs: 12500, bpmnDurationDistribution: 'triangular',
      bpmnDurationMinMs: 12500, bpmnDurationModeMs: 12500, bpmnDurationMaxMs: 12500,
      bpmnResourceRole: 'Оператор', bpmnCostPerHour: 42, bpmnResourceCapacity: 3, bpmnPriority: 7,
    })
    await place(page, 'Шлюз XOR', 600, 400)
    const xor = (await elements(page)).find(element => element.bpmnNodeType === 'xorGateway')!
    await openBpmnPalette(page)
    await bpmnPalette(page).getByTitle('Поток').dispatchEvent('click')
    await page.locator(`[data-id="${xor.id}"]`).click({ force: true })
    await page.locator(`[data-id="${task.id}"]`).click({ force: true })
    const createdFlow = (await elements(page)).find(element => element.bpmnFlow?.sourceId === xor.id)!
    await page.locator(`[data-testid="bpmn-flow-${createdFlow.id}"]`).click({ force: true })
    const flowInspector = page.locator('aside').filter({ hasText: 'Свойства sequence flow' })
    await flowInspector.locator('#bpmn-flow-condition').fill('amount > 100')
    await flowInspector.locator('#bpmn-flow-probability').fill('0.75')
    await flowInspector.getByRole('checkbox').check()
    const editedFlow = (await elements(page)).find(element => element.id === createdFlow.id)!
    expect(editedFlow.bpmnFlow).toEqual({
      sourceId: xor.id, targetId: task.id, flowType: 'sequence', condition: 'amount > 100', probability: 0.75, isDefault: true,
    })
    await page.getByRole('button', { name: 'Выбор' }).click()
    await page.locator(`[data-testid="bpmn-flow-${createdFlow.id}"]`).click({ force: true })
    await expect(flowInspector.locator('#bpmn-flow-condition')).toHaveValue('amount > 100')
    await expect(flowInspector.locator('#bpmn-flow-probability')).toHaveValue('0.75')
    await expect(flowInspector.getByRole('checkbox')).toBeChecked()
  })

  test('distribution parameters retain values and reject out-of-order triangular input', async ({ page }) => {
    await place(page, 'Задача', 350, 250)
    const panel = page.locator('aside').filter({ hasText: 'Свойства задачи' })
    await panel.locator('select').selectOption('triangular')
    const inputs = panel.locator('input[type="number"]')
    await inputs.nth(0).fill('10')
    await inputs.nth(1).fill('20')
    await inputs.nth(2).fill('30')
    await panel.locator('select').selectOption('fixed')
    await panel.locator('select').selectOption('triangular')
    await expect(inputs.nth(0)).toHaveValue('10')
    await expect(inputs.nth(1)).toHaveValue('20')
    await expect(inputs.nth(2)).toHaveValue('30')
    await inputs.nth(0).fill('40')
    await inputs.nth(1).fill('20')
    await inputs.nth(2).fill('10')
    const task = (await elements(page)).find(e => e.bpmnNodeType === 'task')!
    expect(task.bpmnDurationMinMs).toBe(20000)
    expect(task.bpmnDurationModeMs).toBe(10000)
    expect(task.bpmnDurationMaxMs).toBe(1000)
    const validation = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.validateBpmn()) as { issues?: { elementId?: string }[] }
    expect(validation.issues?.some(issue => issue.elementId === task.id)).toBe(true)
    await expect(page.locator('body')).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      try {
        window.__MIROBOARD_DEBUG__!.simulateBpmn(42, 20)
        return 'simulated'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })).toContain('validation errors')
  })

  test('switching board, BPMN, and simulation modes preserves the model', async ({ page }) => {
    await place(page, 'Задача', 350, 250)
    await page.getByRole('button', { name: 'BPMN' }).click()
    await place(page, 'Старт', 300, 500)
    await place(page, 'Конец', 800, 500)
    await expect.poll(async () => (await elements(page)).filter(element => element.bpmnNodeType).length).toBe(3)
    const bpmnNodes = await elements(page)
    const start = bpmnNodes.find(element => element.bpmnNodeType === 'startEvent')!
    const task = bpmnNodes.find(element => element.bpmnNodeType === 'task')!
    const end = bpmnNodes.find(element => element.bpmnNodeType === 'endEvent')!
    for (const [source, target] of [[start, task], [task, end]]) {
      await openBpmnPalette(page)
      await bpmnPalette(page).getByTitle('Поток').dispatchEvent('click')
      await page.locator(`[data-id="${source.id}"]`).click({ force: true })
      await page.locator(`[data-id="${target.id}"]`).click({ force: true })
    }
    const before = await page.evaluate(() => {
      const debug = window.__MIROBOARD_DEBUG__!
      return { model: debug.createBpmnModel(), simulation: debug.simulateBpmn(42, 20) }
    })
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByRole('button', { name: 'Симуляция' }).first().click()
    await expect(page.getByText('Monte Carlo', { exact: false })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Доска' }).click({ force: true })
    await page.getByRole('button', { name: 'BPMN' }).click()
    const after = await page.evaluate(() => {
      const debug = window.__MIROBOARD_DEBUG__!
      return { model: debug.createBpmnModel(), simulation: debug.simulateBpmn(42, 20) }
    })
    expect(after).toEqual(before)
  })
})

function panelLabels(page: Page) {
  return page.locator('aside').getByText(/Min|Mode|Max/)
}
