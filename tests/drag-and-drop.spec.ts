import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fixture = readFileSync(resolve('examples/freeform-board.mboard'), 'utf8')

async function dataTransfer(page: import('@playwright/test').Page, entries: { name: string; contents: string; type?: string }[]) {
  return page.evaluateHandle(files => {
    const transfer = new DataTransfer()
    files.forEach(({ name, contents, type }) => transfer.items.add(new File([contents], name, { type })))
    return transfer
  }, entries)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
})

test('canvas opens only the first dropped .mboard and clears its drop cue', async ({ page }) => {
  const canvas = page.locator('[data-testid="canvas"]')
  const transfer = await dataTransfer(page, [
    { name: 'first.mboard', contents: fixture, type: 'application/json' },
    { name: 'ignored.mboard', contents: fixture, type: 'application/json' },
  ])

  await canvas.dispatchEvent('dragenter', { dataTransfer: transfer })
  await expect(page.getByTestId('drop-target-cue')).toBeVisible()
  await canvas.dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByTestId('drop-target-cue')).toBeHidden()
  await expect(page.locator('[data-ui]').filter({ hasText: 'ещё файлов проигнорировано: 1' })).toBeVisible()
  await expect(page.locator('svg g[data-id]')).not.toHaveCount(0)
})

test('unsupported drop is rejected without changing the board', async ({ page }) => {
  const canvas = page.locator('[data-testid="canvas"]')
  const transfer = await dataTransfer(page, [{ name: 'image.png', contents: 'not a board', type: 'image/png' }])

  await canvas.dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.locator('[data-ui]').filter({ hasText: 'Поддерживаются только документы .mboard' })).toBeVisible()
  await expect(page.locator('svg g[data-id]')).toHaveCount(0)
})

test('file drops on app chrome are prevented from navigating', async ({ page }) => {
  const transfer = await dataTransfer(page, [{ name: 'image.png', contents: 'not a board', type: 'image/png' }])
  const url = page.url()

  await page.getByRole('button', { name: 'Примеры' }).dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page).toHaveURL(url)
})
