import { defineConfig } from '@playwright/test'
import path from 'node:path'

const database =
  process.env.E2E_DATABASE_URL ||
  'sqlite:///' + path.resolve('../.cache/browser-test.db').replaceAll('\\', '/')
process.env.E2E_DATABASE_URL = database
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'node tools/e2e-backend.mjs',
      url: 'http://127.0.0.1:5001/api/v1/health/ready',
      timeout: 60000,
      env: { E2E_DATABASE_URL: database },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 5174',
      url: 'http://127.0.0.1:5174',
      timeout: 60000,
      env: { VITE_API_PROXY: 'http://127.0.0.1:5001' },
      reuseExistingServer: false,
    },
  ],
})
