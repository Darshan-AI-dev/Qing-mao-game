import { existsSync, readdirSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Some sandboxes ship a Chromium build under PLAYWRIGHT_BROWSERS_PATH that belongs to
 * an older Playwright revision. When one is present, point at it rather than trying
 * to download; CI runs `playwright install` and takes the normal path.
 */
function preinstalledChromium(): string | undefined {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  for (const entry of readdirSync(base)) {
    if (!entry.startsWith('chromium-')) continue;
    const binary = `${base}/${entry}/chrome-linux/chrome`;
    if (existsSync(binary)) return binary;
  }
  return undefined;
}

const chromiumBinary = preinstalledChromium();

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
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(chromiumBinary ? { launchOptions: { executablePath: chromiumBinary } } : {})
    }
  },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] }
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Playwright defaults to a single worker under CI, which for 540 WebGL tests meant a
  // three-hour run. Three hours is not feedback: it is why two WebKit camera failures
  // sat in the branch unnoticed across several pushes. Two workers on a shared runner
  // is about as far as software-rendered WebGL goes before the frame-budget tests start
  // timing out on contention rather than on anything real.
  workers: process.env.CI ? 2 : undefined,
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
    // Never reuse a server. Reusing one meant a run could silently test whatever build
    // happened to be already serving — which produced three separate "failures" that
    // were really a stale bundle, including one that hid a genuine layout bug.
    // Rebuilding costs a few seconds and removes the entire class of mistake.
    reuseExistingServer: false,
    timeout: 180_000
  }
});
