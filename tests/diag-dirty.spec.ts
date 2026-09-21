import { expect, test, type Page } from '@playwright/test'

/**
 * TEMPORARY DIAGNOSTIC — DELETE ONCE THE CAUSE IS KNOWN.
 *
 * Six cross-* suites fail with the toolbar reading «Не сохранено» where they
 * expect «Сохранено». jsdom does not reproduce it, and CI logs and artifacts live
 * on a blob host that is unreachable from the sandbox, so this spec exists to
 * carry evidence out through the one channel that works: an annotation.
 *
 * The app records every Yjs update (origin, which top-level type changed), every
 * dirty transition, every save outcome and every profileConfig write into
 * `window.__MIROBOARD_DIRTY_DIAG__`. Each test below reproduces one shape of the
 * failing flow and, if the status is wrong, throws the log as its error message.
 */

type DiagEntry = { at: number; kind: string } & Record<string, unknown>

async function installFileHandle(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let contents = ''
    let writes = 0
    const handle = {
      kind: 'file',
      name: 'diag.mboard',
      async createWritable() {
        return {
          write: async (value: string) => { contents = value; writes += 1 },
          close: async () => undefined,
        }
      },
      async getFile() {
        return { name: 'diag.mboard', text: async () => contents }
      },
    }
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle] })
    Object.defineProperty(window, '__diagWrites', { configurable: true, value: () => writes })
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
  })
}

async function boot(page: Page): Promise<void> {
  await installFileHandle(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible({ timeout: 10_000 })
}

/** Everything from the first save onward, plus a histogram of what came before. */
function window_(diag: DiagEntry[]): string {
  const firstSave = diag.findIndex(entry => entry.kind === 'save-outcome')
  const before = firstSave < 0 ? diag : diag.slice(0, firstSave)
  const after = firstSave < 0 ? [] : diag.slice(firstSave)
  const histogram: Record<string, number> = {}
  for (const entry of before) {
    const key = entry.kind === 'update' ? `update:${String(entry.origin)}:${(entry.changed as string[]).join('+')}` : entry.kind
    histogram[key] = (histogram[key] ?? 0) + 1
  }
  return JSON.stringify({ beforeSave: histogram, fromSave: after })
}

async function readDiag(page: Page): Promise<DiagEntry[]> {
  return page.evaluate(() => {
    const win = window as unknown as { __MIROBOARD_DIRTY_DIAG__?: DiagEntry[] }
    return win.__MIROBOARD_DIRTY_DIAG__ ?? []
  })
}

async function report(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(2_000)
  const status = await page.getByRole('status').textContent()
  const diag = await readDiag(page)
  const writes = await page.evaluate(() => (window as unknown as { __diagWrites?: () => number }).__diagWrites?.() ?? -1)
  if (status !== 'Сохранено') {
    throw new Error(`DIAG ${label}: status="${status}" fileWrites=${writes} log=${window_(diag)}`)
  }
}

async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
}

async function open(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByText('Открыт документ', { exact: false })).toBeVisible({ timeout: 10_000 })
}

async function drawRect(page: Page): Promise<void> {
  const box = await page.getByTestId('canvas').boundingBox()
  if (!box) throw new Error('canvas has no bounding box')
  await page.keyboard.press('r')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 320, box.y + 280)
  await page.mouse.up()
  await page.keyboard.press('v')
  await expect(page.locator('svg g[data-id]')).toHaveCount(1)
}

test('DIAG-A control: one drawn rectangle saves clean', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await drawRect(page)
  await save(page)
  await report(page, 'A-control-rect-save')
})

test('DIAG-B suspect: BPMN profile plus simulation configuration saves clean', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await drawRect(page)

  await page.getByRole('button', { name: /BPMN/ }).click()
  await expect(page.getByTitle('Задача')).toBeVisible({ timeout: 10_000 })
  await page.getByTitle('Задача').click()
  await page.getByTestId('canvas').click({ position: { x: 600, y: 340 } })
  await page.keyboard.press('v')

  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  const modal = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
  const inputs = modal.locator('input')
  await inputs.nth(0).fill('0042')
  await inputs.nth(1).fill('17')
  await modal.getByRole('button', { name: 'Закрыть симуляцию' }).click()

  await save(page)
  await report(page, 'B-bpmn-simulation-save')
})

test('DIAG-C reopen: a saved file opens clean', async ({ page }) => {
  test.setTimeout(120_000)
  await boot(page)
  await drawRect(page)
  await save(page)
  await report(page, 'C-save-before-reopen')

  await open(page)
  const status = await page.getByRole('status').textContent()
  const diag = await readDiag(page)
  if (status !== 'Сохранено') {
    throw new Error(`DIAG C-reopen: status="${status}" log=${JSON.stringify(diag.slice(-80))}`)
  }
})
