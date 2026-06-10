import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.e2e.ts',
  timeout: 15000,
  retries: 1,
  outputDir: '../test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
    ['json', { outputFile: '../test-results/e2e-results.json' }],
  ],

  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Expect tauri dev already running; if not, start it
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
