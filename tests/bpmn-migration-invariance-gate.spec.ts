import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const modules = [
  'basic-fixed.json',
  'parallel-queue.json',
  'sla-calendar.json',
  'batch-workload.json',
  'priority-queue.json',
  'fifo-vs-priority.json',
] as const

type DebugPayload = {
  createBpmnModel: unknown
  validateBpmn: unknown
  runBpmn: unknown
  simulateBpmn: unknown
}

function baseline(name: string): DebugPayload {
  return (JSON.parse(readFileSync(join(process.cwd(), 'baseline', name.replace('.json', ''), 'baseline.json'), 'utf8')) as { payload: DebugPayload }).payload
}

async function openExample(page: Page, name: string): Promise<void> {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', name), 'utf8')) as { title: string; model: { nodes: unknown[]; flows: unknown[] } }
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
    .getByRole('button', { name: new RegExp(fixture.title) }).click()
  await expect(page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })).toBeVisible()
  await expect(page.locator('svg g[data-id]')).toHaveCount(fixture.model.nodes.length + fixture.model.flows.length)
}

async function debug(page: Page): Promise<DebugPayload> {
  await expect.poll(() => page.evaluate(() => Boolean(window.__MIROBOARD_DEBUG__))).toBe(true)
  await page.waitForTimeout(200)
  return page.evaluate(() => {
    const hook = window.__MIROBOARD_DEBUG__
    if (!hook) throw new Error('debug hook unavailable')
    return JSON.parse(JSON.stringify({
      createBpmnModel: hook.createBpmnModel(),
      validateBpmn: hook.validateBpmn(),
      runBpmn: hook.runBpmn(),
      simulateBpmn: hook.simulateBpmn(42, 500),
    }))
  })
}

async function saveAndReopen(page: Page, suffix: string): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button').filter({ hasText: 'Сохранить' }).first().click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByText('Открыт документ', { exact: false })).toBeVisible()
}

async function openMboardText(page: Page, text: string, name = 'mutation.mboard'): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  await page.locator('input[type="file"]').last().setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await page.waitForTimeout(300)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
    let saved = ''
    const handle = (name: string) => ({
      kind: 'file',
      name,
      async createWritable() {
        return { write: async (value: string) => { saved = value }, close: async () => undefined }
      },
      async getFile() { return { name, text: async () => saved } },
    })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => handle('roundtrip.mboard') })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [handle('roundtrip.mboard')] })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
})

test.describe('BPMN migration invariance gate', () => {
  for (const name of modules) {
    test(`${name} remains baseline-identical through real save/open and double round trip`, async ({ page }) => {
      await openExample(page, name)
      const expected = baseline(name)
      const original = await debug(page)
      expect(original).toEqual(expected)

      await saveAndReopen(page, `${name}:cycle1`)
      expect(await debug(page)).toEqual(expected)
      await saveAndReopen(page, `${name}:cycle2`)
      expect(await debug(page)).toEqual(expected)
    })
  }

  test('unknown namespaces and free-form annotations are simulation-inert and preserved', async ({ page }) => {
    await openExample(page, 'basic-fixed.json')
    const expected = await debug(page)
    await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button').filter({ hasText: 'Сохранить' }).first().click(),
    ])
    const path = await download[0].path()
    const document = JSON.parse(readFileSync(path!, 'utf8')) as { nodes: Array<Record<string, unknown>>; edges: unknown[]; profileConfig: Record<string, unknown> }
    document.nodes[0].profileData = { bpmn: document.nodes[0].profileData && (document.nodes[0].profileData as Record<string, unknown>).bpmn, mindmap: { arbitrary: ['payload'] } }
    document.nodes.push({
      id: 'freeform-annotation',
      kind: 'sticky',
      parentId: null,
      frame: { x: 10, y: 10, w: 100, h: 80, rotation: 0 },
      z: 99,
      style: { color: '#000', fill: '#fff', stroke: null },
      content: { text: 'annotation' },
      profileData: {},
    })
    await openMboardText(page, JSON.stringify(document), 'annotated.mboard')
    expect(await debug(page)).toEqual(expected)
  })

  test('v0 fixture migrates through the real Open path without changing document validity', async ({ page }) => {
    const legacy = readFileSync(join(process.cwd(), 'examples', 'legacy', 'v0-synthetic.mboard'), 'utf8')
    await openMboardText(page, legacy, 'v0-synthetic.mboard')
    await expect(page.getByText(/Открыт документ/)).toBeVisible()
    const payload = await debug(page)
    expect(payload.validateBpmn).toEqual({ valid: true, issues: [] })
    expect(payload.createBpmnModel).toMatchObject({ nodes: [] })
  })

  test('unsupported BPMN XML remains rejected without partial board replacement', async ({ page }) => {
    await openExample(page, 'basic-fixed.json')
    const importer = page.locator('input[type="file"]').first()
    await importer.setInputFiles({
      name: 'branching.bpmn',
      mimeType: 'application/xml',
      buffer: Buffer.from('<definitions><exclusiveGateway id="g"/><sequenceFlow sourceRef="a" targetRef="b"/><sequenceFlow sourceRef="a" targetRef="c"/></definitions>'),
    })
    await expect(page.getByText('Подготовить данные', { exact: true })).toBeVisible()
    await expect(page.getByText(/BPMN|импорт|Не удалось/i).last()).toBeVisible()
  })
})
