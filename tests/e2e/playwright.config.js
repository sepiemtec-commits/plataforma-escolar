// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PORT = Number(process.env.E2E_PORT || 3013);
const BASE = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: path.join(__dirname, 'specs'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }],
    ['json', { outputFile: path.join(__dirname, 'results/playwright.json') }]
  ],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    serviceWorkers: 'block'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: `node "${path.join(__dirname, 'server/start-e2e-server.js')}"`,
    url: `${BASE}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      E2E_PORT: String(PORT),
      ASSINATURA_MODO_DEV: 'true',
      DISABLE_RATE_LIMIT: '1',
      NODE_ENV: 'development'
    }
  },
  outputDir: path.join(__dirname, 'test-results')
});
