import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const artifact = resolve(process.cwd(), 'dist', 'index.html')
const fileUrl = `file://${artifact.replaceAll('\\', '/')}`

type RuntimeEvidence = {
  consoleErrors: string[]
  externalRequests: string[]
}

type VisibleElement = {
  id: string | null
  text: string
  transform: string | null
}

type MboardDocument = {
  nodes: unknown[]
  edges: unknown[]
  profileConfig: {
    bpmn?: {
      simulation?: {
        seed?: string
        runs?: string
      }
    }
  }
  history: {
    snapshots: Array<{
      id: string
      kind: 'auto' | 'named' | 'restore-transition'
      label?: string
      elementCount: number
    }>
  }
}

function observeOfflineRuntime(page: Page): RuntimeEvidence {
  const evidence: RuntimeEvidence = { consoleErrors: [], externalRequests: [] }
  page.on('console', message => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text())
  })
  page.on('pageerror', error => evidence.consoleErrors.push(`pageerror: ${error.message}`))
  page.on('request', request => {
    const url = request.url()
    if (!url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      evidence.externalRequests.push(url)
    }
  })
  return evidence
}

async function bootOfflineFilePage(browser: Browser): Promise<{
  context: BrowserContext
  page: Page
  evidence: RuntimeEvidence
}> {
  const context = await browser.newContext({ acceptDownloads: true })
  await context.route(/^(?!file:|data:|blob:).*/, route => route.abort())
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
  })
  const evidence = observeOfflineRuntime(page)
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible()
  return { context, page, evidence }
}

async function visibleBoard(page: Page): Promise<VisibleElement[]> {
  return page.locator('svg g[data-id]').evaluateAll(nodes => nodes
    .map(node => ({
      id: node.getAttribute('data-id'),
      // The bottleneck badge is derived from the last simulation result, not
      // persisted board content, so it is intentionally excluded.
      text: node.textContent?.replace(/⚠ bottleneck/g, '').replace(/\s+/g, ' ').trim() ?? '',
      transform: node.getAttribute('transform'),
    }))
    .sort((left, right) => (left.id ?? '').localeCompare(right.id ?? '')))
}

async function addSticky(page: Page, label: string, x: number, y: number): Promise<void> {
  await page.keyboard.press('s')
  await page.getByTestId('canvas').click({ position: { x, y } })
  const editor = page.locator('textarea:visible, input:not([type="file"]):visible').last()
  await expect(editor).toBeVisible()
  await editor.fill(label)
  await editor.press('Enter')
  await page.keyboard.press('v')
}

async function openMore(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await expect(page.getByRole('button', { name: 'Открыть', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '⇩ Сохранить', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Отметить состояние' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сжать историю', exact: true })).toBeVisible()
}

async function mark(page: Page, label: string): Promise<void> {
  await openMore(page)
  page.once('dialog', dialog => dialog.accept(label))
  await page.getByRole('button', { name: 'Отметить состояние' }).click()
  await expect(page.getByText('Состояние отмечено', { exact: true })).toBeVisible()
}

async function saveDownloadedMboard(page: Page, testInfo: TestInfo, filename: string): Promise<{
  path: string
  contents: string
}> {
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

async function openDownloadedMboard(page: Page, path: string): Promise<void> {
  await openMore(page)
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Открыть', exact: true }).click(),
  ])
  await chooser.setFiles(path)
  await expect(page.getByText('Открыт документ', { exact: false })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
}

async function openTimeline(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Контрольные точки' }).click()
  await expect(page.locator('aside[aria-label="История доски"]')).toBeVisible()
  await expect(page.locator('input[type="range"]')).toBeVisible()
}

async function selectNamedCheckpoint(page: Page, label: string): Promise<void> {
  await page.locator('aside[aria-label="История доски"] ol button').filter({ hasText: `«${label}»` }).click()
  await expect(page.locator('[role="status"][data-ui]')).toContainText('Просмотр состояния')
}

function documentFrom(contents: string): MboardDocument {
  return JSON.parse(contents) as MboardDocument
}

function assertCleanOfflineRuntime(...evidence: RuntimeEvidence[]): void {
  for (const run of evidence) {
    expect(run.consoleErrors).toEqual([])
    expect(run.externalRequests).toEqual([])
  }
}

async function attachEvidence(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: typeof value === 'string' ? Buffer.from(value) : Buffer.from(JSON.stringify(value, null, 2)),
    contentType: typeof value === 'string' ? 'application/json' : 'application/json',
  })
}

async function loadBasicFixture(page: Page): Promise<number> {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'examples', 'basic-fixed.json'), 'utf8')) as {
    title: string
    model: { nodes: unknown[]; flows: unknown[] }
  }
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
    .getByRole('button', { name: fixture.title }).click()
  await expect(page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })).toBeVisible()
  return fixture.model.nodes.length + fixture.model.flows.length
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
    await panel.getByRole('button', { name: 'Закрыть симуляцию', exact: true }).click()
  }
}

async function configureSimulation(page: Page, seed: string, runs: string): Promise<void> {
  const panel = await openSimulation(page)
  await panel.getByLabel('Seed').fill(seed)
  await panel.getByLabel('Прогоны').fill(runs)
  await page.waitForTimeout(300)
}

async function simulationConfiguration(page: Page): Promise<{ seed: string; runs: string }> {
  const panel = await openSimulation(page)
  return {
    seed: await panel.getByLabel('Seed').inputValue(),
    runs: await panel.getByLabel('Прогоны').inputValue(),
  }
}

async function simulate(page: Page): Promise<string> {
  const panel = await openSimulation(page)
  await panel.getByRole('button', { name: 'Запустить симуляцию', exact: true }).click()
  const result = panel.locator('div.mt-5.grid')
  await expect(result).toBeVisible()
  return result.innerText()
}

async function changeTaskDuration(page: Page, seconds: string): Promise<void> {
  await closeSimulation(page)
  await page.getByText('Подготовить данные', { exact: true }).click({ force: true })
  await page.getByLabel('Длительность, с').fill(seconds)
  await page.waitForTimeout(300)
}

test.describe('VAL-CROSS-025..026: file:// offline demo sentence gate', () => {
  test('VAL-CROSS-025: the plain-board demo sentence survives two complete offline browser restarts', async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    let authorBrowser: Browser | undefined
    let reopenedBrowser: Browser | undefined
    let finalBrowser: Browser | undefined
    try {
      authorBrowser = await browser.browserType().launch()
      const author = await bootOfflineFilePage(authorBrowser)
      await author.page.screenshot({ path: testInfo.outputPath('plain-01-file-launch.png') })

      await addSticky(author.page, 'План', 320, 180)
      await addSticky(author.page, 'Решение', 500, 220)
      const checkpointBoard = await visibleBoard(author.page)
      await author.page.screenshot({ path: testInfo.outputPath('plain-02-checkpoint-board.png') })
      await mark(author.page, 'До продолжения')
      await author.page.screenshot({ path: testInfo.outputPath('plain-03-named-checkpoint.png') })

      await addSticky(author.page, 'Итог', 680, 260)
      const laterBoard = await visibleBoard(author.page)
      await author.page.screenshot({ path: testInfo.outputPath('plain-04-later-board.png') })
      const firstSaved = await saveDownloadedMboard(author.page, testInfo, 'plain-05-first-save.mboard')
      await author.page.screenshot({ path: testInfo.outputPath('plain-05-save-confirmed.png') })
      await attachEvidence(testInfo, 'plain-05-first-save.mboard', firstSaved.contents)
      const firstDocument = documentFrom(firstSaved.contents)
      const firstNamedIds = firstDocument.history.snapshots
        .filter(snapshot => snapshot.kind === 'named')
        .map(snapshot => snapshot.id)
      expect(firstDocument.nodes).toHaveLength(3)
      await author.context.close()
      await authorBrowser.close()
      authorBrowser = undefined

      reopenedBrowser = await browser.browserType().launch()
      const reopened = await bootOfflineFilePage(reopenedBrowser)
      await openDownloadedMboard(reopened.page, firstSaved.path)
      expect(await visibleBoard(reopened.page)).toEqual(laterBoard)
      await reopened.page.screenshot({ path: testInfo.outputPath('plain-07-reopened-identical.png') })

      await openTimeline(reopened.page)
      await expect(reopened.page.getByText('«До продолжения»', { exact: true })).toBeVisible()
      await reopened.page.screenshot({ path: testInfo.outputPath('plain-08-timeline.png') })
      const scrubber = reopened.page.locator('input[type="range"]')
      const scrubberMax = Number(await scrubber.getAttribute('max'))
      expect(scrubberMax).toBeGreaterThan(0)
      await scrubber.fill(String(scrubberMax))
      await expect(reopened.page.locator('[role="status"][data-ui]')).toContainText('Просмотр состояния')
      await selectNamedCheckpoint(reopened.page, 'До продолжения')
      expect(await visibleBoard(reopened.page)).toEqual(checkpointBoard)
      await reopened.page.screenshot({ path: testInfo.outputPath('plain-09-scrubbed-checkpoint.png') })
      await expect(reopened.page.getByRole('button', { name: 'Восстановить это состояние', exact: true })).toBeVisible()
      await expect(reopened.page.getByRole('button', { name: 'Закрыть', exact: true })).toBeVisible()
      await reopened.page.getByRole('button', { name: 'Восстановить это состояние', exact: true }).click()
      await expect(reopened.page.getByText('Состояние восстановлено', { exact: true })).toBeVisible()
      expect(await visibleBoard(reopened.page)).toEqual(checkpointBoard)
      await reopened.page.screenshot({ path: testInfo.outputPath('plain-10-restored.png') })

      const finalSaved = await saveDownloadedMboard(reopened.page, testInfo, 'plain-11-restored-save.mboard')
      await attachEvidence(testInfo, 'plain-11-restored-save.mboard', finalSaved.contents)
      const restoredHistory = documentFrom(finalSaved.contents).history.snapshots
      // Automatic entries may be thinned at save, but named work and the
      // restore-transition entry representing the later state must survive.
      expect(restoredHistory.map(snapshot => snapshot.id)).toEqual(expect.arrayContaining(firstNamedIds))
      expect(restoredHistory.some(snapshot => snapshot.label === 'До продолжения')).toBe(true)
      expect(restoredHistory.some(snapshot => snapshot.kind === 'restore-transition')).toBe(true)
      await reopened.page.screenshot({ path: testInfo.outputPath('plain-11-final-save.png') })
      await reopened.context.close()
      await reopenedBrowser.close()
      reopenedBrowser = undefined

      finalBrowser = await browser.browserType().launch()
      const final = await bootOfflineFilePage(finalBrowser)
      await openDownloadedMboard(final.page, finalSaved.path)
      expect(await visibleBoard(final.page)).toEqual(checkpointBoard)
      await openTimeline(final.page)
      await expect(final.page.getByText('«До продолжения»', { exact: true })).toBeVisible()
      await expect(final.page.locator('aside[aria-label="История доски"] ol button')).toHaveCount(restoredHistory.length)
      await final.page.screenshot({ path: testInfo.outputPath('plain-13-final-history.png') })

      assertCleanOfflineRuntime(author.evidence, reopened.evidence, final.evidence)
      await attachEvidence(testInfo, 'plain-runtime-evidence.json', {
        author: author.evidence,
        reopened: reopened.evidence,
        final: final.evidence,
      })
      await attachEvidence(testInfo, 'plain-russian-ui-strings.json', [
        'Отметить состояние',
        'Восстановить это состояние',
        'Закрыть',
        'Сжать историю',
        'Сохранить',
        'Открыть',
      ])
      await final.context.close()
    } finally {
      await authorBrowser?.close()
      await reopenedBrowser?.close()
      await finalBrowser?.close()
    }
  })

  test('VAL-CROSS-026: the BPMN demo sentence restores and exactly reproduces the fixed-seed simulation offline', async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    let authorBrowser: Browser | undefined
    let reopenedBrowser: Browser | undefined
    let finalBrowser: Browser | undefined
    try {
      authorBrowser = await browser.browserType().launch()
      const author = await bootOfflineFilePage(authorBrowser)
      const expectedElementCount = await loadBasicFixture(author.page)
      await configureSimulation(author.page, '12007', '47')
      const baselineResult = await simulate(author.page)
      const checkpointBoard = await visibleBoard(author.page)
      await author.page.screenshot({ path: testInfo.outputPath('bpmn-01-fixture-simulated.png') })
      await closeSimulation(author.page)
      await mark(author.page, 'BPMN до изменения')
      await changeTaskDuration(author.page, '19')
      await author.page.screenshot({ path: testInfo.outputPath('bpmn-04-later-edit.png') })
      const firstSaved = await saveDownloadedMboard(author.page, testInfo, 'bpmn-05-first-save.mboard')
      await attachEvidence(testInfo, 'bpmn-05-first-save.mboard', firstSaved.contents)
      const firstDocument = documentFrom(firstSaved.contents)
      const firstNamedIds = firstDocument.history.snapshots
        .filter(snapshot => snapshot.kind === 'named')
        .map(snapshot => snapshot.id)
      expect(firstDocument.nodes.length + firstDocument.edges.length).toBe(expectedElementCount)
      expect(firstDocument.profileConfig.bpmn?.simulation).toMatchObject({ seed: '12007', runs: '47' })
      await author.context.close()
      await authorBrowser.close()
      authorBrowser = undefined

      reopenedBrowser = await browser.browserType().launch()
      const reopened = await bootOfflineFilePage(reopenedBrowser)
      await openDownloadedMboard(reopened.page, firstSaved.path)
      await expect(reopened.page.locator('svg g[data-id]')).toHaveCount(expectedElementCount)
      expect(await simulationConfiguration(reopened.page)).toEqual({ seed: '12007', runs: '47' })
      const changedResult = await simulate(reopened.page)
      expect(changedResult).not.toBe(baselineResult)
      await closeSimulation(reopened.page)
      await openTimeline(reopened.page)
      await selectNamedCheckpoint(reopened.page, 'BPMN до изменения')
      expect(await visibleBoard(reopened.page)).toEqual(checkpointBoard)
      await reopened.page.screenshot({ path: testInfo.outputPath('bpmn-09-scrubbed-checkpoint.png') })
      await reopened.page.getByRole('button', { name: 'Восстановить это состояние', exact: true }).click()
      await expect(reopened.page.getByText('Состояние восстановлено', { exact: true })).toBeVisible()
      expect(await simulationConfiguration(reopened.page)).toEqual({ seed: '12007', runs: '47' })
      expect(await simulate(reopened.page)).toBe(baselineResult)
      await reopened.page.screenshot({ path: testInfo.outputPath('bpmn-10-restored-simulation.png') })

      await closeSimulation(reopened.page)
      const finalSaved = await saveDownloadedMboard(reopened.page, testInfo, 'bpmn-11-restored-save.mboard')
      await attachEvidence(testInfo, 'bpmn-11-restored-save.mboard', finalSaved.contents)
      const restoredHistory = documentFrom(finalSaved.contents).history.snapshots
      expect(restoredHistory.map(snapshot => snapshot.id)).toEqual(expect.arrayContaining(firstNamedIds))
      expect(restoredHistory.some(snapshot => snapshot.label === 'BPMN до изменения')).toBe(true)
      expect(restoredHistory.some(snapshot => snapshot.kind === 'restore-transition')).toBe(true)
      await reopened.context.close()
      await reopenedBrowser.close()
      reopenedBrowser = undefined

      // Negative-test hook: mutate only the test-generated `.mboard` file.
      // The normal assertion below must reject a lost persisted seed.
      if (process.env.DEMO_GATE_NEGATIVE === '1') {
        const tampered = documentFrom(finalSaved.contents)
        if (tampered.profileConfig.bpmn?.simulation) tampered.profileConfig.bpmn.simulation.seed = '999'
        writeFileSync(finalSaved.path, JSON.stringify(tampered))
      }

      finalBrowser = await browser.browserType().launch()
      const final = await bootOfflineFilePage(finalBrowser)
      await openDownloadedMboard(final.page, finalSaved.path)
      await expect(final.page.locator('svg g[data-id]')).toHaveCount(expectedElementCount)
      expect(await simulationConfiguration(final.page)).toEqual({ seed: '12007', runs: '47' }) // NEGATIVE_TEST_TARGET
      expect(await simulate(final.page)).toBe(baselineResult)
      await closeSimulation(final.page)
      await openTimeline(final.page)
      await expect(final.page.getByText('«BPMN до изменения»', { exact: true })).toBeVisible()
      await expect(final.page.locator('aside[aria-label="История доски"] ol button')).toHaveCount(restoredHistory.length)
      await final.page.screenshot({ path: testInfo.outputPath('bpmn-13-final-history.png') })

      assertCleanOfflineRuntime(author.evidence, reopened.evidence, final.evidence)
      await attachEvidence(testInfo, 'bpmn-runtime-evidence.json', {
        baselineResult,
        changedResult,
        author: author.evidence,
        reopened: reopened.evidence,
        final: final.evidence,
      })
      await attachEvidence(testInfo, 'bpmn-russian-ui-strings.json', [
        'Отметить состояние',
        'Восстановить это состояние',
        'Закрыть',
        'Сжать историю',
        'Сохранить',
        'Открыть',
      ])
      await final.context.close()
    } finally {
      await authorBrowser?.close()
      await reopenedBrowser?.close()
      await finalBrowser?.close()
    }
  })
})
