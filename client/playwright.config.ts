import path from 'path';
import { defineConfig, devices } from '@playwright/test';

const apiPort = Number(process.env.API_PORT || 3000);
const webPort = Number(process.env.WEB_PORT || 5173);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${webPort}`,
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'npm -w server start',
      cwd: path.resolve(__dirname, '..'),
      port: apiPort,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(apiPort) }
    },
    {
      command: `npm run dev -- --host 0.0.0.0 --port ${webPort}`,
      cwd: __dirname,
      port: webPort,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: process.env.VITE_API_URL || `http://localhost:${apiPort}`
      }
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
