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
  {
    name: 'firefox',
    use: {
      ...devices['Desktop Firefox'],
      /**
       * Firefox refuses WebGL on a machine with no GPU: its driver blocklist rejects
       * llvmpipe, `getContext('webgl2')` returns null, and the game correctly shows its
       * "this browser needs WebGL2" panel — which meant every Firefox test on every
       * viewport waited out its own ninety-second timeout without ever reaching the
       * game. Five viewports' worth of that is why the CI job was cancelled at twenty
       * minutes, twice, having tested nothing.
       *
       * A CI runner without a GPU is not the configuration a Firefox player is in, so
       * forcing software WebGL on here tests the game rather than the runner.
       */
      launchOptions: {
        firefoxUserPrefs: {
          'webgl.force-enabled': true,
          'webgl.disabled': false,
          'webgl.disable-fail-if-major-performance-caveat': true,
          'gfx.webrender.all': true
        }
      }
    }
  },
  { name: 'webkit', use: devices['Desktop Safari'] }
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A whole engine failing is not worth thirty-six timeouts plus retries. Eight
  // failures is far past the point where the run has already told us what it knows,
  // and stopping there is the difference between a report in three minutes and a job
  // cancelled at twenty with no report at all.
  maxFailures: process.env.CI ? 8 : undefined,
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
