import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Run = { tokenPath: string[] }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(window.__MIROBOARD_DEBUG__))).toBe(true)
})

async function loadBasicFixture(page: Page): Promise<void> {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', 'basic-fixed.json'), 'utf8')) as { title: string }
  await page.getByRole('button', { name: 'Примеры' }).click()
  const modal = page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
  await modal.getByRole('button', { name: new RegExp(fixture.title) }).click()
  await expect(page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })).toBeVisible()
  await expect(page.locator('svg g[data-id]')).toHaveCount(7)
}

async function activeTokenIds(page: Page): Promise<string[]> {
  return page.locator('svg g[data-id]').evaluateAll((groups) => groups
    .filter((group) => group.querySelector('circle[stroke="#8B5CF6"] animate'))
    .map((group) => group.getAttribute('data-id'))
    .filter((id): id is string => id !== null))
}

test('VAL-BPMN-025: token pulse is visible and moves between BPMN nodes', async ({ page }, testInfo) => {
  const animationErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') animationErrors.push(message.text())
  })
  page.on('pageerror', (error) => animationErrors.push(error.message))

  await loadBasicFixture(page)
  const run = await page.evaluate(() => window.__MIROBOARD_DEBUG__!.runBpmn() as Run)
  expect(run.tokenPath.length).toBeGreaterThan(1)
  const firstNodeId = run.tokenPath[0]
  const nextNodeId = run.tokenPath[1]
  expect(firstNodeId).toBeTruthy()
  expect(nextNodeId).toBeTruthy()

  await page.getByRole('button', { name: 'BPMN' }).click()
  const runButton = page.getByTitle('Проверить поток')
  await expect(runButton).toBeVisible()
  await runButton.click()

  const firstNode = page.locator(`svg g[data-id="${firstNodeId}"]`)
  const firstPulse = firstNode.locator('circle[stroke="#8B5CF6"]')
  await expect(firstNode.locator('animate')).toHaveCount(2, { timeout: 650 })
  await expect(firstPulse).toBeVisible({ timeout: 650 })
  expect(await firstPulse.getAttribute('stroke')).toBe('#8B5CF6')
  await page.screenshot({ path: testInfo.outputPath('token-first-node.png') })

  await expect.poll(() => activeTokenIds(page), { timeout: 1_100, intervals: [50] }).toEqual([nextNodeId])
  const nextNode = page.locator(`svg g[data-id="${nextNodeId}"]`)
  const nextPulse = nextNode.locator('circle[stroke="#8B5CF6"]')
  await expect(nextPulse).toBeVisible()
  expect(await nextPulse.getAttribute('stroke')).toBe('#8B5CF6')
  await expect(firstPulse).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('token-next-node.png') })

  expect(animationErrors).toEqual([])
})
