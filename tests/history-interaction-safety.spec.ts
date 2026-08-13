import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
})

test('save and open are clearly blocked while previewing a checkpoint', async ({ page }) => {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  page.once('dialog', dialog => dialog.accept('Перед проверкой'))
  await page.getByRole('button', { name: 'Отметить состояние' }).click()
  await page.getByRole('button', { name: 'Контрольные точки' }).click()
  await page.locator('aside[aria-label="История доски"] ol button').first().click()

  await page.keyboard.press('Control+S')
  await expect(page.locator('[data-ui]').filter({ hasText: 'Недоступно во время просмотра истории.' })).toBeVisible()
  await page.keyboard.press('Control+O')
  await expect(page.locator('[data-ui]').filter({ hasText: 'Недоступно во время просмотра истории.' })).toBeVisible()
})
