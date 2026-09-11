import { defineConfig, devices } from '@playwright/test';

/**
 * The cross-browser matrix.
 *
 * Playwright drives Chromium, Firefox and WebKit — WebKit being the engine behind
 * Safari, which is the one that matters most here because of the seven-day storage
 * eviction and because Safari 15 is the WebGL2 floor.
 *
 * The five viewports are the ones from the support plan: a 390 px phone, a portrait
 * and a landscape tablet, a laptop and a desktop.
 */
const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'desktop', width: 1920, height: 1080 }
];

const ENGINES = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] }
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  // Screenshot comparisons are generous by default: a 0.2% pixel budget absorbs
  // font hinting differences between engines without hiding a real layout break.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  projects: ENGINES.flatMap((engine) =>
    VIEWPORTS.map((viewport) => ({
      name: `${engine.name}-${viewport.name}`,
      use: { ...engine.use, viewport: { width: viewport.width, height: viewport.height } }
    }))
  ),
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
