import { expect, test } from '@playwright/test'

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
