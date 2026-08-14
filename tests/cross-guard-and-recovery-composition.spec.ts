import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const incomingDocument = readFileSync(resolve('examples', 'freeform-board.mboard'), 'utf8')

type MemoryFile = {
  contents: string
  writes: number
}

type HeaderState = {
  title: string
  status: string
}

async function installFileSystemAccess(
  page: Page,
  options: { currentName: string; incomingName: string; initialCurrent?: string; suppressBeforeUnload?: boolean },
): Promise<void> {
  await page.addInitScript((setup) => {
    const diskKey = '__cross-guard-current-file'
    const writesKey = '__cross-guard-current-file-writes'
    // Init scripts run again on reload. Keep the simulated on-disk file intact
    // so this mirrors a real named file rather than resetting its bytes.
    if (!localStorage.getItem('miro-onboarding-seen')) localStorage.setItem('miro-onboarding-seen', 'true')
    if (localStorage.getItem(diskKey) === null) localStorage.setItem(diskKey, setup.initialCurrent ?? '')
    if (localStorage.getItem(writesKey) === null) localStorage.setItem(writesKey, '0')

    // Test-only fault injection for the negative test: prevent the product's
    // leave listener from observing the event, without changing product code.
    if (setup.suppressBeforeUnload) {
      window.addEventListener('beforeunload', event => event.stopImmediatePropagation(), true)
    }

    const currentHandle = {
      kind: 'file',
      name: setup.currentName,
      async createWritable() {
        return {
          write: async (contents: string) => {
            localStorage.setItem(diskKey, contents)
            localStorage.setItem(writesKey, String(Number(localStorage.getItem(writesKey) ?? '0') + 1))
          },
          close: async () => undefined,
        }
      },
      async getFile() {
        return {
          name: setup.currentName,
          text: async () => localStorage.getItem(diskKey) ?? '',
        }
      },
    }

    const incomingHandle = {
      kind: 'file',
      name: setup.incomingName,
      async getFile() {
        return {
          name: setup.incomingName,
          text: async () => setup.incomingDocument,
        }
      },
    }

    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => currentHandle,
    })
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [incomingHandle],
    })
    ;(window as Window & {
      __crossGuardCurrentFile: () => MemoryFile
    }).__crossGuardCurrentFile = () => ({
      contents: localStorage.getItem(diskKey) ?? '',
      writes: Number(localStorage.getItem(writesKey) ?? '0'),
    })
  }, { ...options, incomingDocument })
}

function currentFile(page: Page): Promise<MemoryFile> {
  return page.evaluate(() => (window as Window & {
    __crossGuardCurrentFile: () => MemoryFile
  }).__crossGuardCurrentFile())
}

async function headerState(page: Page): Promise<HeaderState> {
  return page.evaluate(() => {
    const status = document.querySelector('[role="status"]')
    return {
      title: status?.previousElementSibling?.textContent?.trim() ?? '',
      status: status?.textContent?.trim() ?? '',
    }
  })
}

async function visibleLabels(page: Page): Promise<string[]> {
  return page.locator('svg g[data-id]').evaluateAll(nodes => nodes
    .map(node => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .sort())
}

async function openMore(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: 'Открыть', exact: true })
  if (!await open.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  }
  await expect(open).toBeVisible()
}

async function addSticky(page: Page, label: string, x: number): Promise<void> {
  await page.keyboard.press('s')
  await page.waitForTimeout(100)
  await page.getByTestId('canvas').click({ position: { x, y: 190 } })
  const editor = page.locator('textarea:visible, input:not([type="file"]):visible').last()
  await expect(editor).toBeVisible()
  await editor.fill(label)
  await editor.press('Enter')
  await page.keyboard.press('v')
}

async function save(page: Page): Promise<MemoryFile> {
  await openMore(page)
  await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Сохранено')
  return currentFile(page)
}

async function mark(page: Page, label: string): Promise<void> {
  await openMore(page)
  page.once('dialog', dialog => dialog.accept(label))
  await page.getByRole('button', { name: 'Отметить состояние' }).click()
  await expect(page.getByText('Состояние отмечено', { exact: true })).toBeVisible()
}

async function restoreNamedCheckpoint(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Контрольные точки' }).click()
  await page.locator('aside[aria-label="История доски"] ol button')
    .filter({ hasText: `«${label}»` })
    .click()
  await expect(page.getByRole('button', { name: 'Восстановить это состояние', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить это состояние', exact: true }).click()
  await expect(page.getByText('Состояние восстановлено', { exact: true })).toBeVisible()
}

async function openCurrentDocument(page: Page): Promise<void> {
  await openMore(page)
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
}

async function fileDrop(page: Page): Promise<void> {
  const transfer = await page.evaluateHandle(contents => {
    const data = new DataTransfer()
    data.items.add(new File([contents], 'dropped-incoming.mboard', { type: 'application/json' }))
    return data
  }, incomingDocument)
  await page.getByTestId('canvas').dispatchEvent('drop', { dataTransfer: transfer })
}

function hasNamedCheckpoint(contents: string, label: string): boolean {
  const document = JSON.parse(contents) as {
    history: { snapshots: Array<{ kind: string; label?: string }> }
  }
  return document.history.snapshots.some(snapshot => snapshot.kind === 'named' && snapshot.label === label)
}

function hasRestoreTransition(contents: string): boolean {
  const document = JSON.parse(contents) as {
    history: { snapshots: Array<{ kind: string }> }
  }
  return document.history.snapshots.some(snapshot => snapshot.kind === 'restore-transition')
}

async function boot(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('canvas')).toBeVisible()
  // The global keyboard listener is attached by an effect after first paint.
  await page.waitForTimeout(200)
}

test.describe('VAL-CROSS-027..028: guard, history, file, and recovery composition', () => {
  test('VAL-CROSS-027: restore stays dirty through close, open, and drop guards; cancel preserves it and save is complete', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFileSystemAccess(page, {
      currentName: 'guard-current.mboard',
      incomingName: 'guard-incoming.mboard',
      suppressBeforeUnload: process.env.CROSS_GUARD_NEGATIVE === '1',
    })
    await boot(page, `/?board=guard-${Date.now()}`)

    await addSticky(page, 'Сохранённая карточка', 340)
    const firstSave = await save(page)
    await mark(page, 'Точка перед восстановлением')
    await addSticky(page, 'Позднее несохранённое изменение', 560)
    await restoreNamedCheckpoint(page, 'Точка перед восстановлением')
    const restoredBoard = await visibleLabels(page)

    await expect(page.getByRole('status')).toHaveText('Не сохранено')
    expect(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('restored-dirty-before-guards.png') })

    await openCurrentDocument(page)
    const guard = page.getByRole('dialog', { name: 'Несохраненные изменения' })
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Отмена', exact: true }).click()
    await expect(guard).toBeHidden()
    expect(await visibleLabels(page)).toEqual(restoredBoard)
    await expect(page.getByRole('status')).toHaveText('Не сохранено')

    await fileDrop(page)
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Отмена', exact: true }).click()
    await expect(guard).toBeHidden()
    expect(await visibleLabels(page)).toEqual(restoredBoard)
    await expect(page.getByRole('status')).toHaveText('Не сохранено')
    await page.screenshot({ path: testInfo.outputPath('cancelled-open-and-drop-unchanged.png') })

    await openCurrentDocument(page)
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await expect(page.getByText('Открыт документ «guard-incoming.mboard»', { exact: true })).toBeVisible()

    const savedByGuard = await currentFile(page)
    expect(savedByGuard.writes).toBe(firstSave.writes + 1)
    expect(savedByGuard.contents).not.toBe(firstSave.contents)
    expect(hasNamedCheckpoint(savedByGuard.contents, 'Точка перед восстановлением')).toBe(true)
    expect(hasRestoreTransition(savedByGuard.contents)).toBe(true)
    await testInfo.attach('guard-save-before-open.mboard', {
      body: Buffer.from(savedByGuard.contents),
      contentType: 'application/json',
    })
  })

  test('VAL-CROSS-027: discard after a restored dirty checkpoint neither writes nor partially mutates the saved file', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFileSystemAccess(page, {
      currentName: 'discard-current.mboard',
      incomingName: 'discard-incoming.mboard',
    })
    await boot(page, `/?board=discard-${Date.now()}`)

    await addSticky(page, 'Записано до удаления', 340)
    const onDiskBefore = await save(page)
    await mark(page, 'Точка для удаления')
    await addSticky(page, 'Изменение для удаления', 560)
    await restoreNamedCheckpoint(page, 'Точка для удаления')
    await expect(page.getByRole('status')).toHaveText('Не сохранено')

    await openCurrentDocument(page)
    const guard = page.getByRole('dialog', { name: 'Несохраненные изменения' })
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Не сохранять', exact: true }).click()
    await expect(page.getByText('Открыт документ «discard-incoming.mboard»', { exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Сохранено')

    const onDiskAfter = await currentFile(page)
    expect(onDiskAfter).toEqual(onDiskBefore)
    await testInfo.attach('discard-left-file-unchanged.json', {
      body: Buffer.from(JSON.stringify({ before: onDiskBefore, after: onDiskAfter }, null, 2)),
      contentType: 'application/json',
    })
  })

  test('VAL-CROSS-027: tab close invokes the native guard after restore and cancellation keeps the session dirty', async ({ page }) => {
    test.setTimeout(90_000)
    await installFileSystemAccess(page, {
      currentName: 'close-current.mboard',
      incomingName: 'close-incoming.mboard',
    })
    await boot(page, `/?board=close-${Date.now()}`)

    await addSticky(page, 'Состояние до контрольной точки', 340)
    await save(page)
    await mark(page, 'Точка перед закрытием')
    await addSticky(page, 'Несохраненное состояние после точки', 560)
    await restoreNamedCheckpoint(page, 'Точка перед закрытием')
    await expect(page.getByRole('status')).toHaveText('Не сохранено')

    const dialogSeen = new Promise<void>((resolve, reject) => {
      page.once('dialog', async dialog => {
        try {
          expect(dialog.type()).toBe('beforeunload')
          await dialog.dismiss()
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
    await page.close({ runBeforeUnload: true })
    await dialogSeen
  })

  test('VAL-CROSS-028: recovery keeps local edits visibly ahead of the unchanged named file', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const boardId = `recovery-${Date.now()}`
    await installFileSystemAccess(page, {
      currentName: 'recovery-target.mboard',
      incomingName: 'unused-incoming.mboard',
    })
    await boot(page, `/?board=${boardId}`)

    await addSticky(page, 'Записано на диск', 340)
    const onDiskBeforeRecovery = await save(page)
    await addSticky(page, 'Только в локальном кэше', 560)
    await expect(page.getByRole('status')).toHaveText('Не сохранено')
    expect((await currentFile(page)).contents).toBe(onDiskBeforeRecovery.contents)

    // y-indexeddb batches updates before writing them to the crash-recovery cache.
    await page.waitForTimeout(1_200)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(() => visibleLabels(page)).toEqual([
      'Записано на диск',
      'Только в локальном кэше',
    ])

    const onDiskAfterRecovery = await currentFile(page)
    expect(onDiskAfterRecovery.contents).toBe(onDiskBeforeRecovery.contents)
    await testInfo.attach('recovery-file-before-and-after.json', {
      body: Buffer.from(JSON.stringify({
        before: onDiskBeforeRecovery.contents,
        after: onDiskAfterRecovery.contents,
      }, null, 2)),
      contentType: 'application/json',
    })
    await page.screenshot({ path: testInfo.outputPath('recovered-local-edits.png') })

    // The header must make the divergence explicit: it identifies the file
    // that is behind and keeps the restored in-memory state marked unsaved.
    expect(await headerState(page)).toEqual({
      title: 'recovery-target.mboard',
      status: 'Не сохранено',
    })
  })
})
