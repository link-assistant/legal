import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /\.pw\.js$/,
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: 'npm run build:demo && node experiments/serve-demo.mjs',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
