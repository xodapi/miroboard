import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const freeformDocument = readFileSync(resolve('examples', 'freeform-board.mboard'), 'utf8')
const basicExample = JSON.parse(readFileSync(resolve('examples', 'basic-fixed.json'), 'utf8')) as { title: string }

type SaveMode = 'ok' | 'write-fail' | 'picker-cancel' | 'delay-write'

type HarnessState = {
  contents: string
  writes: number
  mode: SaveMode
  pendingWrite: boolean
}

type HarnessSetup = {
  currentName: string
  incomingName?: string
  initialCurrent?: string
  initialIncoming?: string
  corruptRecoveryDbName?: string
}

async function installFileHarness(page: Page, setup: HarnessSetup): Promise<void> {
  await page.addInitScript(async (options: HarnessSetup) => {
    const currentKey = '__cross-failure-current-file'
    const incomingKey = '__cross-failure-incoming-file'
    const writesKey = '__cross-failure-writes'
    const modeKey = '__cross-failure-save-mode'
    const pendingKey = '__cross-failure-pending-write'

    localStorage.setItem('miro-onboarding-seen', 'true')
    if (localStorage.getItem(currentKey) === null) localStorage.setItem(currentKey, options.initialCurrent ?? '')
    if (localStorage.getItem(incomingKey) === null) localStorage.setItem(incomingKey, options.initialIncoming ?? '')
    if (localStorage.getItem(writesKey) === null) localStorage.setItem(writesKey, '0')
    if (localStorage.getItem(modeKey) === null) localStorage.setItem(modeKey, 'ok')
    if (localStorage.getItem(pendingKey) === null) localStorage.setItem(pendingKey, 'false')

    const makeHandle = (name: string) => ({
      kind: 'file',
      name,
      async createWritable() {
        const mode = localStorage.getItem(modeKey)
        if (mode === 'write-fail') throw new Error('simulated target write failure')
        return {
          async write(contents: string) {
            if (localStorage.getItem(modeKey) === 'write-fail') throw new Error('simulated target write failure')
            if (localStorage.getItem(modeKey) === 'delay-write') {
              localStorage.setItem(pendingKey, 'true')
              await new Promise<void>(resolve => {
                ;(window as Window & { __releaseCrossFailureWrite?: () => void }).__releaseCrossFailureWrite = resolve
              })
              localStorage.setItem(pendingKey, 'false')
            }
            localStorage.setItem(currentKey, contents)
            localStorage.setItem(writesKey, String(Number(localStorage.getItem(writesKey) ?? '0') + 1))
          },
          async close() {},
        }
      },
      async getFile() {
        return {
          name,
          text: async () => localStorage.getItem(incomingKey) ?? '',
        }
      },
    })

    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        const mode = localStorage.getItem(modeKey)
        if (mode === 'picker-cancel') throw new DOMException('cancelled', 'AbortError')
        return makeHandle(options.currentName)
      },
    })
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [makeHandle(options.incomingName ?? 'incoming.mboard')],
    })

    ;(window as Window & {
      __crossFailureHarness: {
        getState: () => HarnessState
        setIncoming: (contents: string) => void
        setMode: (mode: SaveMode) => void
        releaseWrite: () => void
      }
    }).__crossFailureHarness = {
      getState: () => ({
        contents: localStorage.getItem(currentKey) ?? '',
        writes: Number(localStorage.getItem(writesKey) ?? '0'),
        mode: (localStorage.getItem(modeKey) ?? 'ok') as SaveMode,
        pendingWrite: localStorage.getItem(pendingKey) === 'true',
      }),
      setIncoming: contents => localStorage.setItem(incomingKey, contents),
      setMode: mode => localStorage.setItem(modeKey, mode),
      releaseWrite: () => {
        ;(window as Window & { __releaseCrossFailureWrite?: () => void }).__releaseCrossFailureWrite?.()
      },
    }

    if (options.corruptRecoveryDbName) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(options.corruptRecoveryDbName!, 1)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains('updates')) database.createObjectStore('updates', { autoIncrement: true })
          if (!database.objectStoreNames.contains('custom')) database.createObjectStore('custom')
        }
        request.onerror = () => reject(request.error ?? new Error('cannot seed corrupt recovery database'))
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('updates', 'readwrite')
          transaction.objectStore('updates').add(new Uint8Array([255, 255, 255]))
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => reject(transaction.error ?? new Error('cannot seed corrupt update'))
        }
      }).catch(error => console.warn('Test recovery-store seed failed', error))
    }
  }, setup)
}

async function boot(page: Page, boardId = `cross-failure-${Date.now()}-${Math.random().toString(16).slice(2)}`): Promise<void> {
  await page.goto(`/?board=${boardId}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.waitForTimeout(250)
}

async function harness(page: Page): Promise<HarnessState> {
  return page.evaluate(() => (window as Window & {
    __crossFailureHarness: { getState: () => HarnessState }
  }).__crossFailureHarness.getState())
}

async function setIncoming(page: Page, contents: string): Promise<void> {
  await page.evaluate(value => (window as Window & {
    __crossFailureHarness: { setIncoming: (next: string) => void }
  }).__crossFailureHarness.setIncoming(value), contents)
}

async function setSaveMode(page: Page, mode: SaveMode): Promise<void> {
  await page.evaluate(value => (window as Window & {
    __crossFailureHarness: { setMode: (next: SaveMode) => void }
  }).__crossFailureHarness.setMode(value), mode)
}

async function releaseWrite(page: Page): Promise<void> {
  await page.evaluate(() => (window as Window & {
    __crossFailureHarness: { releaseWrite: () => void }
  }).__crossFailureHarness.releaseWrite())
}

async function openMore(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: 'Открыть', exact: true })
  if (!await open.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  }
  await expect(open).toBeVisible()
}

async function headerState(page: Page): Promise<{ title: string; status: string }> {
  return page.evaluate(() => {
    const status = document.querySelector('span[role="status"]')
    return {
      title: status?.previousElementSibling?.textContent?.trim() ?? '',
      status: status?.textContent?.trim() ?? '',
    }
  })
}

async function visibleLabels(page: Page): Promise<string[]> {
  return page.locator('svg g[data-id]').evaluateAll(nodes => nodes
    .map(node => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .sort())
}

async function elementIds(page: Page): Promise<string[]> {
  return page.locator('svg g[data-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id') ?? '').sort())
}

async function addSticky(page: Page, label: string, x: number): Promise<void> {
  await page.keyboard.press('s')
  await page.getByTestId('canvas').click({ position: { x, y: 180 } })
  const editor = page.locator('textarea:visible, input:not([type="file"]):visible').last()
  await expect(editor).toBeVisible()
  await editor.fill(label)
  await editor.press('Enter')
  await page.keyboard.press('v')
  await expect.poll(() => visibleLabels(page)).toContain(label)
}

async function loadBasicBpmnFixture(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Примеры', exact: true }).click()
  const modal = page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
  await modal.getByRole('button', { name: basicExample.title }).click()
  await expect(page.getByText(`Загружен модуль: ${basicExample.title}`, { exact: false })).toBeVisible()
}

async function markCheckpoint(page: Page, label: string): Promise<void> {
  await openMore(page)
  page.once('dialog', dialog => dialog.accept(label))
  await page.getByRole('button', { name: /Отметить состояние/ }).click()
  await expect(page.getByText('Состояние отмечено', { exact: true })).toBeVisible()
}

async function save(page: Page): Promise<HarnessState> {
  await openMore(page)
  await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
  await expect(page.locator('span[role="status"]').first()).toHaveText('Сохранено')
  return harness(page)
}

async function saveAs(page: Page): Promise<void> {
  await openMore(page)
  await page.getByRole('button', { name: '⇩ Сохранить как', exact: true }).click()
}

async function openIncoming(page: Page, contents: string, discardDirty = false): Promise<void> {
  await setIncoming(page, contents)
  await openMore(page)
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  if (discardDirty) {
    const guard = page.getByRole('dialog', { name: 'Несохраненные изменения' })
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Не сохранять', exact: true }).click()
  }
}

async function openHistory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Контрольные точки', exact: true }).click()
  await expect(page.locator('aside[aria-label="История доски"]')).toBeVisible()
}

async function closeHistory(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Закрыть историю доски', exact: true }).click()
}

function parseDocument(contents: string): Record<string, unknown> {
  return JSON.parse(contents) as Record<string, unknown>
}

test.describe('VAL-CROSS-036..043: cross-area failure resilience', () => {
  test('VAL-CROSS-036: corrupt open attempts preserve board, history, dirty state, and file target', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFileHarness(page, { currentName: 'intact-session.mboard' })
    await boot(page)
    await addSticky(page, 'Сохранённая карточка', 280)
    await save(page)
    await markCheckpoint(page, 'До отказов')
    await addSticky(page, 'Несохраненное изменение', 480)

    const beforeLabels = await visibleLabels(page)
    const beforeHeader = await headerState(page)
    await openHistory(page)
    await expect(page.locator('aside[aria-label="История доски"]')).toContainText('«До отказов»')
    await closeHistory(page)

    const corruptVariants = [
      '{ "format": "mboard", "schemaVersion": 1,',
      JSON.stringify({ format: 'mboard', schemaVersion: 1, nodes: null, edges: [] }),
      '',
    ]
    for (const [index, corrupt] of corruptVariants.entries()) {
      await openIncoming(page, corrupt, true)
      await expect(page.getByText(/Не удалось разобрать JSON|Файл пуст|Недопустимый документ \.mboard/)).toBeVisible()
      expect(await visibleLabels(page)).toEqual(beforeLabels)
      expect(await headerState(page)).toEqual(beforeHeader)
      await openHistory(page)
      await expect(page.locator('aside[aria-label="История доски"]')).toContainText('«До отказов»')
      await closeHistory(page)
      await page.screenshot({ path: testInfo.outputPath(`corrupt-rejection-${index + 1}.png`) })
    }

    await addSticky(page, 'После отказов', 680)
    await setSaveMode(page, 'ok')
    const recovered = await save(page)
    const saved = parseDocument(recovered.contents) as {
      nodes: Array<{ content?: { text?: string } }>
      history: { snapshots: Array<{ kind: string; label?: string }> }
    }
    expect(saved.nodes.some(node => node.content?.text === 'После отказов')).toBe(true)
    expect(saved.history.snapshots.some(snapshot => snapshot.label === 'До отказов')).toBe(true)
    await testInfo.attach('corrupt-rejection-final.mboard', { body: Buffer.from(recovered.contents), contentType: 'application/json' })
  })

  test('VAL-CROSS-037: unreadable history falls back to complete content and can be rebuilt', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFileHarness(page, { currentName: 'recovered-history.mboard' })
    await boot(page)
    const degraded = parseDocument(freeformDocument) as {
      history: { yjsState: string | null; snapshots: unknown[] }
    }
    degraded.history.yjsState = 'not-valid-base64!'
    degraded.history.snapshots = [{
      id: 'lost-history',
      at: '2026-08-13T00:00:00Z',
      kind: 'named',
      label: 'До повреждения',
      snapshot: 'also-invalid',
      elementCount: 5,
    }]
    await openIncoming(page, JSON.stringify(degraded))
    await expect(page.getByText('История документа повреждена. Текущий контент восстановлен, история потеряна.', { exact: true })).toBeVisible()
    await expect(page.locator('svg g[data-id]')).toHaveCount(5)
    await openHistory(page)
    await expect(page.getByText('Пока нет контрольных точек. Отметьте состояние или сохраните документ.', { exact: true })).toBeVisible()
    await closeHistory(page)

    await markCheckpoint(page, 'После восстановления истории')
    const rebuilt = await save(page)
    const saved = parseDocument(rebuilt.contents) as {
      nodes: unknown[]
      history: { yjsState: string | null; snapshots: Array<{ label?: string }> }
    }
    expect(saved.nodes).toHaveLength(5)
    expect(saved.history.yjsState).toEqual(expect.any(String))
    expect(saved.history.snapshots.some(snapshot => snapshot.label === 'После восстановления истории')).toBe(true)
    await testInfo.attach('history-rebuilt.mboard', { body: Buffer.from(rebuilt.contents), contentType: 'application/json' })

    const reopened = await page.context().newPage()
    try {
      await installFileHarness(reopened, {
        currentName: 'recovered-history.mboard',
        initialIncoming: rebuilt.contents,
      })
      await boot(reopened)
      await openIncoming(reopened, rebuilt.contents)
      await expect(reopened.locator('svg g[data-id]')).toHaveCount(5)
      await openHistory(reopened)
      await expect(reopened.locator('aside[aria-label="История доски"] ol button')).toHaveCount(saved.history.snapshots.length)
      await reopened.screenshot({ path: testInfo.outputPath('history-rebuilt-after-reopen.png') })
    } finally {
      await reopened.close()
    }
  })

  test('VAL-CROSS-038: valid history with an invalid graph is rejected with the offending reference', async ({ page }) => {
    await installFileHarness(page, { currentName: 'invalid-model-current.mboard' })
    await boot(page)
    await addSticky(page, 'Текущий документ', 320)
    const before = await visibleLabels(page)
    const invalid = parseDocument(freeformDocument) as {
      edges: Array<Record<string, unknown>>
    }
    invalid.edges.push({
      id: 'dangling-edge',
      order: 99,
      kind: 'connector',
      source: { nodeId: 'missing-source', anchor: 'auto' },
      target: { nodeId: 'sticky-note', anchor: 'auto' },
      style: { color: '#111827', stroke: 2, arrowHead: 'triangle' },
      profileData: {},
    })
    await openIncoming(page, JSON.stringify(invalid), true)
    await expect(page.getByText(/Недопустимый документ \.mboard: .*missing-source/)).toBeVisible()
    expect(await visibleLabels(page)).toEqual(before)
    await expect(page.getByTestId('canvas')).toBeVisible()
  })

  test('VAL-CROSS-039: cancelled and failed saves leave a retryable dirty document', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFileHarness(page, { currentName: 'retryable-save.mboard' })
    await boot(page)
    await addSticky(page, 'Редактирование A', 260)
    await markCheckpoint(page, 'До сбоя сохранения')
    await addSticky(page, 'Редактирование B', 460)
    const beforeFailure = await save(page)
    await addSticky(page, 'Редактирование C', 660)
    const beforeFailedWrite = await harness(page)

    await setSaveMode(page, 'write-fail')
    await page.keyboard.press('Control+s')
    await expect(page.getByText('Не удалось сохранить документ. Проверьте доступ к файлу.', { exact: true })).toBeVisible()
    await expect(page.locator('span[role="status"]').first()).toHaveText('Не сохранено')
    expect((await harness(page)).contents).toBe(beforeFailure.contents)
    expect(await visibleLabels(page)).toContain('Редактирование C')
    await testInfo.attach('save-write-failure.mboard', { body: Buffer.from((await harness(page)).contents), contentType: 'application/json' })

    await setSaveMode(page, 'picker-cancel')
    await saveAs(page)
    await expect(page.getByText('Сохранение отменено', { exact: true })).toBeVisible()
    await expect(page.locator('span[role="status"]').first()).toHaveText('Не сохранено')
    expect((await harness(page)).contents).toBe(beforeFailure.contents)

    await setSaveMode(page, 'ok')
    const retry = await save(page)
    expect(retry.contents).not.toBe(beforeFailure.contents)
    const saved = parseDocument(retry.contents) as {
      nodes: Array<{ content?: { text?: string } }>
      history: { snapshots: Array<{ label?: string }> }
    }
    expect(saved.nodes.map(node => node.content?.text)).toEqual(expect.arrayContaining([
      'Редактирование A', 'Редактирование B', 'Редактирование C',
    ]))
    expect(saved.history.snapshots.some(snapshot => snapshot.label === 'До сбоя сохранения')).toBe(true)
    expect(retry.writes).toBeGreaterThan(beforeFailedWrite.writes)
    await testInfo.attach('save-successful-retry.mboard', { body: Buffer.from(retry.contents), contentType: 'application/json' })
  })

  test('VAL-CROSS-040: simulation failure leaves the model and timeline usable', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFileHarness(page, { currentName: 'simulation-failure.mboard' })
    await boot(page)
    await loadBasicBpmnFixture(page)
    await markCheckpoint(page, 'До неудачной симуляции')
    const idsBefore = await elementIds(page)
    await openMore(page)
    await page.getByRole('button', { name: 'Симуляция', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Monte Carlo симуляция' })).toBeVisible()
    const runs = page.locator('label').filter({ hasText: 'Прогоны' }).locator('input')
    await runs.fill('0')
    const dirtyBeforeFailure = await headerState(page)
    await page.getByRole('button', { name: 'Запустить симуляцию', exact: true }).click()
    await expect(page.getByText('Количество прогонов должно быть целым числом от 1 до 10000.', { exact: true })).toBeVisible()
    expect(await elementIds(page)).toEqual(idsBefore)
    expect(await headerState(page)).toEqual(dirtyBeforeFailure)
    await page.getByRole('button', { name: 'Закрыть симуляцию', exact: true }).click()
    await openHistory(page)
    await expect(page.locator('aside[aria-label="История доски"] ol button')).toHaveCount(1)
    await expect(page.locator('aside[aria-label="История доски"]')).toContainText('«До неудачной симуляции»')
    await page.screenshot({ path: testInfo.outputPath('simulation-failure-timeline-intact.png') })
    await closeHistory(page)

    await openMore(page)
    await page.getByRole('button', { name: 'Симуляция', exact: true }).first().click()
    await runs.fill('1')
    await page.getByRole('button', { name: 'Запустить симуляцию', exact: true }).click()
    await expect(page.getByText(/Средняя стоимость:/)).toBeVisible()
  })

  test('VAL-CROSS-041: a corrupt recovery store does not block reopening the saved file', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const boardId = `corrupt-cache-${Date.now()}`
    const dbName = `mboard-doc-doc_${boardId}`
    const recoveryWarnings: string[] = []
    page.on('console', message => {
      if (message.type() === 'warning' || message.type() === 'error') recoveryWarnings.push(message.text())
    })
    await installFileHarness(page, {
      currentName: 'on-disk-recovery-target.mboard',
      incomingName: 'on-disk-recovery-target.mboard',
      initialCurrent: freeformDocument,
      initialIncoming: freeformDocument,
      corruptRecoveryDbName: dbName,
    })
    await boot(page, boardId)
    await page.waitForTimeout(500)
    await openIncoming(page, freeformDocument)
    await expect(page.getByText('Открыт документ «on-disk-recovery-target.mboard»', { exact: true })).toBeVisible()
    await expect(page.locator('svg g[data-id]')).toHaveCount(5)
    expect((await harness(page)).contents).toBe(freeformDocument)
    expect(recoveryWarnings.some(message => /Recovery cache|recovery|unreadable|Unexpected|Invalid|corrupt/i.test(message))).toBe(true)
    await testInfo.attach('corrupt-recovery-console.txt', { body: Buffer.from(recoveryWarnings.join('\n') || 'no warning captured'), contentType: 'text/plain' })
    await page.screenshot({ path: testInfo.outputPath('corrupt-recovery-file-reopened.png') })
  })

  test('VAL-CROSS-042: delayed save and checkpoint capture settle to valid, non-duplicated documents', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFileHarness(page, { currentName: 'concurrent-operations.mboard' })
    await boot(page)
    await addSticky(page, 'Concurrent A', 260)
    await markCheckpoint(page, 'До concurrent save')
    await save(page)
    await addSticky(page, 'Concurrent B', 460)

    await setSaveMode(page, 'delay-write')
    await openMore(page)
    await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
    await expect.poll(() => harness(page).then(state => state.pendingWrite)).toBe(true)
    await markCheckpoint(page, 'Во время save')
    await releaseWrite(page)
    await expect(page.locator('span[role="status"]').first()).toHaveText('Сохранено')

    const saved = await harness(page)
    const document = parseDocument(saved.contents) as {
      nodes: Array<{ content?: { text?: string } }>
      history: { snapshots: Array<{ id: string; snapshot: string }> }
    }
    expect(document.nodes.map(node => node.content?.text)).toEqual(expect.arrayContaining(['Concurrent A', 'Concurrent B']))
    const ids = document.history.snapshots.map(snapshot => snapshot.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(document.history.snapshots.every(snapshot => typeof snapshot.snapshot === 'string' && snapshot.snapshot.length > 0)).toBe(true)
    await testInfo.attach('concurrent-save-result.mboard', { body: Buffer.from(saved.contents), contentType: 'application/json' })

    await setSaveMode(page, 'ok')
    await save(page)
    await openHistory(page)
    await expect(page.locator('aside[aria-label="История доски"]')).toContainText('«Во время save»')
    await closeHistory(page)
  })

  test('VAL-CROSS-043: mixed failures do not leave the session unusable', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await installFileHarness(page, { currentName: 'mixed-failure-recovery.mboard' })
    await boot(page)
    await addSticky(page, 'До смешанных сбоев', 240)
    await save(page)
    await markCheckpoint(page, 'Смешанная точка')
    await addSticky(page, 'Несохраненная перед отказом', 420)
    const expectedAfterCorrupt = await visibleLabels(page)

    await openIncoming(page, '{truncated', true)
    await expect(page.getByText('Не удалось разобрать JSON документа .mboard', { exact: true })).toBeVisible()
    expect(await visibleLabels(page)).toEqual(expectedAfterCorrupt)

    await setSaveMode(page, 'write-fail')
    await page.keyboard.press('Control+s')
    await expect(page.getByText('Не удалось сохранить документ. Проверьте доступ к файлу.', { exact: true })).toBeVisible()
    await expect(page.locator('span[role="status"]').first()).toHaveText('Не сохранено')

    await setSaveMode(page, 'ok')
    await loadBasicBpmnFixture(page)
    await markCheckpoint(page, 'Перед сбоем симуляции')
    await openMore(page)
    await page.getByRole('button', { name: 'Симуляция', exact: true }).first().click()
    const runs = page.locator('label').filter({ hasText: 'Прогоны' }).locator('input')
    await runs.fill('0')
    await page.getByRole('button', { name: 'Запустить симуляцию', exact: true }).click()
    await expect(page.getByText('Количество прогонов должно быть целым числом от 1 до 10000.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Закрыть симуляцию', exact: true }).click()

    const degraded = parseDocument(freeformDocument) as { history: { yjsState: string | null; snapshots: unknown[] } }
    degraded.history.yjsState = 'broken-history'
    degraded.history.snapshots = [{ id: 'mixed-lost', at: new Date().toISOString(), kind: 'named', label: 'Старая точка', snapshot: 'broken', elementCount: 5 }]
    await openIncoming(page, JSON.stringify(degraded), true)
    await expect(page.getByText('История документа повреждена. Текущий контент восстановлен, история потеряна.', { exact: true })).toBeVisible()
    await expect(page.locator('svg g[data-id]')).toHaveCount(5)

    await addSticky(page, 'После смешанных сбоев', 620)
    await markCheckpoint(page, 'Финальная точка')
    await loadBasicBpmnFixture(page)
    await openMore(page)
    await page.getByRole('button', { name: 'Симуляция', exact: true }).first().click()
    await runs.fill('1')
    await page.getByRole('button', { name: 'Запустить симуляцию', exact: true }).click()
    await expect(page.getByText(/Средняя стоимость:/)).toBeVisible()
    await page.getByRole('button', { name: 'Закрыть симуляцию', exact: true }).click()
    const finalIds = await elementIds(page)
    const final = await save(page)
    const reopened = await page.context().newPage()
    try {
      await installFileHarness(reopened, {
        currentName: 'mixed-failure-recovery.mboard',
        initialIncoming: final.contents,
      })
      await boot(reopened)
      await openIncoming(reopened, final.contents)
      await expect(reopened.locator('svg g[data-id]')).toHaveCount(finalIds.length)
      await expect(reopened.getByTestId('canvas')).toBeVisible()
    } finally {
      await reopened.close()
    }
    await testInfo.attach('mixed-failure-final-document.mboard', { body: Buffer.from(final.contents), contentType: 'application/json' })
  })
})
