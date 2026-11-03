import { defineConfig, devices } from '@playwright/test'

const WEB_PORT = 5311
const SERVER_PORT = 5312
export const BASE_URL = `http://localhost:${WEB_PORT}/pano-whiteboard/`

/**
 * End-to-end tests run against the production build (`npm run build:e2e`,
 * which points the client at ws://localhost:5312) and the compiled server.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: /screenshots\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: [
    {
      command: 'node --disable-warning=ExperimentalWarning ../server/dist/index.js',
      url: `http://localhost:${SERVER_PORT}/health`,
      env: { PORT: String(SERVER_PORT), DB_PATH: ':memory:', LOG_LEVEL: 'warn', ROOM_IDLE_MS: '5000' },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx vite preview --port ${WEB_PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
