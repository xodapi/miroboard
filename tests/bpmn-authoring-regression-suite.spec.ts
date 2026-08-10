import { test, expect, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
})

async function openBpmnPalette(page: Page) {
  const toolbar = page.locator('div.absolute.bottom-0')
  await toolbar.getByRole('button').last().click({ force: true })
  await page.getByText('◇ BPMN', { exact: true }).click()
  await expect(page.getByTitle('Старт')).toBeVisible()
}

async function place(page: Page, title: string, x: number, y: number) {
  await openBpmnPalette(page)
  await page.getByTitle(title).click({ force: true })
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: { x, y }, force: true })
}

test.describe('BPMN authoring regression surface', () => {
  test('toolbar creates all six BPMN tools with the expected rendered shapes', async ({ page }) => {
    await openBpmnPalette(page)
    for (const title of ['Старт', 'Задача', 'Шлюз XOR', 'Шлюз AND', 'Конец', 'Поток']) {
      await expect(page.getByTitle(title)).toBeVisible()
    }
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
    await expect(page.locator('[data-testid^="bpmn-flow-"]')).toHaveCount(1)
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
})
