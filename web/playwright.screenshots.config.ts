import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/** Regenerates docs/screenshots and docs/demo.webm: `npm run build:e2e && npm run screenshots`. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /screenshots\.spec\.ts/,
  retries: 0,
  timeout: 120_000,
  projects: [{ name: 'screenshots', use: { browserName: 'chromium' } }],
})
