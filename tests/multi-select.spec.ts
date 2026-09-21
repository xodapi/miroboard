import { test, expect, type Page } from '@playwright/test'

/**
 * Multi-selection, bulk operations and the participant profile.
 *
 * These are the Stage 0 foundations for collaboration (see
 * docs/COLLABORATION_ANALYSIS.md): presence cannot publish "what this
 * participant has selected" until a selection can hold more than one id, and
 * bulk operations have to be a single transaction for undo to stay sane.
 *
 * All pointer input goes through `page.mouse`, i.e. trusted browser events, the
 * way every other interaction spec in this repo does it. Dispatching synthetic
 * PointerEvents looked equivalent but is not: a drag reads `dragInfo` from React
 * state, and state written by one synthetic event is not guaranteed to be
 * committed before the next one is dispatched, so the gesture silently did
 * nothing. Coordinates stay inside the default 1280x720 viewport and away from
 * the bottom toolbar, so a marquee never starts on a UI element.
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
  return { errors }
}

/** Board elements only — the minimap and the history preview render their own copies. */
function elements(page: Page) {
  return page.locator('svg g[data-id]')
}

/** Draws a rectangle by dragging, then returns to the Select tool. */
async function drawRect(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.keyboard.press('r')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
  await page.keyboard.press('v')
}

/** Rubber-band selection over empty canvas. Shift extends the anchored selection. */
async function marquee(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  await page.keyboard.press('v')
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}

function transforms(page: Page) {
  return elements(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')))
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
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })
  await expect(elements(page)).toHaveCount(2)

  await marquee(page, { x: 60, y: 80 }, { x: 620, y: 460 })

  await expect(page.getByTestId('selection-count')).toContainText('2')
  await expect(page.getByTestId('selection-anchor')).toBeVisible()
  expect(errors).toEqual([])
})

test('a marquee over one object shows no counter', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 700, y: 420 }, { x: 780, y: 480 })

  await marquee(page, { x: 60, y: 80 }, { x: 320, y: 280 })
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Shift extends the selection, Escape clears it without deleting', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 700, y: 420 }, { x: 780, y: 480 })

  await marquee(page, { x: 60, y: 80 }, { x: 320, y: 280 })
  await expect(page.getByTestId('selection-count')).toHaveCount(0)

  await marquee(page, { x: 660, y: 380 }, { x: 820, y: 500 }, true)
  await expect(page.getByTestId('selection-count')).toContainText('2')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  await expect(elements(page)).toHaveCount(2)
  expect(errors).toEqual([])
})

test('Shift-click toggles a single object in and out of the selection', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 140 }, { x: 540, y: 220 })

  const nodes = elements(page)
  await nodes.nth(0).click({ position: { x: 10, y: 10 } })
  await nodes.nth(1).click({ position: { x: 10, y: 10 }, modifiers: ['Shift'] })
  await expect(page.getByTestId('selection-count')).toContainText('2')

  await nodes.nth(0).click({ position: { x: 10, y: 10 }, modifiers: ['Shift'] })
  await expect(page.getByTestId('selection-count')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Delete removes the whole selection and one undo brings all of it back', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })
  await drawRect(page, { x: 700, y: 480 }, { x: 780, y: 540 })

  await marquee(page, { x: 60, y: 80 }, { x: 620, y: 460 })
  await expect(page.getByTestId('selection-count')).toContainText('2')

  // Let the UndoManager close the creation step (captureTimeout is 500ms) so
  // the bulk delete becomes its own step.
  await page.waitForTimeout(600)
  await page.keyboard.press('Delete')
  await expect(elements(page)).toHaveCount(1)

  await page.waitForTimeout(600)
  await page.keyboard.press('Control+z')
  await expect(elements(page)).toHaveCount(3)
  expect(errors).toEqual([])
})

test('dragging one member of a selection moves the whole group', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })
  await marquee(page, { x: 60, y: 80 }, { x: 620, y: 460 })
  await expect(page.getByTestId('selection-count')).toContainText('2')

  const before = (await transforms(page)).map(translateOf)
  const box = await elements(page).first().boundingBox()
  expect(box).not.toBeNull()

  // Grab the first member and drag it 100px right and 50px down.
  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 70, box!.y + 45)
  await page.mouse.move(box!.x + 120, box!.y + 70)
  await page.mouse.up()

  const after = (await transforms(page)).map(translateOf)
  expect(after.length).toBe(2)
  const moved = after.map((position, index) => ({
    dx: position.x - before[index].x,
    dy: position.y - before[index].y,
  }))
  // Both moved by the same delta: the selection stayed internally consistent.
  expect(moved[0].dx).toBeCloseTo(100, 5)
  expect(moved[0].dy).toBeCloseTo(50, 5)
  expect(moved[1].dx).toBeCloseTo(moved[0].dx, 5)
  expect(moved[1].dy).toBeCloseTo(moved[0].dy, 5)
  expect(errors).toEqual([])
})

test('Ctrl+A selects the board and arrow keys nudge the selection', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })

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
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })
  await marquee(page, { x: 60, y: 80 }, { x: 620, y: 460 })
  await expect(page.getByTestId('selection-count')).toContainText('2')

  await page.keyboard.press('Control+d')
  await expect(elements(page)).toHaveCount(4)
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
