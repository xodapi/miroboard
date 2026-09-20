import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Standalone config for the probes in this folder. The root vite.config.ts only
// includes test files under src, so these experiments never run in CI — run them
// explicitly with `npm run probe`.
const repoRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    root: repoRoot,
    include: ['docs/experiments/**/*.test.ts'],
  },
})
