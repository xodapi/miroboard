import { expect, test, type Page } from '@playwright/test'

type SavedFile = {
  contents: string
  writes: number
  pickerCalls: number
}

type BoardSnapshot = {
  nodes: Array<{
    id: string
    kind: string
    order: number
    frame: { x: number; y: number; w: number | null; h: number | null; rotation: number }
    z: number
    style: { color: string; fill: string | null; stroke: number | null }
    content: { text?: string }
  }>
  edges: unknown[]
  profileConfig: unknown
}

function snapshot(contents: string): BoardSnapshot {
  const document = JSON.parse(contents) as BoardSnapshot
  return {
    nodes: document.nodes.map(({ id, kind, order, frame, z, style, content }) => ({ id, kind, order, frame, z, style, content })),
    edges: document.edges,
    profileConfig: document.profileConfig,
  }
}

async function installFileHandle(page: Page, initialContents = ''): Promise<void> {
  await page.addInitScript(initial => {
    let contents = initial
    let writes = 0
    let pickerCalls = 0
    const handle = {
      kind: 'file',
      name: 'roundtrip.mboard',
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
        return { name: 'roundtrip.mboard', text: async () => contents }
      },
    }
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        pickerCalls += 1
        return handle
      },
    })
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [handle],
    })
    ;(window as Window & { __crossRoundtripFile: () => SavedFile }).__crossRoundtripFile =
      () => ({ contents, writes, pickerCalls })
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
  }, initialContents)
}

async function boot(page: Page, contents = ''): Promise<void> {
  await installFileHandle(page, contents)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('svg').first()).toBeVisible()
}

async function save(page: Page): Promise<SavedFile> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
  return page.evaluate(() => (window as Window & { __crossRoundtripFile: () => SavedFile }).__crossRoundtripFile())
}

async function open(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByText('Открыт документ', { exact: false })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
}

async function place(page: Page, shortcut: string, x: number, y: number): Promise<void> {
  await page.keyboard.press(shortcut)
  await page.waitForTimeout(100)
  await page.getByTestId('canvas').click({ position: { x, y } })
  await page.waitForTimeout(100)
  // Sticky and text open an editor, so commit it before the next keyboard shortcut.
  if (await page.locator('textarea:visible, input:visible').last().isVisible().catch(() => false)) {
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('v')
}

async function draw(page: Page, shortcut: string, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.keyboard.press(shortcut)
  await page.waitForTimeout(100)
  const canvas = page.getByTestId('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas has no bounding box')
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y)
  await page.mouse.up()
  await page.waitForTimeout(100)
  await page.keyboard.press('v')
}

async function longPressElement(page: Page, index: number): Promise<void> {
  await page.getByTestId('canvas').click({ position: { x: 30, y: 30 } })
  await page.waitForTimeout(80)
  const box = await page.locator('svg g[data-id]').nth(index).boundingBox()
  if (!box) throw new Error(`Element ${index} has no bounding box`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(650)
  await page.mouse.up()
}

async function setSimulationConfiguration(page: Page): Promise<void> {
  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  const modal = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
  const inputs = modal.locator('input')
  await inputs.nth(0).fill('0042')
  await inputs.nth(1).fill('17')
  await modal.getByText('Классы прибытия (0)', { exact: true }).click()
  await modal.getByRole('button', { name: '+ Добавить класс' }).click()
  await modal.getByRole('button', { name: '+ Добавить класс' }).click()
  const arrivalInputs = modal.locator('details input')
  await arrivalInputs.nth(0).fill('3')
  await arrivalInputs.nth(1).fill('1.5')
  await arrivalInputs.nth(2).fill('2')
  await arrivalInputs.nth(3).fill('7')
  await arrivalInputs.nth(4).fill('0.25')
  await arrivalInputs.nth(5).fill('9')
  await modal.getByRole('button', { name: 'Закрыть симуляцию' }).click()
}

test('VAL-CROSS-001..005: real UI board survives reopen, retargeted saves, and five file cycles', async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  const author = await browser.newPage()
  await boot(author)

  // Build from empty UI with sticky, shape, text, connector, and a BPMN node.
  await place(author, 's', 300, 180)
  await draw(author, 'r', { x: 430, y: 220 }, { x: 520, y: 300 })
  await place(author, 't', 580, 260)
  await draw(author, 'a', { x: 700, y: 300 }, { x: 760, y: 340 })
  await author.getByRole('button', { name: /BPMN/ }).click()
  await expect(author.getByTitle('Задача')).toBeVisible()
  await author.getByTitle('Задача').click()
  await author.getByTestId('canvas').click({ position: { x: 860, y: 340 } })
  await author.keyboard.press('v')

  // Set labels through their real editing controls.
  const boardElements = author.locator('svg g[data-id]')
  await expect(boardElements).toHaveCount(5)
  for (const [index, label] of ['Липкая', 'Фигура', 'Текст'].entries()) {
    await boardElements.nth(index).dblclick()
    const editor = author.locator('textarea:visible, input:visible').last()
    await editor.fill(label)
    await editor.press('Enter')
  }

  // Move the sticky through the real canvas interaction before persisting its frame.
  await boardElements.nth(0).click()
  await boardElements.nth(0).dragTo(author.getByTestId('canvas'), { targetPosition: { x: 190, y: 130 } })

  // Establish an explicitly non-creation z order with the long-press context menu.
  await longPressElement(author, 0)
  await expect(author.getByText('⬆️ На передний план', { exact: true })).toBeVisible()
  await author.getByText('⬆️ На передний план', { exact: true }).click()
  await longPressElement(author, 1)
  await author.getByText('⬇️ На задний план', { exact: true }).click()

  await setSimulationConfiguration(author)
  await author.screenshot({ path: testInfo.outputPath('before-save.png') })
  const firstSave = await save(author)
  const before = snapshot(firstSave.contents)
  expect(before.nodes).toHaveLength(5)
  expect(before.nodes.map(node => node.content.text)).toEqual(expect.arrayContaining(['Липкая', 'Фигура', 'Текст', 'Задача']))
  expect(before.nodes.some(node => node.frame.x !== 220 || node.frame.y !== 140)).toBe(true)
  expect(before.profileConfig).toMatchObject({
    bpmn: {
      simulation: {
        seed: '0042',
        runs: '17',
        arrivalClasses: [
          { count: '3', intervalSec: '1.5', priority: '2' },
          { count: '7', intervalSec: '0.25', priority: '9' },
        ],
      },
    },
  })
  expect(firstSave.pickerCalls).toBe(1)
  await author.close()

  // A new page is an app teardown/relaunch, not a serializer-level round trip.
  const reopened = await browser.newPage()
  await boot(reopened, firstSave.contents)
  await open(reopened)
  await expect(reopened.locator('svg g[data-id]')).toHaveCount(5)
  await reopened.screenshot({ path: testInfo.outputPath('after-reopen.png') })
  await reopened.getByTitle('Открыть Monte Carlo симуляцию').click()
  const reopenedModal = reopened.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
  await expect(reopenedModal.locator('input').nth(0)).toHaveValue('0042')
  await expect(reopenedModal.locator('input').nth(1)).toHaveValue('17')
  await expect(reopenedModal.locator('details input').nth(0)).toHaveValue('3')
  await expect(reopenedModal.locator('details input').nth(4)).toHaveValue('0.25')
  await reopenedModal.getByRole('button', { name: 'Закрыть симуляцию' }).click()

  // The reopened FSA handle is the save target: edit via UI, save without Save As,
  // and require no extra picker call.
  await reopened.locator('svg g[data-id]').first().dblclick()
  const reopenedEditor = reopened.locator('textarea:visible, input:visible').last()
  await reopenedEditor.fill('Липкая, цикл 2')
  await reopenedEditor.press('Enter')
  const secondSave = await save(reopened)
  expect(secondSave.pickerCalls).toBe(0)
  expect(secondSave.writes).toBe(1)
  expect(snapshot(secondSave.contents).nodes.find(node => node.content.text === 'Липкая, цикл 2')).toBeTruthy()

  // Five full new-page open → save cycles must preserve the normalized document.
  let cycleContents = secondSave.contents
  const cycleSnapshots: BoardSnapshot[] = []
  for (let cycle = 1; cycle <= 5; cycle += 1) {
    await reopened.close()
    const cyclePage = await browser.newPage()
    await boot(cyclePage, cycleContents)
    await open(cyclePage)
    const saved = await save(cyclePage)
    cycleContents = saved.contents
    cycleSnapshots.push(snapshot(saved.contents))
    if (cycle === 5) await cyclePage.screenshot({ path: testInfo.outputPath('after-five-cycles.png') })
    await cyclePage.close()
  }
  expect(cycleSnapshots).toEqual(Array(5).fill(cycleSnapshots[0]))
  expect(snapshot(cycleContents)).toEqual(snapshot(secondSave.contents))
})
