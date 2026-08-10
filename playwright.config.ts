import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/baseline-capture.spec.ts', '**/bpmn-validation-regression-suite.spec.ts'],
  timeout: 60_000,
  workers: 1,
  // Playwright cannot reliably tear down its cmd.exe-owned Vite child on Windows.
  // Windows callers start and stop preview explicitly through services.yaml instead.
  webServer: process.platform === 'win32' ? undefined : {
    command: `${JSON.stringify(process.execPath)} node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
    headless: true,
  },
})
