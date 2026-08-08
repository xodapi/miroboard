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
  await expect(page.getByRole('heading', { name: 'Monte Carlo симуляция' })).toBeVisible()
  await expect(seed).toBeFocused()
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
