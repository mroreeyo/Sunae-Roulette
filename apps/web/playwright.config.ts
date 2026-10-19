import { defineConfig, devices } from '@playwright/test';
import { tourSeen } from './e2e/tourSeen.ts';

// Needs the local Supabase stack (`supabase start`) with places imported.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  // One local Supabase and one Vite dev server serve every test; more workers just queue on them.
  workers: 2,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Pixel 7'],
    // The first-visit tour covers the page; tests start past it, except e2e/tour.e2e.ts.
    storageState: tourSeen,
  },
  webServer: {
    command: 'pnpm dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
