import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const incomingDocument = readFileSync(resolve('examples/freeform-board.mboard'), 'utf8')
const bpmnIncomingDocument = readFileSync(resolve('examples/bpmn-process.mboard'), 'utf8')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('miro-onboarding-seen', 'true')
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => ({
        name: 'test.mboard',
        createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
      }),
    })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
})

test('shows textual dirtiness, guards unload, and clears after saving', async ({ page }) => {
  const status = page.getByRole('status')
  await expect(status).toHaveText('Сохранено')

  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  await expect(status).toHaveText('Не сохранено')
  await expect(page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).resolves.toBe(true)

  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: '⇩ Сохранить', exact: true }).click()
  await expect(status).toHaveText('Сохранено')
  await expect(page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).resolves.toBe(false)
})

test('recovery replay stays clean and the next user edit becomes dirty', async ({ page }) => {
  const boardId = `dirty-recovery-${Date.now()}`
  await page.goto(`/?board=${boardId}`, { waitUntil: 'domcontentloaded' })
  const status = page.getByRole('status')

  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  await expect(status).toHaveText('Не сохранено')
  // y-indexeddb batches writes for one second before persisting them.
  await page.waitForTimeout(1_200)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(status).toHaveText('Сохранено')
  await expect(page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).resolves.toBe(false)

  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  await expect(status).toHaveText('Не сохранено')
})

test('opening a BPMN-configured document stays clean until a user edit', async ({ page }) => {
  await page.addInitScript(documentText => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [{
        name: 'bpmn-process.mboard',
        getFile: async () => ({ name: 'bpmn-process.mboard', text: async () => documentText }),
      }],
    })
  }, bpmnIncomingDocument)
  await page.reload({ waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  const status = page.getByRole('status')
  await expect(status).toHaveText('Сохранено')

  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  const modal = page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
  await modal.locator('input').nth(0).fill('43')
  await expect(status).toHaveText('Не сохранено')
})

test('in-app open guard can cancel, discard, or save before replacing the board', async ({ page }) => {
  const writes: string[] = []
  await page.addInitScript(documentText => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [{
        name: 'incoming.mboard',
        getFile: async () => ({ name: 'incoming.mboard', text: async () => documentText }),
      }],
    })
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => ({
        name: 'current.mboard',
        createWritable: async () => ({
          write: async (contents: string) => (window as Window & { __testWrites: string[] }).__testWrites.push(contents),
          close: async () => undefined,
        }),
      }),
    })
    ;(window as Window & { __testWrites: string[] }).__testWrites = []
  }, incomingDocument)
  await page.reload({ waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  const status = page.getByRole('status')
  await expect(status).toHaveText('Не сохранено')

  const open = async () => {
    await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
    await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  }
  await open()
  const guard = page.getByRole('dialog', { name: 'Несохраненные изменения' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: 'Отмена' }).click()
  await expect(guard).toBeHidden()
  await expect(status).toHaveText('Не сохранено')

  await open()
  await guard.getByRole('button', { name: 'Сохранить' }).click()
  await expect(guard).toBeHidden()
  await expect(status).toHaveText('Сохранено')
  writes.push(...await page.evaluate(() => (window as Window & { __testWrites: string[] }).__testWrites))
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0]).nodes.length).toBeGreaterThan(0)
  await expect(page.locator('svg g[data-id]')).toHaveCount(5)

  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Линейный процесс: фиксированная длительность', { exact: true }).click()
  await open()
  await guard.getByRole('button', { name: 'Не сохранять' }).click()
  await expect(guard).toBeHidden()
  await expect(status).toHaveText('Сохранено')
  await expect(page.locator('svg g[data-id]')).toHaveCount(5)
})
