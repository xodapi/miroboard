import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const validDocument = readFileSync(resolve('examples/freeform-board.mboard'), 'utf8')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(documentText => {
    localStorage.setItem('miro-onboarding-seen', 'true')
    ;(window as Window & { __openContents: string }).__openContents = documentText
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => [{
        name: 'incoming.mboard',
        getFile: async () => ({
          name: 'incoming.mboard',
          text: async () => (window as Window & { __openContents: string }).__openContents,
        }),
      }],
    })
  }, validDocument)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
})

async function open(page: import('@playwright/test').Page, contents: string) {
  await page.evaluate(value => {
    ;(window as Window & { __openContents: string }).__openContents = value
  }, contents)
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
}

test('refuses a too-new document without changing the open board', async ({ page }) => {
  await open(page, validDocument)
  await expect(page.locator('svg g[data-id]')).toHaveCount(5)

  const tooNew = JSON.stringify({ ...JSON.parse(validDocument), schemaVersion: 2 })
  await open(page, tooNew)

  await expect(page.locator('[data-ui]').filter({ hasText: 'Документ использует более новую схему v2, поддерживается v1' })).toBeVisible()
  await expect(page.locator('svg g[data-id]')).toHaveCount(5)
})

test('migrates an older document before opening it and reports the upgrade', async ({ page }) => {
  const legacy = readFileSync(resolve('examples/legacy/v0-synthetic.mboard'), 'utf8')

  await open(page, legacy)

  await expect(page.locator('[data-ui]').filter({ hasText: 'Схема обновлена с v0 до v1' })).toBeVisible()
  await expect(page.locator('[data-id]')).toHaveCount(1)
  await expect(page.locator('[data-id]')).toContainText('v0 migration vehicle')
})
