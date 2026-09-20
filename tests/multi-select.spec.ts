import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * Multi-selection, bulk operations and the participant profile.
 *
 * These are the Stage 0 foundations for collaboration (see
 * docs/COLLABORATION_ANALYSIS.md): presence cannot publish "what this
 * participant has selected" until a selection can hold more than one id, and
 * bulk operations have to be a single transaction for undo to stay sane.
 *
 * Coordinates stay inside the default 1280x720 viewport and away from the
 * bottom toolbar so a marquee never starts on a UI element.
 */

async function boot(page: Page) {
  // Only uncaught exceptions are collected. Console *errors* are not asserted:
  // the built artifact declares no favicon, so Chrome logs a 404 for
  // /favicon.ico on every load and that noise says nothing about the board.
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible({ timeout: 5_000 })
  const skipTour = page.getByRole('button', { name: 'Пропустить' })
  if (await skipTour.isVisible().catch(() => false)) await skipTour.click()
  return { errors, canvas: page.locator('div.absolute.inset-0.touch-none > svg') }
}

/** Draws a rectangle by dragging, then returns to the Select tool. */
async function drawRect(page: Page, canvas: Locator, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.keyboard.press('r')
  await canvas.dispatchEvent('pointerdown', { clientX: from.x, clientY: from.y, button: 0, pointerId: 1 })
  await canvas.dispatchEvent('pointermove', { clientX: to.x, clientY: to.y, pointerId: 1 })
  await canvas.dispatchEvent('pointerup', { clientX: to.x, clientY: to.y, pointerId: 1 })
  await page.keyboard.press('v')
}

async function marquee(page: Page, canvas: Locator, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  await page.keyboard.press('v')
  await canvas.dispatchEvent('pointerdown', { clientX: from.x, clientY: from.y, button: 0, pointerId: 2, shiftKey: shift })
  await canvas.dispatchEvent('pointermove', { clientX: to.x, clientY: to.y, pointerId: 2, shiftKey: shift })
  await canvas.dispatchEvent('pointerup', { clientX: to.x, clientY: to.y, pointerId: 2, shiftKey: shift })
}

function transforms(page: Page) {
  return page.locator('[data-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')))
}

function translateOf(value: string | null): { x: number; y: number } {
  const match = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(value ?? '')
  if (!match) throw new Error(`unexpected transform: ${value}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
})

test('marquee selects several objects and reports the count', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 420, y: 320 }, { x: 540, y: 400 })
  await expect(page.locator('[data-id]')).toHaveCount(2)

  await marquee(page, canvas, { x: 60, y: 80 }, { x: 620, y: 460 })

  await expect(page.getByTestId('selection-count')).toContainText('2')
  await expect(page.getByTestId('selection-anchor')).toBeVisible()
  expect(errors).toEqual([])
})

test('a marquee over one object shows no counter', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 700, y: 420 }, { x: 780, y: 480 })

  await marquee(page, canvas, { x: 60, y: 80 }, { x: 320, y: 280 })
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Shift extends the selection, Escape clears it without deleting', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 700, y: 420 }, { x: 780, y: 480 })

  await marquee(page, canvas, { x: 60, y: 80 }, { x: 320, y: 280 })
  await expect(page.getByTestId('selection-count')).toHaveCount(0)

  await marquee(page, canvas, { x: 660, y: 380 }, { x: 820, y: 500 }, true)
  await expect(page.getByTestId('selection-count')).toContainText('2')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  await expect(page.locator('[data-id]')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('Shift-click toggles a single object in and out of the selection', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 420, y: 140 }, { x: 540, y: 220 })

  const nodes = page.locator('[data-id]')
  await nodes.nth(0).click({ position: { x: 10, y: 10 } })
  await nodes.nth(1).click({ position: { x: 10, y: 10 }, modifiers: ['Shift'] })
  await expect(page.getByTestId('selection-count')).toContainText('2')

  await nodes.nth(0).click({ position: { x: 10, y: 10 }, modifiers: ['Shift'] })
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Delete removes the whole selection and one undo brings all of it back', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 420, y: 320 }, { x: 540, y: 400 })
  await drawRect(page, canvas, { x: 700, y: 480 }, { x: 780, y: 540 })

  await marquee(page, canvas, { x: 60, y: 80 }, { x: 620, y: 460 })
  await expect(page.getByTestId('selection-count')).toContainText('2')

  // Let the UndoManager close the creation step (captureTimeout is 500ms) so
  // the bulk delete becomes its own step.
  await page.waitForTimeout(600)
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-id]')).toHaveCount(1)

  await page.waitForTimeout(600)
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-id]')).toHaveCount(3)
  expect(errors).toEqual([])
})

test('dragging one member of a selection moves the whole group', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 420, y: 320 }, { x: 540, y: 400 })
  await marquee(page, canvas, { x: 60, y: 80 }, { x: 620, y: 460 })

  const before = (await transforms(page)).map(translateOf)
  const first = page.locator('[data-id]').first()
  const box = await first.boundingBox()
  expect(box).not.toBeNull()
  await first.dispatchEvent('pointerdown', { clientX: box!.x + 20, clientY: box!.y + 20, button: 0, pointerId: 3 })
  await canvas.dispatchEvent('pointermove', { clientX: box!.x + 120, clientY: box!.y + 70, pointerId: 3 })
  await canvas.dispatchEvent('pointerup', { clientX: box!.x + 120, clientY: box!.y + 70, pointerId: 3 })

  const after = (await transforms(page)).map(translateOf)
  expect(after.length).toBe(2)
  const moved = after.map((position, index) => ({
    dx: position.x - before[index].x,
    dy: position.y - before[index].y,
  }))
  // Both moved by the same delta: the selection stayed internally consistent.
  expect(moved[0].dx).toBeCloseTo(100, 5)
  expect(moved[1].dx).toBeCloseTo(moved[0].dx, 5)
  expect(moved[1].dy).toBeCloseTo(moved[0].dy, 5)
  expect(errors).toEqual([])
})

test('Ctrl+A selects the board and arrow keys nudge the selection', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 420, y: 320 }, { x: 540, y: 400 })

  await page.keyboard.press('Control+a')
  await expect(page.getByTestId('selection-count')).toContainText('2')

  const before = (await transforms(page)).map(translateOf)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  const after = (await transforms(page)).map(translateOf)

  expect(after[0].x - before[0].x).toBeCloseTo(1, 5)
  expect(after[0].y - before[0].y).toBeCloseTo(1, 5)
  expect(after[1].x - before[1].x).toBeCloseTo(1, 5)
  expect(errors).toEqual([])
})

test('Ctrl+D duplicates every selected object', async ({ page }) => {
  const { errors, canvas } = await boot(page)
  await drawRect(page, canvas, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, canvas, { x: 420, y: 320 }, { x: 540, y: 400 })
  await marquee(page, canvas, { x: 60, y: 80 }, { x: 620, y: 460 })

  await page.keyboard.press('Control+d')
  await expect(page.locator('[data-id]')).toHaveCount(4)
  await expect(page.getByTestId('selection-count')).toContainText('2')
  expect(errors).toEqual([])
})

test('the participant profile is editable and survives a reload', async ({ page }) => {
  const { errors } = await boot(page)

  const button = page.getByTestId('profile-button')
  await expect(button).toBeVisible()
  await button.click()

  const panel = page.getByTestId('profile-panel')
  await expect(panel).toBeVisible()
  await page.getByTestId('profile-name-input').fill('Алиса')
  await expect(panel).toContainText('Алиса')
  await page.getByTestId('profile-color-FF5D5D').click()

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('miro-user-profile') ?? 'null'))
  expect(stored.name).toBe('Алиса')
  expect(stored.color).toBe('#FF5D5D')
  expect(typeof stored.id).toBe('string')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('profile-button')).toHaveAttribute('title', /Алиса/)
  expect(errors).toEqual([])
})
