import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: ['**/bpmn-validation-regression-suite.spec.ts', '**/bpmn-token-execution-regression-suite.spec.ts', '**/bpmn-simulation-parameter-regression-suite.spec.ts', '**/bpmn-resource-metrics-regression-suite.spec.ts', '**/bpmn-topology-edge-case-suite.spec.ts'],
  // Do not recreate a Playwright-owned preview server when the Windows base config omits it.
  webServer: baseConfig.webServer && {
    ...baseConfig.webServer,
    reuseExistingServer: false,
  },
})
