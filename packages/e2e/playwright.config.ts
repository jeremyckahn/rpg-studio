import { defineConfig, devices } from '@playwright/test'

/** The editor is served from its production build: that is what users get, service worker included. */
const PORT = 4173
const CI = Boolean(process.env.CI)

/**
 * Only set where the browser that `playwright install` fetches is unavailable (a sandbox with a
 * pre-installed Chromium). Normal runs and CI leave it unset.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.e2e.ts',
  globalSetup: './support/globalSetup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  // Never retried, on CI or locally: a test that passes on a second try hides a flake, and a flake
  // is a failing test here.
  retries: 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['github'], ['html', { open: 'never' }], ['list'], ['./support/videoReporter.ts']]
    : [['list']],
  // A test builds a project through the UI, and the exported-game ones also export, serve and boot
  // the game under software WebGL on a two-core runner: 20 to 35 seconds there, so 30 left no room
  // once retries were off. A hang still fails, only later; assertions keep their own 10 s.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // With no retries, a trace is kept for every failure. Video is recorded for every test on CI
    // and uploaded (see `support/videoReporter.ts`); locally only failures keep theirs.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: CI ? 'on' : 'retain-on-failure',
    // Needs the real service worker off: it would cache between tests and hide regressions.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          // Pixi needs WebGL; CI machines have no GPU, so use the software rasteriser.
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      // `vite preview` of the production build (`pnpm build && pnpm build:app` first).
      command: `pnpm --filter @rpgstudio/editor exec vite preview --config vite.app.config.ts --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
})
