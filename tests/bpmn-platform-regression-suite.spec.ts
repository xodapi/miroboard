import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'

const artifact = resolve(process.cwd(), 'dist', 'index.html')
const fileUrl = `file://${artifact.replaceAll('\\', '/')}`

async function suppressOnboarding(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('miro-onboarding-seen', 'true'))
}

async function loadPriorityModuleAndOpenSimulation(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByText('Приоритеты в очереди', { exact: true }).click()

  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.getByTitle('Проверить поток').click()
  await expect(page.getByText('Оценка:', { exact: false })).toBeVisible()

  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
}

async function configureAndSimulate(page: import('@playwright/test').Page) {
  await page.getByLabel('Seed').fill('42')
  await page.getByLabel('Прогоны').fill('500')
  await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
  const meanCost = page.getByText('Средняя стоимость:').locator('..')
  await expect(meanCost).toBeVisible()
  return meanCost.innerText()
}

test('simulation controls and results remain reachable on a mobile viewport', async ({ page }) => {
  await suppressOnboarding(page)
  await page.goto('/')
  await loadPriorityModuleAndOpenSimulation(page)
  await page.setViewportSize({ width: 390, height: 844 })

  const result = await configureAndSimulate(page)
  expect(result).toMatch(/^Средняя стоимость:\s*€\d+\.\d{2}$/)

  for (const control of [
    page.getByLabel('Seed'),
    page.getByLabel('Прогоны'),
    page.getByRole('button', { name: 'Запустить симуляцию' }),
    page.getByText('Средняя стоимость:'),
  ]) {
    await expect(control).toBeInViewport()
  }
})

test('file-protocol simulation matches served output with network blocked', async ({ page }) => {
  await suppressOnboarding(page)
  await page.goto('/')
  await loadPriorityModuleAndOpenSimulation(page)
  const servedMeanCost = await configureAndSimulate(page)

  const offlinePage = await page.context().newPage()
  const failedRequests: string[] = []
  const externalRequests: string[] = []
  offlinePage.on('requestfailed', request => failedRequests.push(request.url()))
  offlinePage.on('request', request => {
    const url = request.url()
    if (!url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:')) externalRequests.push(url)
  })
  await offlinePage.context().route(/^(?!file:|data:|blob:).*/, route => route.abort())
  await suppressOnboarding(offlinePage)
  await offlinePage.goto(fileUrl)

  await loadPriorityModuleAndOpenSimulation(offlinePage)
  const offlineMeanCost = await configureAndSimulate(offlinePage)
  expect(offlineMeanCost).toBe(servedMeanCost)
  expect(externalRequests).toEqual([])
  expect(failedRequests).toEqual([])
  await offlinePage.close()
})
