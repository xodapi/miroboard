import { test, expect } from '@playwright/test'

test('FIFO vs Priority learning module displays priority class metrics', async ({ page }) => {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15_000 })
  
  // Skip onboarding if present
  const skipTour = page.getByRole('button', { name: 'Пропустить' })
  if (await skipTour.isVisible({ timeout: 1_000 }).catch(() => false)) await skipTour.click()
  
  // Open learning modules
  await page.getByRole('button', { name: 'Примеры' }).click()
  
  // Load FIFO vs Priority module
  await page.getByText('FIFO vs Priority: классы прибытия', { exact: true }).click()
  
  // Open simulation
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  
  // Verify arrival classes section is present (with count)
  await expect(page.getByText('Классы прибытия (2)')).toBeVisible()
  
  // Run simulation
  await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
  
  // Verify priority class metrics are displayed
  await expect(page.getByText('По приоритетам:')).toBeVisible()
  
  // Verify both priority classes appear (check for unique parts of the text)
  const prioritySection = page.locator('text=По приоритетам:').locator('..')
  await expect(prioritySection.getByText('Priority 10 ·', { exact: false })).toBeVisible()
  await expect(prioritySection.getByText('Priority 1 ·', { exact: false })).toBeVisible()
})
