import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type SimulationResult = Record<string, unknown>
type Model = {
  nodes: Array<{ id: string }>
  flows: Array<{ sourceId: string; targetId: string }>
}

type SimulationConfig = {
  seed: string
  runs: string
  arrivalClass: { count: string; intervalSec: string; priority: string }
}

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('miro-onboarding-seen', 'true')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Доска' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(window.__MIROBOARD_DEBUG__))).toBe(true)
}

async function loadBasicExample(page: Page): Promise<void> {
  const fixture = JSON.parse(readFileSync(join(process.cwd(), 'examples', 'basic-fixed.json'), 'utf8')) as { title: string }
  await page.getByRole('button', { name: 'Примеры' }).click()
  await page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
    .getByRole('button', { name: fixture.title }).click()
  await expect(page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })).toBeVisible()
}

function simulationPanel(page: Page) {
  return page.getByRole('heading', { name: 'Monte Carlo симуляция' }).locator('xpath=ancestor::section')
}

async function openSimulation(page: Page): Promise<ReturnType<typeof simulationPanel>> {
  const panel = simulationPanel(page)
  if (!await panel.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Симуляция' }).first().click()
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

async function configureSimulation(page: Page, config: SimulationConfig): Promise<void> {
  const panel = await openSimulation(page)
  await panel.getByLabel('Seed').fill(config.seed)
  await panel.getByLabel('Прогоны').fill(config.runs)
  const classes = panel.locator('details').filter({ hasText: 'Классы прибытия' })
  await classes.locator('summary').click()
  if (await classes.getByPlaceholder('Кол-во').count() === 0) {
    await classes.getByRole('button', { name: 'Добавить класс' }).click()
  }
  await classes.getByPlaceholder('Кол-во').fill(config.arrivalClass.count)
  await classes.getByPlaceholder('Интервал, с').fill(config.arrivalClass.intervalSec)
  await classes.getByPlaceholder('Priority').fill(config.arrivalClass.priority)
  await page.waitForTimeout(300)
}

async function displayedConfig(page: Page): Promise<SimulationConfig> {
  const panel = await openSimulation(page)
  const classes = panel.locator('details').filter({ hasText: 'Классы прибытия' })
  await classes.locator('summary').click()
  return {
    seed: await panel.getByLabel('Seed').inputValue(),
    runs: await panel.getByLabel('Прогоны').inputValue(),
    arrivalClass: {
      count: await classes.getByPlaceholder('Кол-во').inputValue(),
      intervalSec: await classes.getByPlaceholder('Интервал, с').inputValue(),
      priority: await classes.getByPlaceholder('Priority').inputValue(),
    },
  }
}

async function simulate(page: Page): Promise<SimulationResult> {
  const panel = await openSimulation(page)
  await panel.getByRole('button', { name: 'Запустить симуляцию' }).click()
  await expect(panel.getByText('Средняя стоимость:', { exact: false })).toBeVisible()
  await page.waitForTimeout(200)
  const seed = await panel.getByLabel('Seed').inputValue()
  const runs = Number(await panel.getByLabel('Прогоны').inputValue())
  return page.evaluate(({ seedValue, runCount }) => (
    JSON.parse(JSON.stringify(window.__MIROBOARD_DEBUG__!.simulateBpmn(seedValue, runCount)))
  ), { seedValue: seed, runCount: runs }) as Promise<SimulationResult>
}

async function setTaskDuration(page: Page, seconds: string): Promise<void> {
  await closeSimulation(page)
  await page.getByText('Подготовить данные', { exact: true }).click({ force: true })
  await page.getByLabel('Длительность, с').fill(seconds)
  await page.waitForTimeout(300)
}

async function mark(page: Page, label: string): Promise<void> {
  await closeSimulation(page)
  await page.getByRole('button', { name: 'Дополнительные инструменты' }).click()
  page.once('dialog', dialog => dialog.accept(label))
  await page.getByRole('button', { name: 'Отметить состояние' }).click()
  await expect(page.getByText('Состояние отмечено', { exact: true })).toBeVisible()
}

async function preview(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Контрольные точки' }).click()
  await page.locator('aside[aria-label="История доски"] ol button').filter({ hasText: `«${label}»` }).click()
  await expect(page.locator('[role="status"][data-ui]')).toContainText('Просмотр состояния')
}

async function restore(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Восстановить это состояние' }).click()
  await expect(page.getByText('Состояние восстановлено', { exact: true })).toBeVisible()
  await page.waitForTimeout(300)
}

async function model(page: Page): Promise<Model> {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__MIROBOARD_DEBUG__!.createBpmnModel()))) as Promise<Model>
}

test.describe('VAL-CROSS-013..018: history and simulation composition', () => {
  test('a restored model reproduces its full simulation result and remains structurally valid', async ({ page }) => {
    await boot(page)
    await loadBasicExample(page)
    const originalConfig = { seed: '7001', runs: '73', arrivalClass: { count: '4', intervalSec: '0.5', priority: '8' } }
    await configureSimulation(page, originalConfig)
    const original = await simulate(page)
    await mark(page, 'Исходная модель')

    await setTaskDuration(page, '23')
    const changed = await simulate(page)
    expect(changed).not.toEqual(original)

    await closeSimulation(page)
    await preview(page, 'Исходная модель')
    await restore(page)
    await configureSimulation(page, originalConfig)
    expect(await simulate(page)).toEqual(original)

    const restored = await model(page)
    expect(new Set(restored.nodes.map(node => node.id)).size).toBe(restored.nodes.length)
    expect(restored.flows.every(flow => restored.nodes.some(node => node.id === flow.sourceId)
      && restored.nodes.some(node => node.id === flow.targetId))).toBe(true)
    expect(await page.evaluate(() => window.__MIROBOARD_DEBUG__!.validateBpmn())).toMatchObject({ valid: true })
  })

  test('documents the content-only checkpoint scope for simulation configuration', async ({ page }) => {
    await boot(page)
    await loadBasicExample(page)
    const checkpointConfig = { seed: '7001', runs: '73', arrivalClass: { count: '4', intervalSec: '0.5', priority: '8' } }
    const newerConfig = { seed: '9009', runs: '19', arrivalClass: { count: '9', intervalSec: '3', priority: '2' } }
    await configureSimulation(page, checkpointConfig)
    await mark(page, 'Конфигурация на контрольной точке')
    await configureSimulation(page, newerConfig)
    await closeSimulation(page)
    await preview(page, 'Конфигурация на контрольной точке')
    await restore(page)

    // Architecture §4.5.6 defines restore as content-only, so configuration
    // remains at the live document's newest value rather than rewinding.
    expect(await displayedConfig(page)).toEqual(newerConfig)
  })

  test('historical preview suppresses stale results and prevents simulation from running', async ({ page }, testInfo) => {
    await boot(page)
    await loadBasicExample(page)
    await simulate(page)
    await mark(page, 'До изменения')
    await setTaskDuration(page, '31')
    await closeSimulation(page)
    await preview(page, 'До изменения')

    const panel = await openSimulation(page)
    await expect(panel.getByText('Средняя стоимость:', { exact: false })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('preview-simulation-control.png'), fullPage: true })
    await expect(panel.getByRole('button', { name: 'Запустить симуляцию' })).toBeDisabled()
  })

  test('four edit-and-simulate checkpoints remain independently reproducible', async ({ page }) => {
    test.setTimeout(120_000)
    await boot(page)
    await loadBasicExample(page)
    const scenarios = [
      { label: 'Версия 1', duration: '3', config: { seed: '101', runs: '41', arrivalClass: { count: '2', intervalSec: '0', priority: '1' } } },
      { label: 'Версия 2', duration: '7', config: { seed: '202', runs: '43', arrivalClass: { count: '3', intervalSec: '0.5', priority: '2' } } },
      { label: 'Версия 3', duration: '13', config: { seed: '303', runs: '47', arrivalClass: { count: '4', intervalSec: '1', priority: '3' } } },
      { label: 'Версия 4', duration: '19', config: { seed: '404', runs: '53', arrivalClass: { count: '5', intervalSec: '1.5', priority: '4' } } },
    ]
    const recorded = new Map<string, SimulationResult>()

    for (const scenario of scenarios) {
      await setTaskDuration(page, scenario.duration)
      await configureSimulation(page, scenario.config)
      recorded.set(scenario.label, await simulate(page))
      await closeSimulation(page)
      await mark(page, scenario.label)
    }

    for (const scenario of scenarios) {
      await preview(page, scenario.label)
      await restore(page)
      await configureSimulation(page, scenario.config)
      expect(await simulate(page)).toEqual(recorded.get(scenario.label))
      await closeSimulation(page)
    }
  })
})
