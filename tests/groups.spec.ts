import { test, expect, type Page } from '@playwright/test'

/**
 * Groups (Ctrl+G). A group is a shared token on its members, not a container
 * element, so the canvas still has one `g[data-id]` per object.
 *
 * Pointer input goes through `page.mouse`. Coordinates stay inside the default
 * viewport and clear of the toolbar, matching tests/multi-select.spec.ts.
 */

async function boot(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible({ timeout: 5_000 })
  const skipTour = page.getByRole('button', { name: 'Пропустить' })
  if (await skipTour.isVisible().catch(() => false)) await skipTour.click()
  return { errors }
}

function elements(page: Page) {
  return page.locator('svg g[data-id]')
}

async function drawRect(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.keyboard.press('r')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
  await page.keyboard.press('v')
}

async function marquee(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.keyboard.press('v')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
}

function translateOf(value: string | null): { x: number; y: number } {
  const match = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(value ?? '')
  if (!match) throw new Error(`unexpected transform: ${value}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
})

test('Ctrl+G groups a selection and a later click selects both members', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })
  await marquee(page, { x: 60, y: 80 }, { x: 620, y: 460 })

  await page.keyboard.press('Control+g')
  await expect(page.getByText('Сгруппировано')).toBeVisible()
  await expect(page.getByTestId('group-outline')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  await expect(page.getByTestId('group-outline')).toHaveCount(0)

  const box = await elements(page).first().boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + 12, box!.y + 12)
  await expect(page.getByTestId('selection-count')).toContainText('2')
  await expect(page.getByTestId('group-outline')).toBeVisible()
  expect(errors).toEqual([])
})

test('dragging one member moves the group, and Ctrl+Shift+G releases it', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })
  await marquee(page, { x: 60, y: 80 }, { x: 620, y: 460 })
  await page.keyboard.press('Control+g')
  await page.keyboard.press('Escape')

  const before = (await elements(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')))).map(translateOf)
  const box = await elements(page).first().boundingBox()
  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 120, box!.y + 70)
  await page.mouse.up()
  const after = (await elements(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')))).map(translateOf)
  expect(after[0].x - before[0].x).toBeCloseTo(100, 5)
  expect(after[1].x - before[1].x).toBeCloseTo(after[0].x - before[0].x, 5)
  expect(after[1].y - before[1].y).toBeCloseTo(after[0].y - before[0].y, 5)

  await page.keyboard.press('Control+Shift+g')
  await expect(page.getByText('Группа снята')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.click(box!.x + 120, box!.y + 70)
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  expect(errors).toEqual([])
})
