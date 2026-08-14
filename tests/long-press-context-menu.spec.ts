import { expect, test, type Locator, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible()
})

async function createSticky(page: Page): Promise<Locator> {
  await page.keyboard.press('s')
  await page.getByTestId('canvas').click({ position: { x: 420, y: 300 } })
  await page.keyboard.press('Enter')
  const sticky = page.locator('svg g[data-id]').filter({ hasText: 'Заметка' })
  await expect(sticky).toHaveCount(1)
  return sticky
}

test('a 650ms press keeps the z-order menu open after pointer-up', async ({ page }) => {
  const sticky = await createSticky(page)
  const box = await sticky.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()

  await expect(page.getByText('⬆️ На передний план', { exact: true })).toBeVisible()
  await expect(page.getByText('⬇️ На задний план', { exact: true })).toBeVisible()
  await page.waitForTimeout(100)
  await expect(page.getByText('⬆️ На передний план', { exact: true })).toBeVisible()
})

test('a moving pointer still drags instead of opening the long-press menu', async ({ page }) => {
  const sticky = await createSticky(page)
  const before = await sticky.getAttribute('transform')
  const box = await sticky.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move(box!.x + 30, box!.y + 30)
  await page.mouse.down()
  await page.mouse.move(box!.x + 130, box!.y + 100)
  await page.mouse.up()

  await expect(sticky).not.toHaveAttribute('transform', before!)
  await expect(page.getByText('⬆️ На передний план', { exact: true })).toBeHidden()
})
