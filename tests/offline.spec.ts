import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const artifact = resolve(process.cwd(), 'dist', 'index.html')
const fileUrl = `file://${artifact.replaceAll('\\', '/')}`

async function bootFile(page: import('@playwright/test').Page) {
  const errors: string[] = []
  const requests: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(request.url()))
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible({ timeout: 3_000 })
  return { errors, requests }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
})

test('built artifact is a self-contained file protocol deployment', async ({ page }) => {
  expect(existsSync(artifact)).toBe(true)
  const html = readFileSync(artifact, 'utf8')
  expect(html).toContain('<script')
  expect([...html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)=["']([^"']+)["']/gi)]).toEqual([])

  const { errors, requests } = await bootFile(page)
  expect(errors).toEqual([])
  expect(requests.filter(url => !url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([])
  await expect(page.locator('svg').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Примеры' })).toBeVisible()
})

test('file and local HTTP expose the same interactive UI', async ({ page, browser }) => {
  const file = await bootFile(page)
  const fileUi = await page.locator('button').evaluateAll(buttons => buttons.map(button => button.textContent?.trim()).filter(Boolean))
  expect(file.errors).toEqual([])

  const httpPage = await browser.newPage()
  const httpErrors: string[] = []
  httpPage.on('console', message => { if (message.type() === 'error') httpErrors.push(message.text()) })
  httpPage.on('pageerror', error => httpErrors.push(error.message))
  await httpPage.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(httpPage.getByRole('button', { name: 'Доска' })).toBeVisible({ timeout: 3_000 })
  const skipTour = httpPage.getByRole('button', { name: 'Пропустить' })
  if (await skipTour.isVisible().catch(() => false)) await skipTour.click()
  const httpUi = await httpPage.locator('button').evaluateAll(buttons => buttons.map(button => button.textContent?.trim()).filter(Boolean))
  expect(httpUi).toEqual(fileUi)
  expect(httpErrors).toEqual([])
  await httpPage.close()
})

test('cold file load has no protocol or uncaught-runtime failures', async ({ page }) => {
  const { errors } = await bootFile(page)
  expect(errors.filter(error => /cors|csp|cross origin|module|uncaught|promise/i.test(error))).toEqual([])
  expect(errors).toEqual([])
})
