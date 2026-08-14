import { expect, test, type Page } from '@playwright/test'

type SnapshotEntry = {
  id: string
  at: string
  kind: 'auto' | 'named'
  label?: string
  snapshot: string
  elementCount: number
}

type SavedDocument = {
  contents: string
  writes: number
}

function savedDocument(page: Page): Promise<SavedDocument> {
  return page.evaluate(() => (window as Window & { __historyFile: () => SavedDocument }).__historyFile())
}

function history(contents: string): SnapshotEntry[] {
  return (JSON.parse(contents) as { history: { snapshots: SnapshotEntry[] } }).history.snapshots
}

function projection(contents: string): Array<{ id: string; frame: { x: number; y: number } }> {
  return (JSON.parse(contents) as {
    nodes: Array<{ id: string; frame: { x: number; y: number } }>
  }).nodes.map(({ id, frame }) => ({ id, frame }))
}

async function installFileHandle(page: Page, initialContents = ''): Promise<void> {
  await page.addInitScript(initial => {
    let contents = initial
    let writes = 0
    const handle = {
      kind: 'file',
      name: 'history-integration.mboard',
      async createWritable() {
        return {
          write: async (value: string) => {
            contents = value
            writes += 1
          },
          close: async () => undefined,
        }
      },
      async getFile() {
        return { name: 'history-integration.mboard', text: async () => contents }
      },
    }
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => handle,
    })
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [handle],
    })
    ;(window as Window & { __historyFile: () => SavedDocument }).__historyFile =
      () => ({ contents, writes })
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
  }, initialContents)
}

async function boot(page: Page, initialContents = ''): Promise<void> {
  await installFileHandle(page, initialContents)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible()
}

async function save(page: Page): Promise<SavedDocument> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
  return savedDocument(page)
}

async function open(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByText('Открыт документ', { exact: false })).toBeVisible()
}

async function addSticky(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.press('s')
  await page.getByTestId('canvas').click({ position: { x, y } })
  const editor = page.locator('textarea:visible, input:visible').last()
  await editor.press('Enter')
  await page.keyboard.press('v')
}

async function mark(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  page.once('dialog', dialog => dialog.accept(label))
  await page.getByRole('button', { name: 'Отметить состояние' }).click()
  await expect(page.getByText('Состояние отмечено', { exact: true })).toBeVisible()
}

async function selectSnapshot(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Контрольные точки' }).click()
  await page.locator('aside[aria-label="История доски"] ol button').filter({ hasText: `«${label}»` }).click()
  await expect(page.locator('[role="status"][data-ui]')).toContainText('Просмотр')
}

test('VAL-CROSS-006..012: history survives close/reopen, remains byte-stable, and saves live content', async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const author = await browser.newPage()
  await boot(author)

  await addSticky(author, 180, 160)
  await mark(author, 'До продолжения')
  await addSticky(author, 280, 160)
  await mark(author, 'Вторая точка')
  await addSticky(author, 380, 160)
  await mark(author, 'Третья точка')
  await addSticky(author, 480, 160)
  await mark(author, 'Четвертая точка')
  await addSticky(author, 580, 160)
  await mark(author, 'Пятая точка')
  await addSticky(author, 680, 160)

  const firstSave = await save(author)
  const beforeHistory = history(firstSave.contents)
  expect(beforeHistory).toHaveLength(6)
  expect(beforeHistory.filter(entry => entry.kind === 'named').map(entry => entry.label)).toEqual([
    'До продолжения', 'Вторая точка', 'Третья точка', 'Четвертая точка', 'Пятая точка',
  ])
  const namedBefore = beforeHistory.find(entry => entry.label === 'До продолжения')
  expect(namedBefore).toBeTruthy()

  await selectSnapshot(author, 'До продолжения')
  await author.screenshot({ path: testInfo.outputPath('preview-before-save.png') })
  await author.keyboard.press('Control+S')
  await expect(author.getByText('Недоступно во время просмотра истории.', { exact: true })).toBeVisible()
  expect((await savedDocument(author)).contents).toBe(firstSave.contents)
  await author.close()

  const reopened = await browser.newPage()
  await boot(reopened, firstSave.contents)
  await open(reopened)
  await expect(reopened.locator('svg g[data-id]')).toHaveCount(6)
  await reopened.getByRole('button', { name: 'Контрольные точки' }).click()
  await expect(reopened.locator('aside[aria-label="История доски"] ol button')).toHaveCount(6)
  await expect(reopened.getByText('«До продолжения»', { exact: true })).toBeVisible()
  const afterOpenHistory = history(firstSave.contents)
  expect(afterOpenHistory).toEqual(beforeHistory)

  await reopened.locator('aside[aria-label="История доски"] ol button').filter({ hasText: '«До продолжения»' }).click()
  await expect(reopened.locator('svg g[data-id]')).toHaveCount(1)
  await reopened.screenshot({ path: testInfo.outputPath('preview-after-reopen.png') })
  await reopened.getByRole('button', { name: 'Закрыть' }).click()

  const secondSave = await save(reopened)
  expect(history(secondSave.contents)).toEqual(expect.arrayContaining(beforeHistory))
  expect(history(secondSave.contents).slice(0, beforeHistory.length)).toEqual(beforeHistory)
  expect(projection(secondSave.contents)).toHaveLength(6)
  await reopened.close()
})

test('VAL-CROSS-009..011 and VAL-CROSS-029: restored files keep snapshots scrubbable and retain reported history', async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const author = await browser.newPage()
  await boot(author)
  await addSticky(author, 180, 180)
  await mark(author, 'Начальное состояние')
  await addSticky(author, 300, 180)
  await mark(author, 'Середина')
  await addSticky(author, 420, 180)
  const beforeRestore = await save(author)
  const beforeIds = history(beforeRestore.contents).map(entry => entry.id)

  await selectSnapshot(author, 'Начальное состояние')
  await author.getByRole('button', { name: 'Восстановить это состояние' }).click()
  await expect(author.locator('svg g[data-id]')).toHaveCount(1)
  const restored = await save(author)
  const restoredHistory = history(restored.contents)
  expect(restoredHistory.map(entry => entry.id)).toEqual(expect.arrayContaining(beforeIds))
  expect(restoredHistory).toHaveLength(beforeIds.length + 2)
  await author.close()

  const reopened = await browser.newPage()
  await boot(reopened, restored.contents)
  await open(reopened)
  await expect(reopened.locator('svg g[data-id]')).toHaveCount(1)
  await reopened.getByRole('button', { name: 'Контрольные точки' }).click()
  const entries = reopened.locator('aside[aria-label="История доски"] ol button')
  await expect(entries).toHaveCount(restoredHistory.length)
  for (let index = 0; index < restoredHistory.length; index += 1) {
    await entries.nth(index).click()
    await expect(reopened.locator('[role="status"][data-ui]')).toContainText('Просмотр')
  }
  await reopened.screenshot({ path: testInfo.outputPath('scrubbed-after-restore-reload.png') })
  await reopened.getByRole('button', { name: 'Закрыть' }).click()

  const finalSave = await save(reopened)
  const finalDocument = JSON.parse(finalSave.contents) as {
    history: { snapshots: SnapshotEntry[] }
    nodes: unknown[]
    edges: unknown[]
  }
  expect(finalDocument.history.snapshots.map(entry => entry.id)).toEqual(expect.arrayContaining(restoredHistory.map(entry => entry.id)))
  const currentStateBytes = new TextEncoder().encode(JSON.stringify({ nodes: finalDocument.nodes, edges: finalDocument.edges })).byteLength
  const historyBytes = new TextEncoder().encode(JSON.stringify(finalDocument.history)).byteLength
  expect(historyBytes / currentStateBytes).toBeLessThanOrEqual(3)
  await reopened.close()
})
