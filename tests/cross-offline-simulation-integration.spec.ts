import { expect, test, type Browser, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const artifact = resolve(process.cwd(), 'dist', 'index.html')
const fileUrl = `file://${artifact.replaceAll('\\', '/')}`

const fixtureNames = [
  'basic-fixed.json',
  'parallel-queue.json',
  'sla-calendar.json',
  'batch-workload.json',
  'priority-queue.json',
  'fifo-vs-priority.json',
] as const

type FixtureName = typeof fixtureNames[number]
type SimulationConfig = {
  seed: string
  runs: string
  slaTargetSec: string
  instances: string
  arrivalIntervalSec: string
  calendarStartHour: string
  calendarEndHour: string
  arrivalClasses: { count: string; intervalSec: string; priority: string }[]
  rolePolicies: Record<string, { capacity: string; queuePolicy: 'fifo' | 'priority' }>
}

type RuntimeEvidence = {
  consoleProblems: string[]
  requests: string[]
}

type StoredFile = {
  contents: string
  writes: number
}

const completeConfig: SimulationConfig = {
  seed: '0042',
  runs: '17',
  slaTargetSec: '12',
  instances: '2',
  arrivalIntervalSec: '0.25',
  calendarStartHour: '8',
  calendarEndHour: '17',
  arrivalClasses: [{ count: '3', intervalSec: '0.5', priority: '7' }],
  rolePolicies: { Аналитик: { capacity: '2', queuePolicy: 'priority' } },
}

function fixture(name: FixtureName): { title: string } {
  return JSON.parse(readFileSync(join(process.cwd(), 'examples', name), 'utf8')) as { title: string }
}

function observe(page: Page): RuntimeEvidence {
  const evidence: RuntimeEvidence = { consoleProblems: [], requests: [] }
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') {
      evidence.consoleProblems.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', error => evidence.consoleProblems.push(`pageerror: ${error.message}`))
  page.on('request', request => evidence.requests.push(request.url()))
  return evidence
}

function externalRequests(evidence: RuntimeEvidence, protocol: 'http' | 'file'): string[] {
  return evidence.requests.filter(url => {
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) return false
    return protocol === 'http' ? !url.startsWith('http://127.0.0.1:4173') : true
  })
}

async function installFileSession(page: Page, initialContents = ''): Promise<void> {
  await page.addInitScript(initial => {
    let contents = initial
    let writes = 0
    const handle = {
      kind: 'file',
      name: 'offline-simulation.mboard',
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
        return { name: 'offline-simulation.mboard', text: async () => contents }
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
    ;(window as Window & { __offlineSimulationFile: () => StoredFile }).__offlineSimulationFile =
      () => ({ contents, writes })
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
  }, initialContents)
}

async function boot(
  page: Page,
  url: string,
  protocol: 'http' | 'file',
  initialContents = '',
): Promise<RuntimeEvidence> {
  await installFileSession(page, initialContents)
  if (protocol === 'file') {
    await page.context().route(/^(?!file:|data:|blob:).*/, route => route.abort())
  }
  const evidence = observe(page)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Примеры' })).toBeVisible()
  return evidence
}

async function newAppPage(browser: Browser, url: string, protocol: 'http' | 'file', initialContents = '') {
  const context = await browser.newContext()
  const page = await context.newPage()
  return { context, page, evidence: await boot(page, url, protocol, initialContents) }
}

async function loadFixture(page: Page, name: FixtureName): Promise<void> {
  const example = fixture(name)
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
    .getByRole('button', { name: example.title }).click()
  await expect(page.getByText(`Загружен модуль: ${example.title}`, { exact: false })).toBeVisible()
}

function simulationPanel(page: Page) {
  return page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
}

async function openSimulation(page: Page) {
  const panel = simulationPanel(page)
  if (!await panel.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Симуляция', exact: true }).first().click()
    await expect(panel).toBeVisible()
  }
  return panel
}

async function closeSimulation(page: Page): Promise<void> {
  const panel = simulationPanel(page)
  if (await panel.isVisible().catch(() => false)) {
    await panel.getByRole('button', { name: 'Закрыть симуляцию' }).click()
  }
}

async function simulationResult(panel: ReturnType<typeof simulationPanel>): Promise<string> {
  const meanCost = panel.getByText('Средняя стоимость:', { exact: true })
  await expect(meanCost).toBeVisible()
  return meanCost.locator('xpath=../..').innerText()
}

async function simulate(page: Page): Promise<string> {
  const panel = await openSimulation(page)
  await panel.getByRole('button', { name: 'Запустить симуляцию' }).click()
  return simulationResult(panel)
}

async function configureSimulation(page: Page, config: SimulationConfig): Promise<void> {
  const panel = await openSimulation(page)
  await panel.getByLabel('Seed').fill(config.seed)
  await panel.getByLabel('Прогоны').fill(config.runs)
  await panel.getByLabel('SLA, сек').fill(config.slaTargetSec)
  await panel.getByLabel('Instances').fill(config.instances)
  await panel.getByLabel('Arrival, сек').fill(config.arrivalIntervalSec)
  await panel.getByLabel('Работа с').fill(config.calendarStartHour)
  await panel.getByLabel('до').fill(config.calendarEndHour)

  const classes = panel.locator('details').filter({ hasText: 'Классы прибытия' })
  await classes.locator('summary').click()
  while (await classes.getByPlaceholder('Кол-во').count() < config.arrivalClasses.length) {
    await classes.getByRole('button', { name: '+ Добавить класс' }).click()
  }
  for (const [index, arrivalClass] of config.arrivalClasses.entries()) {
    await classes.getByPlaceholder('Кол-во').nth(index).fill(arrivalClass.count)
    await classes.getByPlaceholder('Интервал, с').nth(index).fill(arrivalClass.intervalSec)
    await classes.getByPlaceholder('Priority').nth(index).fill(arrivalClass.priority)
  }

  const roles = panel.locator('details').filter({ hasText: 'Политики ресурсов' })
  if (Object.keys(config.rolePolicies).length > 0) {
    await roles.locator('summary').click()
    for (const [role, policy] of Object.entries(config.rolePolicies)) {
      const row = roles.locator('div').filter({ hasText: role }).last()
      await row.locator('input').fill(policy.capacity)
      await row.locator('select').selectOption(policy.queuePolicy)
    }
  }
  // profileConfig writes are React effects, so wait for the persisted Y.Map update.
  await page.waitForTimeout(300)
}

async function displayedConfig(page: Page): Promise<SimulationConfig> {
  const panel = await openSimulation(page)
  const classes = panel.locator('details').filter({ hasText: 'Классы прибытия' })
  await classes.locator('summary').click()
  const roles = panel.locator('details').filter({ hasText: 'Политики ресурсов' })
  await roles.locator('summary').click()
  const rolePolicy: Record<string, { capacity: string; queuePolicy: 'fifo' | 'priority' }> = {}
  for (const role of Object.keys(completeConfig.rolePolicies)) {
    const row = roles.locator('div').filter({ hasText: role }).last()
    rolePolicy[role] = {
      capacity: await row.locator('input').inputValue(),
      queuePolicy: await row.locator('select').inputValue() as 'fifo' | 'priority',
    }
  }
  return {
    seed: await panel.getByLabel('Seed').inputValue(),
    runs: await panel.getByLabel('Прогоны').inputValue(),
    slaTargetSec: await panel.getByLabel('SLA, сек').inputValue(),
    instances: await panel.getByLabel('Instances').inputValue(),
    arrivalIntervalSec: await panel.getByLabel('Arrival, сек').inputValue(),
    calendarStartHour: await panel.getByLabel('Работа с').inputValue(),
    calendarEndHour: await panel.getByLabel('до').inputValue(),
    arrivalClasses: await Promise.all([...Array(await classes.getByPlaceholder('Кол-во').count()).keys()].map(async index => ({
      count: await classes.getByPlaceholder('Кол-во').nth(index).inputValue(),
      intervalSec: await classes.getByPlaceholder('Интервал, с').nth(index).inputValue(),
      priority: await classes.getByPlaceholder('Priority').nth(index).inputValue(),
    }))),
    rolePolicies: rolePolicy,
  }
}

async function save(page: Page): Promise<StoredFile> {
  await closeSimulation(page)
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
  return page.evaluate(() => (window as Window & { __offlineSimulationFile: () => StoredFile }).__offlineSimulationFile())
}

async function openSavedDocument(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.getByText('Открыт документ', { exact: false })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
}

function assertCleanOfflineRun(evidence: RuntimeEvidence, protocol: 'http' | 'file'): void {
  expect(evidence.consoleProblems).toEqual([])
  expect(externalRequests(evidence, protocol)).toEqual([])
}

function largeBpmnDocument(): string {
  const taskCount = 100
  const nodes = [
    {
      id: 'start',
      order: 0,
      kind: 'sticky',
      parentId: null,
      frame: { x: 0, y: 0, w: 78, h: 78, rotation: 0 },
      z: 0,
      style: { color: '#6BCB77', fill: '#6BCB77', stroke: null },
      content: { text: 'Старт' },
      profileData: { bpmn: { nodeType: 'startEvent' } },
    },
    ...Array.from({ length: taskCount }, (_, index) => ({
      id: `task-${index}`,
      order: index + 1,
      kind: 'sticky',
      parentId: null,
      frame: { x: 120 + index * 20, y: 0, w: 100, h: 60, rotation: 0 },
      z: index + 1,
      style: { color: '#4D96FF', fill: '#4D96FF', stroke: null },
      content: { text: `Задача ${index + 1}` },
      profileData: { bpmn: { nodeType: 'task', durationMs: 1000 } },
    })),
    {
      id: 'end',
      order: taskCount + 1,
      kind: 'sticky',
      parentId: null,
      frame: { x: taskCount * 20 + 180, y: 0, w: 78, h: 78, rotation: 0 },
      z: taskCount + 1,
      style: { color: '#FF5D5D', fill: '#FF5D5D', stroke: null },
      content: { text: 'Финиш' },
      profileData: { bpmn: { nodeType: 'endEvent' } },
    },
  ]
  const ids = ['start', ...Array.from({ length: taskCount }, (_, index) => `task-${index}`), 'end']
  const edges = ids.slice(1).map((targetId, index) => ({
    id: `flow-${index}`,
    order: nodes.length + index,
    kind: 'connector',
    source: { nodeId: ids[index], anchor: 'auto' },
    target: { nodeId: targetId, anchor: 'auto' },
    style: { color: '#334155', stroke: 2, arrowHead: 'triangle' },
    profileData: { bpmn: { flowType: 'sequence' } },
  }))
  return JSON.stringify({
    format: 'mboard',
    schemaVersion: 1,
    meta: {
      id: 'doc_large_offline_simulation',
      title: 'Large offline simulation',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      createdWith: { version: 'test', commit: 'test' },
      profiles: ['core', 'bpmn'],
    },
    nodes,
    edges,
    profileConfig: {
      bpmn: {
        simulation: {
          seed: '42',
          runs: '3',
          slaTargetSec: '',
          instances: '1',
          arrivalIntervalSec: '0',
          calendarStartHour: '',
          calendarEndHour: '',
          arrivalClasses: [],
          rolePolicies: {},
        },
      },
    },
    history: {
      yjsState: null,
      snapshots: [],
      retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [1, 6, 24, 168], maxSnapshots: 120, maxHistoryRatio: 3 },
    },
    assets: {},
  })
}

test.describe('VAL-CROSS-019..024: offline simulation integration', () => {
  test('VAL-CROSS-019: a fixture produces identical visible results over served and file protocols', async ({ browser }, testInfo) => {
    const served = await newAppPage(browser, 'http://127.0.0.1:4173/', 'http')
    const offline = await newAppPage(browser, fileUrl, 'file')
    try {
      await loadFixture(served.page, 'priority-queue.json')
      const servedResult = await simulate(served.page)
      await served.page.screenshot({ path: testInfo.outputPath('served-simulation.png') })

      await loadFixture(offline.page, 'priority-queue.json')
      const offlineResult = await simulate(offline.page)
      await offline.page.screenshot({ path: testInfo.outputPath('file-simulation.png') })

      expect(offlineResult).toBe(servedResult)
      assertCleanOfflineRun(served.evidence, 'http')
      assertCleanOfflineRun(offline.evidence, 'file')
    } finally {
      await served.context.close()
      await offline.context.close()
    }
  })

  for (const name of fixtureNames) {
    test(`VAL-CROSS-020: ${name} simulates under file:// without warnings or external requests`, async ({ page }, testInfo) => {
      const evidence = await boot(page, fileUrl, 'file')
      await loadFixture(page, name)
      const result = await simulate(page)

      expect(result).toContain('Средняя стоимость:')
      expect(result).toContain('P95')
      await page.screenshot({ path: testInfo.outputPath(`${name.replace('.json', '')}-offline-result.png`) })
      assertCleanOfflineRun(evidence, 'file')
    })
  }

  test('VAL-CROSS-021: offline saved results are absent after reload while their complete producing configuration remains and reproduces them', async ({ browser }, testInfo) => {
    const author = await newAppPage(browser, fileUrl, 'file')
    let reopened: Awaited<ReturnType<typeof newAppPage>> | undefined
    try {
      await loadFixture(author.page, 'basic-fixed.json')
      await configureSimulation(author.page, completeConfig)
      const resultBeforeSave = await simulate(author.page)
      await author.page.screenshot({ path: testInfo.outputPath('before-save-result.png') })
      const saved = await save(author.page)
      const document = JSON.parse(saved.contents) as { profileConfig: { bpmn: { simulation: SimulationConfig } } }

      expect(saved.writes).toBe(1)
      expect(document.profileConfig.bpmn.simulation).toEqual(completeConfig)
      expect(JSON.stringify(document)).not.toContain('meanDurationMs')

      reopened = await newAppPage(browser, fileUrl, 'file', saved.contents)
      await openSavedDocument(reopened.page)
      expect(await displayedConfig(reopened.page)).toEqual(completeConfig)
      const panel = await openSimulation(reopened.page)
      await expect(panel.getByText('Средняя стоимость:', { exact: true })).toHaveCount(0)

      const resultAfterReload = await simulate(reopened.page)
      expect(resultAfterReload).toBe(resultBeforeSave)
      await reopened.page.screenshot({ path: testInfo.outputPath('after-reload-rerun.png') })
      assertCleanOfflineRun(author.evidence, 'file')
      assertCleanOfflineRun(reopened.evidence, 'file')
    } finally {
      await author.context.close()
      await reopened?.context.close()
    }
  })

  test('VAL-CROSS-022: editing a reloaded BPMN model clears its formerly current simulation result', async ({ browser }, testInfo) => {
    const author = await newAppPage(browser, fileUrl, 'file')
    let reopened: Awaited<ReturnType<typeof newAppPage>> | undefined
    try {
      await loadFixture(author.page, 'basic-fixed.json')
      const originalResult = await simulate(author.page)
      const saved = await save(author.page)

      reopened = await newAppPage(browser, fileUrl, 'file', saved.contents)
      await openSavedDocument(reopened.page)
      expect(await simulate(reopened.page)).toBe(originalResult)
      await closeSimulation(reopened.page)
      await reopened.page.getByText('Подготовить данные', { exact: true }).click({ force: true })
      await reopened.page.getByLabel('Длительность, с').fill('9')
      await reopened.page.waitForTimeout(300)

      const panel = await openSimulation(reopened.page)
      await expect(panel.getByText('Средняя стоимость:', { exact: true })).toHaveCount(0)
      await reopened.page.screenshot({ path: testInfo.outputPath('result-cleared-after-model-edit.png') })
      assertCleanOfflineRun(author.evidence, 'file')
      assertCleanOfflineRun(reopened.evidence, 'file')
    } finally {
      await author.context.close()
      await reopened?.context.close()
    }
  })

  test('VAL-CROSS-023: identical fixed-seed results survive an HTTP save, process restart, file open, and rerun', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    let firstBrowser: Browser | undefined
    let secondBrowser: Browser | undefined
    try {
      firstBrowser = await browser.browserType().launch()
      const first = await newAppPage(firstBrowser, 'http://127.0.0.1:4173/', 'http')
      await loadFixture(first.page, 'basic-fixed.json')
      await configureSimulation(first.page, completeConfig)
      const servedResult = await simulate(first.page)
      const saved = await save(first.page)
      assertCleanOfflineRun(first.evidence, 'http')
      await first.context.close()
      await firstBrowser.close()
      firstBrowser = undefined

      secondBrowser = await browser.browserType().launch()
      const second = await newAppPage(secondBrowser, fileUrl, 'file', saved.contents)
      await openSavedDocument(second.page)
      expect(await displayedConfig(second.page)).toEqual(completeConfig)
      const fileResult = await simulate(second.page)
      expect(fileResult).toBe(servedResult) // NEGATIVE_TEST_TARGET
      await second.page.screenshot({ path: testInfo.outputPath('process-restart-file-rerun.png') })
      assertCleanOfflineRun(second.evidence, 'file')
      await second.context.close()
    } finally {
      await firstBrowser?.close()
      await secondBrowser?.close()
    }
  })

  test('VAL-CROSS-024: a generated 100-task, 203-element BPMN document completes offline and records its wall-clock duration', async ({ browser }, testInfo) => {
    test.setTimeout(60_000)
    const largeDocument = largeBpmnDocument()
    const app = await newAppPage(browser, fileUrl, 'file', largeDocument)
    try {
      await openSavedDocument(app.page)
      await expect(app.page.locator('svg g[data-id]')).toHaveCount(203)
      const startedAt = performance.now()
      const result = await simulate(app.page)
      const elapsedMs = performance.now() - startedAt

      expect(result).toContain('Средняя стоимость:')
      await app.page.screenshot({ path: testInfo.outputPath('large-offline-simulation.png') })
      await testInfo.attach('large-offline-runtime.json', {
        body: JSON.stringify({ nodes: 102, edges: 101, elements: 203, elapsedMs }),
        contentType: 'application/json',
      })
      assertCleanOfflineRun(app.evidence, 'file')
    } finally {
      await app.context.close()
    }
  })
})
