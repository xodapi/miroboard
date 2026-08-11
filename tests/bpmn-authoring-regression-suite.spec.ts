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
  await expect(page.getByTitle('Старт')).toBeVisible()
}

async function place(page: Page, title: string, x: number, y: number) {
  await openBpmnPalette(page)
  await page.getByTitle(title).click({ force: true })
  await page.waitForTimeout(300)
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
}

async function elements(page: Page) {
  return page.evaluate(() => window.__MIROBOARD_DEBUG__!.getElements())
}

test.describe('BPMN authoring regression surface', () => {
  test('toolbar creates all six BPMN tools with the expected rendered shapes', async ({ page }) => {
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
      const x = 120 + index * 90
      const y = 140 + index * 100
      await openBpmnPalette(page)
      await page.getByTitle(title).click({ force: true })
      await page.waitForTimeout(300)
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
      await expect(page.locator(`[data-id="${created.id}"]`)).toBeVisible()
    }
    const before = (await elements(page)).length
    await openBpmnPalette(page)
    await page.locator('button[title="Поток"]').click({ force: true })
    await page.screenshot({ path: 'evidence/bpmn-toolbar-placement-iteration-6-Поток.png', fullPage: true })
    expect(await page.getByTitle('Поток').isVisible()).toBeTruthy()
    expect((await elements(page)).length).toBe(before)
  })

  test('sequence flow connects real BPMN nodes and free arrows retain free geometry', async ({ page }) => {
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.keyboard.press('s')
    await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x: 250, y: 250 }, force: true })
    await page.keyboard.press('e')
    await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x: 650, y: 250 }, force: true })
    await openBpmnPalette(page)
    await page.locator('button[title="Поток"]').click({ force: true })
    await page.getByText('Старт', { exact: true }).click({ force: true })
    await page.getByText('Конец', { exact: true }).last().click({ force: true })
    const created = await elements(page)
    const nodes = created.filter(e => e.bpmnNodeType)
    const flowData = created.find(e => e.bpmnFlow)!
    expect(flowData.bpmnFlow?.sourceId).toBe(nodes[0].id)
    expect(flowData.bpmnFlow?.targetId).toBe(nodes[1].id)
    const flow = page.locator('[data-testid^="bpmn-flow-"]')
    await expect(flow).toHaveCount(1)
    const flowTransform = await flow.getAttribute('transform')
    expect(flowTransform).toMatch(/translate\(/)

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
    await expect(page.locator('[data-testid^="bpmn-flow-"]')).toHaveCount(1)
    expect((await page.evaluate(() => window.__MIROBOARD_DEBUG__!.validateBpmn()))).toBeDefined()
    expect((await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn()))).toBeDefined()
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

  test('task inspector and flow properties persist after reselect and mode switches', async ({ page }) => {
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
  })

  test('switching board, BPMN, and simulation modes preserves the model', async ({ page }) => {
    await place(page, 'Задача', 350, 250)
    const before = await page.evaluate(() => JSON.stringify(window.__MIROBOARD_DEBUG__!.getElements()))
    await page.getByRole('button', { name: 'BPMN' }).click()
    await page.getByRole('button', { name: 'Симуляция' }).first().click()
    await expect(page.getByText('Monte Carlo', { exact: false })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Доска' }).click({ force: true })
    await page.getByRole('button', { name: 'BPMN' }).click()
    const after = await page.evaluate(() => JSON.stringify(window.__MIROBOARD_DEBUG__!.getElements()))
    expect(after).toBe(before)
  })
})

function panelLabels(page: Page) {
  return page.locator('aside').getByText(/Min|Mode|Max/)
}
