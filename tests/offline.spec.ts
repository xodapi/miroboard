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

function transformFor(element: import('@playwright/test').Locator) {
  return element.getAttribute('transform')
}

async function createBpmnNode(
  page: import('@playwright/test').Page,
  tool: string,
  point: { x: number; y: number },
) {
  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.keyboard.press(tool === 'Старт' ? 's' : 'e')
  await page.locator('div.absolute.inset-0.touch-none > svg').click({ position: point })
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

test('offline board editing covers every node type with move delete undo and redo', async ({ page }) => {
  await page.context().route(/^(?!file:|data:|blob:).*/, route => route.abort())
  const { errors, requests } = await bootFile(page)
  const canvas = page.locator('div.absolute.inset-0.touch-none > svg')

  for (const [tool, point] of [
    ['s', { x: 180, y: 160 }],
    ['t', { x: 360, y: 160 }],
    ['r', { x: 500, y: 160 }],
    ['o', { x: 650, y: 160 }],
  ] as const) {
    await page.keyboard.press(tool)
    await canvas.click({ position: point })
    const editor = page.locator('textarea:visible, input:not([type="file"]):visible').last()
    if (await editor.isVisible().catch(() => false)) {
      if (tool === 't') await editor.fill('Офлайн текст')
      await editor.press('Enter')
    }
  }
  await expect(page.locator('[data-id]')).toHaveCount(4)
  await page.keyboard.press('v')
  await page.waitForTimeout(600)

  const nodes = page.locator('[data-id]')
  for (let index = 0; index < 4; index += 1) {
    const node = nodes.nth(index)
    if (index === 0) {
      await node.dblclick({ force: true })
      const editor = page.locator('textarea:visible, input:not([type="file"]):visible').last()
      await editor.fill(`Офлайн узел ${index}`)
      await editor.press('Enter')
      await expect(node).toContainText(`Офлайн узел ${index}`)
    }
    const beforeMove = await transformFor(node)
    const box = await node.boundingBox()
    expect(box).not.toBeNull()
    await node.click({ force: true, position: { x: 12, y: 12 } })
    if (index === 0) {
      await page.keyboard.press('Delete')
      await expect(nodes).toHaveCount(3)
      await page.keyboard.press('Control+z')
      await expect(nodes).toHaveCount(4)
      await page.keyboard.press('Control+Shift+z')
      await expect(nodes).toHaveCount(3)
      await page.keyboard.press('Control+z')
      await expect(nodes).toHaveCount(4)
    }
    await node.dispatchEvent('pointerdown', { clientX: box!.x + 20, clientY: box!.y + 20, pointerId: index + 1, button: 0 })
    await canvas.dispatchEvent('pointermove', { clientX: box!.x + 120, clientY: box!.y + 100, pointerId: index + 1 })
    await canvas.dispatchEvent('pointerup', { clientX: box!.x + 120, clientY: box!.y + 100, pointerId: index + 1 })
    expect(await transformFor(node)).not.toBe(beforeMove)
    await page.waitForTimeout(600)
    await page.keyboard.press('v')
    await node.click({ force: true, position: { x: 12, y: 12 } })
  }

  expect(errors).toEqual([])
  expect(requests.filter(url => !url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([])
})

test('offline BPMN flow reroutes with its endpoint, survives undo redo, and simulates locally', async ({ page }) => {
  await page.context().route(/^(?!file:|data:|blob:).*/, route => route.abort())
  const { errors, requests } = await bootFile(page)
  const canvas = page.locator('div.absolute.inset-0.touch-none > svg')
  await createBpmnNode(page, 'Старт', { x: 420, y: 250 })
  await createBpmnNode(page, 'Конец', { x: 760, y: 250 })

  await page.getByRole('button', { name: 'BPMN' }).click()
  await page.keyboard.press('f')
  const start = page.locator('[data-id]').filter({ hasText: 'Старт' })
  const end = page.locator('[data-id]').filter({ hasText: 'Конец' })
  await start.click({ force: true })
  await end.click({ force: true })

  const flow = page.locator('[data-testid^="bpmn-flow-"]')
  await expect(flow).toHaveCount(1)
  const target = page.locator('[data-id]').filter({ hasText: 'Конец' })
  const flowBeforeReroute = await transformFor(flow)
  const targetBox = await target.boundingBox()
  expect(targetBox).not.toBeNull()
  await target.dispatchEvent('pointerdown', { clientX: targetBox!.x + 60, clientY: targetBox!.y + 35, pointerId: 1, button: 0 })
  await canvas.dispatchEvent('pointermove', { clientX: targetBox!.x + 200, clientY: targetBox!.y + 135, pointerId: 1 })
  await canvas.dispatchEvent('pointerup', { clientX: targetBox!.x + 200, clientY: targetBox!.y + 135, pointerId: 1 })
  expect(await transformFor(flow)).not.toBe(flowBeforeReroute)

  await page.waitForTimeout(600)
  await flow.click({ force: true })
  await page.keyboard.press('Delete')
  await expect(flow).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(flow).toHaveCount(1)
  await page.keyboard.press('Control+Shift+z')
  await expect(flow).toHaveCount(0)
  await page.keyboard.press('Control+z')

  await page.getByTitle('Открыть Monte Carlo симуляцию').click()
  await page.getByRole('button', { name: 'Запустить симуляцию' }).click()
  await expect(page.getByText('Средняя стоимость:')).toBeVisible()
  await expect(page.locator('[data-ui]').filter({ hasText: /Не удалось|error/i })).toHaveCount(0)
  expect(errors).toEqual([])
  expect(requests.filter(url => !url.startsWith('file://') && !url.startsWith('data:') && !url.startsWith('blob:'))).toEqual([])
})

test('drag and resize render transient frames without snapping back and keep the minimap current', async ({ page }) => {
  const { errors } = await bootFile(page)
  const canvas = page.locator('div.absolute.inset-0.touch-none > svg')
  await page.keyboard.press('s')
  await canvas.click({ position: { x: 200, y: 200 } })
  await page.locator('textarea').press('Enter')
  await page.keyboard.press('s')
  await canvas.click({ position: { x: 500, y: 200 } })
  await page.locator('textarea').press('Enter')

  const sticky = page.locator('[data-id]').filter({ hasText: 'Заметка' }).first()
  await sticky.click({ force: true })
  const beforeDrag = await transformFor(sticky)
  const miniMap = page.locator('[data-ui] svg.cursor-pointer')
  const beforeMap = await miniMap.locator('rect').nth(1).getAttribute('x')
  const stickyBox = await sticky.boundingBox()
  expect(stickyBox).not.toBeNull()
  await sticky.dispatchEvent('pointerdown', { clientX: stickyBox!.x + 50, clientY: stickyBox!.y + 40, pointerId: 1, button: 0 })
  await canvas.dispatchEvent('pointermove', { clientX: stickyBox!.x + 180, clientY: stickyBox!.y + 140, pointerId: 1 })
  const previewTransform = await transformFor(sticky)
  const previewMap = await miniMap.locator('rect').nth(1).getAttribute('x')
  expect(previewTransform).not.toBe(beforeDrag)
  expect(previewMap).not.toBe(beforeMap)
  await canvas.dispatchEvent('pointerup', { clientX: stickyBox!.x + 180, clientY: stickyBox!.y + 140, pointerId: 1 })
  expect(await transformFor(sticky)).toBe(previewTransform)
  expect(await miniMap.locator('rect').nth(1).getAttribute('x')).toBe(previewMap)

  const resize = sticky.locator('[data-resize="se"]')
  const resizeBox = await resize.boundingBox()
  expect(resizeBox).not.toBeNull()
  const beforeResizeBox = await sticky.boundingBox()
  const beforeResizeMap = await miniMap.locator('rect').nth(1).getAttribute('width')
  expect(beforeResizeBox).not.toBeNull()
  await resize.dispatchEvent('pointerdown', { clientX: resizeBox!.x + resizeBox!.width / 2, clientY: resizeBox!.y + resizeBox!.height / 2, pointerId: 1, button: 0 })
  await canvas.dispatchEvent('pointermove', { clientX: resizeBox!.x + 140, clientY: resizeBox!.y + 120, pointerId: 1 })
  const previewBox = await sticky.boundingBox()
  const previewResizeMap = await miniMap.locator('rect').nth(1).getAttribute('width')
  expect(previewBox).not.toEqual(beforeResizeBox)
  expect(previewResizeMap).not.toBe(beforeResizeMap)
  await canvas.dispatchEvent('pointerup', { clientX: resizeBox!.x + 140, clientY: resizeBox!.y + 120, pointerId: 1 })
  const committedBox = await sticky.boundingBox()
  expect(committedBox).toEqual(previewBox)
  expect(await miniMap.locator('rect').nth(1).getAttribute('width')).toBe(previewResizeMap)
  expect(errors).toEqual([])
})
