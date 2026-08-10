import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: '**/baseline-capture.spec.ts',
  webServer: {
    ...baseConfig.webServer,
    reuseExistingServer: false,
  },
})
