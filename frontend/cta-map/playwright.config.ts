import { defineConfig, devices } from '@playwright/test'

const port = process.env.PORT ?? '4173'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
  },
  webServer: {
    command: `npm run dev -- --host --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
