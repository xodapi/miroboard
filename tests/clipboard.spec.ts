import { test, expect, type Page } from '@playwright/test'

/**
 * Copy / cut / paste of a selection (Stage 0.3 of docs/COLLABORATION_ANALYSIS.md).
 *
 * The clipboard payload is validated and remapped in src/collab/clipboard.ts and
 * covered there by unit tests; this suite checks the wiring a unit test cannot
 * see — the shortcuts, the resulting document, and that a paste is a single undo
 * step. It deliberately does not depend on the *system* clipboard: a `file://`
 * deployment (how this app is shipped) has no clipboard permission, so the app
 * keeps an in-memory copy and only opportunistically writes through. Assertions
 * therefore stay within one page load.
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

/** Board elements only — the minimap and the history preview render their own copies. */
function elements(page: Page) {
  return page.locator('svg g[data-id]')
}

/**
 * Draws a rectangle by dragging with trusted mouse input, then returns to the
 * Select tool. Synthetic PointerEvents are not equivalent: gestures read React
 * state written by the previous event, which is not guaranteed to be committed
 * by the time the next synthetic event is dispatched.
 */
async function drawRect(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.keyboard.press('r')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2)
  await page.mouse.move(to.x, to.y)
  await page.mouse.up()
  await page.keyboard.press('v')
}

/** Selects everything on the board, the way a user would. */
async function selectAll(page: Page) {
  await page.keyboard.press('v')
  await page.keyboard.press('Control+a')
}

function idsOf(page: Page) {
  return elements(page).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.id ?? ''))
}

function translateOf(value: string | null): { x: number; y: number } {
  const match = /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(value ?? '')
  if (!match) throw new Error(`unexpected transform: ${value}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

function transformsOf(page: Page) {
  return elements(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')))
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
})

test('Ctrl+C then Ctrl+V pastes the selection under new ids, offset from the source', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })
  const before = await idsOf(page)
  const beforeTransforms = await transformsOf(page)
  expect(before).toHaveLength(2)

  await selectAll(page)
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')

  await expect(elements(page)).toHaveCount(4)
  const after = await idsOf(page)
  // The sources keep their identity; the copies are new and distinct.
  expect(after.slice(0, 2)).toEqual(before)
  expect(after.slice(2).every(id => !before.includes(id))).toBe(true)
  expect(new Set(after.slice(2)).size).toBe(2)

  const afterTransforms = await transformsOf(page)
  expect(afterTransforms.slice(0, 2)).toEqual(beforeTransforms)
  for (const [index, source] of beforeTransforms.entries()) {
    const source_at = translateOf(source)
    const pasted = translateOf(afterTransforms[index + 2])
    expect(pasted.x).toBe(source_at.x + 20)
    expect(pasted.y).toBe(source_at.y + 20)
  }

  // The paste is what ends up selected, so it can be moved or deleted straight away.
  await expect(page.getByTestId('selection-count')).toContainText('2')
  expect(errors).toEqual([])
})

test('Ctrl+X empties the board and the clipboard still holds the content', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })

  await selectAll(page)
  await page.keyboard.press('Control+x')
  await expect(elements(page)).toHaveCount(0)

  await page.keyboard.press('Control+v')
  await expect(elements(page)).toHaveCount(2)
  expect(errors).toEqual([])
})

test('a paste is one undo step', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await drawRect(page, { x: 420, y: 320 }, { x: 540, y: 400 })

  // The UndoManager merges every write that lands inside its capture window
  // (500ms) into ONE stack item, and the window is measured backwards from the
  // last write. Waiting only before the undo therefore merges the two rectangle
  // creations with the paste, and undo wipes the board instead of the paste.
  // Let the creation step close first, so the paste is a step of its own.
  await page.waitForTimeout(700)

  await selectAll(page)
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await expect(elements(page)).toHaveCount(4)

  await page.waitForTimeout(700)
  await page.keyboard.press('Control+z')
  await expect(elements(page)).toHaveCount(2)
  expect(errors).toEqual([])
})

test('pasting with nothing of ours on the clipboard changes nothing and says so', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  const before = await transformsOf(page)

  await page.keyboard.press('Control+v')

  await expect(elements(page)).toHaveCount(1)
  expect(await transformsOf(page)).toEqual(before)
  // The toast is a [data-ui] element with aria-live, not role="status" — that
  // role already belongs to the save indicator in the toolbar.
  await expect(page.locator('[data-ui]').filter({ hasText: 'В буфере обмена нет объектов miroboard' })).toBeVisible()
  expect(errors).toEqual([])
})

test('Ctrl+C with no selection leaves the document alone', async ({ page }) => {
  const { errors } = await boot(page)
  await drawRect(page, { x: 120, y: 140 }, { x: 240, y: 220 })
  await page.keyboard.press('Escape')
  const before = await transformsOf(page)

  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')

  await expect(elements(page)).toHaveCount(1)
  expect(await transformsOf(page)).toEqual(before)
  expect(errors).toEqual([])
})
