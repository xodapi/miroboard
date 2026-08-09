import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 })
  const skipTour = page.getByRole('button', { name: 'Пропустить' })
  if (await skipTour.isVisible({ timeout: 1_000 }).catch(() => false)) await skipTour.click()
})

test('opens BPMN mode and shows the contextual sidebar', async ({ page }) => {
  await page.getByRole('button', { name: 'BPMN' }).click()
  await expect(page.getByRole('button', { name: 'Симуляция' })).toBeVisible()
})

test('learning modules are separate from board templates', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await expect(page.getByRole('heading', { name: 'Учебные BPMN-модули' })).toBeVisible()
  await expect(page.getByText('Поток заявок: несколько instances')).toBeVisible()
  await expect(page.getByText('Приоритеты в очереди')).toBeVisible()
})

test('simulation exposes a focusable Seed input', async ({ page }) => {
  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.getByRole('button', { name: 'Симуляция' }).click()
  const seed = page.getByLabel('Seed')
  await seed.focus()
  await seed.fill('123')
  await expect(page.getByRole('heading', { name: 'Monte Carlo симуляция' })).toBeVisible()
  await expect(seed).toHaveValue('123')
})

test('simulation opens from the explicit mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Симуляция' }).click()
  await expect(page.getByRole('heading', { name: 'Monte Carlo симуляция' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Запустить симуляцию' })).toBeVisible()
})

test('runs Monte Carlo on a loaded priority learning module', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Приоритеты в очереди', { exact: true }).click()
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
  await expect(page.getByText('Средняя стоимость:')).toBeVisible()
  await expect(page.getByText('Оператор · capacity 1', { exact: false })).toBeVisible()
})

test('batch workload exposes instance and arrival controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Поток заявок: несколько instances', { exact: true }).click()
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  await expect(page.getByText('Instances', { exact: true })).toBeVisible()
  await expect(page.getByText('Arrival, сек', { exact: true })).toBeVisible()
})

test('Simulation remains usable on a mobile viewport', async ({ page }) => {
  await page.getByRole('button', { name: 'Симуляция' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Monte Carlo симуляция' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Запустить симуляцию' })).toBeVisible()
})

test('selecting a BPMN task exposes priority settings in Property Panel', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Приоритеты в очереди', { exact: true }).click()
  await page.getByText('Срочная заявка', { exact: true }).click({ force: true })
  await expect(page.locator('label').filter({ hasText: /^Priority$/ })).toBeVisible()
  await expect(page.getByText('Capacity', { exact: true })).toBeVisible()
})

test('batch workload reports batch metadata after Monte Carlo execution', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Поток заявок: несколько instances', { exact: true }).click()
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
  await expect(page.getByText('Средняя стоимость:')).toBeVisible()
})

test('loaded educational process reports valid BPMN status', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  await expect(page.locator('[title="BPMN-модель корректна"]')).toBeVisible()
})

test('selecting a sequence flow opens its Property Panel', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Приоритеты в очереди', { exact: true }).click()
  await page.getByTestId('bpmn-flow-f2').click({ force: true })
  await expect(page.getByText('Свойства sequence flow', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Условие')).toBeVisible()
})

test('onboarding can be reopened after clearing local state', async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem('miro-onboarding-seen'))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Пропустить' })).toBeVisible()
})

test('runs the BPMN token runner on a loaded educational process', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.getByTitle('Проверить поток').click()
  await expect(page.getByText('Оценка:', { exact: false })).toBeVisible()
})

test('parallel queue simulation reports resource waiting metrics', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Параллельные задачи и очередь ресурса', { exact: true }).click()
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
  await expect(page.getByText('Средняя стоимость:')).toBeVisible()
  await expect(page.getByText('capacity', { exact: false })).toBeVisible()
})

test('SLA calendar simulation reports on-time rate', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('SLA и рабочий календарь', { exact: true }).click()
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
  await expect(page.getByText('В срок:', { exact: false })).toBeVisible()
})

test('invalid BPMN import preserves the current board', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  const importer = page.locator('input[type="file"]')
  await importer.setInputFiles({ name: 'broken.bpmn', mimeType: 'application/xml', buffer: Buffer.from('<definitions><broken>') })
  await expect(page.getByText('Подготовить данные', { exact: true })).toBeVisible()
})

test('reloading a persisted board does not duplicate BPMN tasks', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  const task = page.getByText('Подготовить данные', { exact: true })
  await expect(task).toHaveCount(1)
  await page.reload()
  await expect(page.getByText('Подготовить данные', { exact: true })).toHaveCount(1)
})
