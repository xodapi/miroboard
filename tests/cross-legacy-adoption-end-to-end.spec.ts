import * as Y from 'yjs'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type LegacyNode = {
  id: string
  type: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  durationMs?: number
  durationDistribution?: 'fixed' | 'uniform' | 'triangular'
  durationMinMs?: number
  durationModeMs?: number
  durationMaxMs?: number
  resourceRole?: string
  costPerHour?: number
  resourceCapacity?: number
  priority?: number
}

type LegacyFlow = {
  id: string
  sourceId: string
  targetId: string
  flowType?: 'sequence' | 'message'
  condition?: string
  probability?: number
  isDefault?: boolean
}

type EducationalFixture = {
  title: string
  model: {
    nodes: LegacyNode[]
    flows: LegacyFlow[]
  }
}

type SnapshotEntry = {
  id: string
  at: string
  kind: 'auto' | 'named' | 'restore-transition'
  label?: string
  snapshot: string
  elementCount: number
}

type SavedMboard = {
  format: 'mboard'
  meta: { id: string; title?: string }
  nodes: Array<{ id: string; content?: { text?: string } }>
  edges: unknown[]
  history: { yjsState: string | null; snapshots: SnapshotEntry[] }
}

type LegacyRecord = {
  roomId: string
  title: string
  elements: Array<Record<string, unknown>>
  profileConfig?: Record<string, unknown>
  malformed?: boolean
}

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', 'basic-fixed.json'), 'utf8')) as EducationalFixture
const baseline = JSON.parse(readFileSync(join(process.cwd(), 'baseline', 'basic-fixed', 'baseline.json'), 'utf8')) as {
  payload: { simulateBpmn: Record<string, unknown> }
}

function colorForType(type: string): string {
  return ({
    startEvent: '#6BCB77',
    endEvent: '#FF5D5D',
    task: '#4D96FF',
    xorGateway: '#FFB020',
    andGateway: '#FFB020',
    orGateway: '#FFB020',
  }[type] ?? '#4D96FF')
}

function fixtureElements(model: EducationalFixture['model']): Array<Record<string, unknown>> {
  const nodes = model.nodes.map(node => {
    const type = ['startEvent', 'endEvent', 'xorGateway', 'andGateway', 'orGateway'].includes(node.type)
      ? node.type
      : 'task'
    const color = colorForType(type)
    return {
      id: node.id,
      type: 'sticky',
      x: node.x ?? 100,
      y: node.y ?? 100,
      w: node.width ?? (type === 'task' ? 176 : 78),
      h: node.height ?? (type === 'task' ? 76 : 78),
      text: node.name || (type === 'task' ? 'Задача' : ''),
      color,
      fill: color,
      bpmnNodeType: type,
      bpmnDurationMs: node.durationMs,
      bpmnDurationDistribution: node.durationDistribution,
      bpmnDurationMinMs: node.durationMinMs,
      bpmnDurationModeMs: node.durationModeMs,
      bpmnDurationMaxMs: node.durationMaxMs,
      bpmnResourceRole: node.resourceRole,
      bpmnCostPerHour: node.costPerHour,
      bpmnResourceCapacity: node.resourceCapacity,
      bpmnPriority: node.priority,
    }
  })
  const flows = model.flows.map(flow => ({
    id: flow.id,
    type: 'arrow',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    color: '#334155',
    stroke: 2,
    fill: 'transparent',
    bpmnFlow: {
      sourceId: flow.sourceId,
      targetId: flow.targetId,
      flowType: flow.flowType ?? 'sequence',
      condition: flow.condition,
      probability: flow.probability,
      isDefault: flow.isDefault,
    },
  }))
  return [...nodes, ...flows]
}

function legacySimulationConfig(): Record<string, unknown> {
  return {
    bpmn: {
      simulation: {
        seed: '42',
        runs: '500',
        slaTargetSec: '',
        instances: '1',
        arrivalIntervalSec: '0',
        calendarStartHour: '',
        calendarEndHour: '',
        arrivalClasses: [],
        rolePolicies: {},
      },
    },
  }
}

function encodeLegacyRecord(record: LegacyRecord): number[] {
  const doc = new Y.Doc()
  doc.transact(() => {
    if (!record.malformed) {
      doc.getArray('elements').push(record.elements)
      doc.getMap('meta').set('title', record.title)
      for (const [key, value] of Object.entries(record.profileConfig ?? {})) {
        doc.getMap('profileConfig').set(key, value)
      }
    }
  })
  const update = record.malformed ? [1, 2, 3] : Array.from(Y.encodeStateAsUpdate(doc))
  doc.destroy()
  return update
}

async function addLegacyDatabase(page: Page, record: LegacyRecord): Promise<void> {
  const update = encodeLegacyRecord(record)
  await page.evaluate(async ({ roomId, updateBytes }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(roomId, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('updates')) db.createObjectStore('updates', { autoIncrement: true })
        if (!db.objectStoreNames.contains('custom')) db.createObjectStore('custom')
      }
      request.onerror = () => reject(request.error ?? new Error('could not open legacy database'))
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('updates', 'readwrite')
        transaction.objectStore('updates').add(new Uint8Array(updateBytes))
        transaction.onerror = () => reject(transaction.error ?? new Error('could not seed legacy update'))
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
      }
    })
  }, { roomId: record.roomId, updateBytes: update })
}

async function databaseNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (typeof indexedDB.databases !== 'function') return []
    return (await indexedDB.databases())
      .map(database => database.name)
      .filter((name): name is string => typeof name === 'string')
      .sort()
  })
}

async function forceFallbackFileOperations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('miro-onboarding-seen', 'true')
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
  })
}

async function boot(page: Page, url = '/'): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.waitForTimeout(250)
}

async function seedAndOpen(page: Page, records: LegacyRecord[], roomId: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
  })
  await boot(page)
  for (const record of records) await addLegacyDatabase(page, record)
  await page.goto(`/?board=${encodeURIComponent(roomId)}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.waitForTimeout(1200)
}

async function openMore(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: 'Открыть', exact: true })
  if (!await open.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  }
  await expect(open).toBeVisible()
}

async function mark(page: Page, label: string): Promise<void> {
  await openMore(page)
  page.once('dialog', dialog => dialog.accept(label))
  await page.getByRole('button', { name: 'Отметить состояние' }).click()
  await expect(page.getByText('Состояние отмечено', { exact: true })).toBeVisible()
}

async function openTimeline(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Контрольные точки', exact: true }).click()
  await expect(page.locator('aside[aria-label="История доски"]')).toBeVisible()
}

async function closeTimeline(page: Page): Promise<void> {
  const close = page.getByRole('button', { name: 'Закрыть историю доски', exact: true })
  if (await close.isVisible().catch(() => false)) await close.click()
}

async function addSticky(page: Page, text: string, x: number, y: number): Promise<void> {
  await page.keyboard.press('s')
  await page.getByTestId('canvas').click({ position: { x, y } })
  const editor = page.locator('textarea:visible, input:not([type="file"]):visible').last()
  await expect(editor).toBeVisible()
  await editor.fill(text)
  await editor.press('Enter')
  await page.keyboard.press('v')
  await page.waitForTimeout(250)
}

function simulationPanel(page: Page) {
  return page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
}

async function simulate(page: Page): Promise<string> {
  const panel = simulationPanel(page)
  if (!await panel.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Симуляция', exact: true }).first().click()
  }
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Запустить симуляцию', exact: true }).click()
  await expect(panel.locator('div.mt-5.grid')).toBeVisible()
  await page.waitForTimeout(250)
  return panel.locator('div.mt-5.grid').innerText()
}

async function closeSimulation(page: Page): Promise<void> {
  const panel = simulationPanel(page)
  if (await panel.isVisible().catch(() => false)) {
    await panel.getByRole('button', { name: 'Закрыть симуляцию', exact: true }).click()
  }
}

async function saveDownload(page: Page, testInfo: TestInfo, filename: string): Promise<{ path: string; contents: string }> {
  await openMore(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click(),
  ])
  await expect(page.getByRole('status')).toHaveText('Сохранено')
  const path = testInfo.outputPath(filename)
  await download.saveAs(path)
  return { path, contents: readFileSync(path, 'utf8') }
}

async function openDownloaded(page: Page, path: string): Promise<void> {
  await openMore(page)
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Открыть', exact: true }).click(),
  ])
  await chooser.setFiles(path)
  await expect(page.getByText('Открыт документ', { exact: false })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
  await page.waitForTimeout(350)
}

function readMboard(contents: string): SavedMboard {
  return JSON.parse(contents) as SavedMboard
}

async function visibleLabels(page: Page): Promise<string[]> {
  return page.locator('svg g[data-id]').evaluateAll(nodes => nodes
    .map(node => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .sort())
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: 'application/json',
  })
}

test.describe('VAL-CROSS-030..035: adopted legacy boards are first-class documents', () => {
  test('VAL-CROSS-030/031/032/033: adopted BPMN board supports history, simulation, file round-trip, and idempotent reload', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()
    const roomId = `cross-legacy-bpmn-${Date.now()}`
    const records: LegacyRecord[] = [{
      roomId,
      title: 'Legacy BPMN adoption',
      elements: fixtureElements(fixture.model),
      profileConfig: legacySimulationConfig(),
    }]
    const warnings: string[] = []
    const errors: string[] = []
    page.on('console', message => {
      if (message.type() === 'warning') warnings.push(message.text())
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

    await seedAndOpen(page, records, roomId)
    await expect(page.locator('svg g[data-id]')).toHaveCount(fixture.model.nodes.length + fixture.model.flows.length)
    const adoptedKeys = await databaseNames(page)
    expect(adoptedKeys).toContain(roomId)
    expect(adoptedKeys.filter(key => key === `mboard-doc-doc_${roomId}`)).toHaveLength(1)
    await attachJson(testInfo, 'adoption-keys-after-seed.json', adoptedKeys)
    await page.screenshot({ path: testInfo.outputPath('01-adopted-bpmn-board.png') })

    await openTimeline(page)
    await expect(page.locator('aside[aria-label="История доски"]')).toContainText('Пока нет контрольных точек')
    await page.screenshot({ path: testInfo.outputPath('02-empty-history-after-adoption.png') })
    await closeTimeline(page)

    await mark(page, 'До изменения legacy')
    const preMigrationVisibleResult = await simulate(page)
    const baselineSimulation = baseline.payload.simulateBpmn
    expect(preMigrationVisibleResult).toContain(`${(Number(baselineSimulation.meanDurationMs) / 1000).toFixed(1)}с`)
    expect(preMigrationVisibleResult).toContain(`€${Number(baselineSimulation.meanCost).toFixed(2)}`)
    const debugSimulation = await page.evaluate(() => {
      const hook = window.__MIROBOARD_DEBUG__
      return hook ? JSON.parse(JSON.stringify(hook.simulateBpmn(42, 500))) as Record<string, unknown> : null
    })
    if (debugSimulation) expect(debugSimulation).toEqual(baselineSimulation)
    await page.screenshot({ path: testInfo.outputPath('03-adopted-bpmn-simulation.png') })

    await closeSimulation(page)
    await addSticky(page, 'Post-adoption edit', 720, 260)
    expect(await page.locator('svg g[data-id]').count()).toBe(fixture.model.nodes.length + fixture.model.flows.length + 1)
    const firstSaved = await saveDownload(page, testInfo, 'legacy-adopted-first-save.mboard')
    const firstDocument = readMboard(firstSaved.contents)
    expect(firstDocument.nodes.length + firstDocument.edges.length).toBe(fixture.model.nodes.length + fixture.model.flows.length + 1)
    expect(firstDocument.history.snapshots.some(snapshot => snapshot.kind === 'named' && snapshot.label === 'До изменения legacy')).toBe(true)
    expect(firstDocument.history.snapshots.length).toBeGreaterThanOrEqual(2)
    await attachJson(testInfo, 'legacy-adopted-first-save.json', firstDocument)

    await page.close()
    const reloaded = await context.newPage()
    await forceFallbackFileOperations(reloaded)
    await boot(reloaded, `/?board=${encodeURIComponent(roomId)}`)
    await expect(reloaded.locator('svg g[data-id]')).toHaveCount(fixture.model.nodes.length + fixture.model.flows.length + 1)
    await reloaded.reload({ waitUntil: 'domcontentloaded' })
    await expect(reloaded.getByTestId('canvas')).toBeVisible()
    await expect(reloaded.locator('svg g[data-id]')).toHaveCount(fixture.model.nodes.length + fixture.model.flows.length + 1)
    const keysAfterReload = await databaseNames(reloaded)
    expect(keysAfterReload.filter(key => key === `mboard-doc-doc_${roomId}`)).toHaveLength(1)
    expect(keysAfterReload).toContain(roomId)
    await attachJson(testInfo, 'adoption-keys-after-reload.json', keysAfterReload)
    expect(await visibleLabels(reloaded)).toContain('Post-adoption edit')
    await reloaded.close()
    await context.close()

    const fileContext = await browser.newContext({ acceptDownloads: true })
    const reopenedFile = await fileContext.newPage()
    await forceFallbackFileOperations(reopenedFile)
    await boot(reopenedFile)
    await openDownloaded(reopenedFile, firstSaved.path)
    expect(await reopenedFile.locator('svg g[data-id]').count()).toBe(fixture.model.nodes.length + fixture.model.flows.length + 1)
    await openTimeline(reopenedFile)
    await expect(reopenedFile.getByText('«До изменения legacy»', { exact: true })).toBeVisible()
    const namedEntry = reopenedFile.locator('aside[aria-label="История доски"] ol button').filter({ hasText: '«До изменения legacy»' })
    await namedEntry.click()
    await expect(reopenedFile.locator('[role="status"][data-ui]')).toContainText('Просмотр состояния')
    await expect(reopenedFile.locator('svg g[data-id]')).toHaveCount(fixture.model.nodes.length + fixture.model.flows.length)
    await reopenedFile.screenshot({ path: testInfo.outputPath('04-reopened-and-scrubbed-legacy-board.png') })
    await reopenedFile.getByRole('button', { name: 'Восстановить это состояние', exact: true }).click()
    await expect(reopenedFile.getByText('Состояние восстановлено', { exact: true })).toBeVisible()
    await expect(reopenedFile.locator('svg g[data-id]')).toHaveCount(fixture.model.nodes.length + fixture.model.flows.length)
    await reopenedFile.screenshot({ path: testInfo.outputPath('05-restored-legacy-board.png') })
    const finalSaved = await saveDownload(reopenedFile, testInfo, 'legacy-adopted-restored-save.mboard')
    const finalDocument = readMboard(finalSaved.contents)
    expect(finalDocument.history.snapshots.some(snapshot => snapshot.kind === 'named' && snapshot.label === 'До изменения legacy')).toBe(true)
    expect(finalDocument.history.snapshots.some(snapshot => snapshot.kind === 'restore-transition')).toBe(true)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    await fileContext.close()
  })

  test('VAL-CROSS-034: three independent legacy boards adopt, checkpoint, save, and reopen without cross-contamination', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ acceptDownloads: true })
    const seedPage = await context.newPage()
    const suffix = Date.now()
    const records: LegacyRecord[] = ['A', 'B', 'C'].map(letter => ({
      roomId: `cross-legacy-${letter.toLowerCase()}-${suffix}`,
      title: `Legacy board ${letter}`,
      elements: [{
        id: `legacy-${letter.toLowerCase()}`,
        type: 'sticky',
        x: 120,
        y: 160,
        w: 180,
        h: 70,
        text: `Legacy board ${letter}`,
        color: '#FFD93D',
        fill: '#FFD93D',
      }],
    }))
    await seedAndOpen(seedPage, records, records[0].roomId)
    const keys = await databaseNames(seedPage)
    for (const record of records) {
      expect(keys).toContain(record.roomId)
      expect(keys).toContain(`mboard-doc-doc_${record.roomId}`)
    }
    await attachJson(testInfo, 'multiple-adoption-keys.json', keys)
    await seedPage.close()

    const saved: Array<{ record: LegacyRecord; path: string; document: SavedMboard }> = []
    for (const record of records) {
      const boardPage = await context.newPage()
      await forceFallbackFileOperations(boardPage)
      await boot(boardPage, `/?board=${encodeURIComponent(record.roomId)}`)
      await expect(boardPage.locator('svg g[data-id]')).toHaveCount(1)
      await expect(boardPage.locator('svg g[data-id]')).toContainText(record.title)
      await openTimeline(boardPage)
      await expect(boardPage.locator('aside[aria-label="История доски"]')).toContainText('Пока нет контрольных точек')
      await closeTimeline(boardPage)
      await mark(boardPage, `Checkpoint ${record.title}`)
      const savedFile = await saveDownload(boardPage, testInfo, `multiple-${record.roomId}.mboard`)
      const document = readMboard(savedFile.contents)
      expect(document.meta.id).toBe(`doc_${record.roomId}`)
      expect(document.nodes).toHaveLength(1)
      expect(document.nodes[0]?.content?.text).toBe(record.title)
      expect(document.history.snapshots.some(snapshot => snapshot.kind === 'named')).toBe(true)
      saved.push({ record, path: savedFile.path, document })
      await boardPage.close()
    }

    expect(new Set(saved.map(item => item.document.meta.id)).size).toBe(3)
    expect(new Set(saved.map(item => item.document.nodes[0]?.content?.text)).size).toBe(3)
    await attachJson(testInfo, 'multiple-adoption-files.json', saved.map(item => item.document))

    await context.close()
    for (const [index, item] of saved.entries()) {
      const freshContext = await browser.newContext({ acceptDownloads: true })
      const reopened = await freshContext.newPage()
      await forceFallbackFileOperations(reopened)
      await boot(reopened)
      await openDownloaded(reopened, item.path)
      await expect(reopened.locator('svg g[data-id]')).toHaveCount(1)
      await expect(reopened.locator('svg g[data-id]')).toContainText(item.record.title)
      await openTimeline(reopened)
      await expect(reopened.getByText(`«Checkpoint ${item.record.title}»`, { exact: true })).toBeVisible()
      expect(await visibleLabels(reopened)).toEqual([item.record.title])
      await reopened.screenshot({ path: testInfo.outputPath(`multiple-board-${index + 1}-reopened.png`) })
      await freshContext.close()
    }
  })

  test('VAL-CROSS-035: malformed legacy adoption leaves the legacy database and a usable app intact', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ acceptDownloads: true })
    const page = await context.newPage()
    const roomId = `cross-legacy-corrupt-${Date.now()}`
    const warnings: string[] = []
    const errors: string[] = []
    page.on('console', message => {
      if (message.type() === 'warning') warnings.push(message.text())
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

    await seedAndOpen(page, [{ roomId, title: 'Corrupt legacy board', elements: [], malformed: true }], roomId)
    await expect(page.getByTestId('canvas')).toBeVisible()
    const keysAfterFailure = await databaseNames(page)
    expect(keysAfterFailure).toContain(roomId)
    expect(keysAfterFailure.some(key => key === `mboard-doc-doc_${roomId}`)).toBe(false)
    await attachJson(testInfo, 'failed-adoption-keys.json', keysAfterFailure)

    await addSticky(page, 'Usable after failed adoption', 300, 200)
    await mark(page, 'Recovery after failed adoption')
    const saved = await saveDownload(page, testInfo, 'failed-adoption-recovery.mboard')
    const document = readMboard(saved.contents)
    expect(document.nodes).toHaveLength(1)
    expect(document.nodes[0]?.content?.text).toBe('Usable after failed adoption')
    expect(document.history.snapshots.some(snapshot => snapshot.kind === 'named' && snapshot.label === 'Recovery after failed adoption')).toBe(true)
    const cleanContext = await browser.newContext({ acceptDownloads: true })
    const reopened = await cleanContext.newPage()
    await forceFallbackFileOperations(reopened)
    await boot(reopened)
    await openDownloaded(reopened, saved.path)
    await expect(reopened.locator('svg g[data-id]')).toHaveCount(1)
    await expect(reopened.locator('svg g[data-id]')).toContainText('Usable after failed adoption')
    await openTimeline(reopened)
    await expect(reopened.getByText('«Recovery after failed adoption»', { exact: true })).toBeVisible()
    await reopened.screenshot({ path: testInfo.outputPath('failed-adoption-app-remains-usable.png') })
    await attachJson(testInfo, 'failed-adoption-console.json', { warnings, errors })
    expect(warnings.some(message => /Legacy room .*could not be adopted|unreadable|recoverable/i.test(message))).toBe(true)
    await cleanContext.close()
    await context.close()
  })
})
