/**
 * Shared boot steps for every end-to-end spec.
 *
 * Each spec used to open the game with its own three lines — `goto`, click `#begin`,
 * wait for `window.qingMao` — and every one of them failed the same unhelpful way. If
 * the game cannot start, `#begin` never becomes visible, so Playwright waits out the
 * full test timeout and the report says "Test timeout of 90000ms exceeded" without a
 * word about the cause. Five Firefox viewports failed all thirty-six tests exactly
 * that way, ninety seconds at a time, and the CI job was cancelled at twenty minutes
 * before one usable error message reached the log.
 *
 * So every wait here is staged, has its own short budget, and reports what the page
 * actually said when it fails: the unsupported-browser panel's own text, anything
 * thrown at the top level, and any console error. A broken engine now says why in
 * about fifteen seconds instead of hanging.
 */
import { type Page } from '@playwright/test';

const PROBLEMS = new WeakMap<Page, string[]>();

/**
 * Starts recording everything the page complains about. Safe to call more than once
 * per page; only the first call attaches the listeners.
 */
export function watchPage(page: Page): void {
  if (PROBLEMS.has(page)) return;
  const problems: string[] = [];
  PROBLEMS.set(page, problems);
  page.on('pageerror', (error) => problems.push(`uncaught error: ${error.message}`));
  page.on('crash', () => problems.push('the page process crashed'));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
}

/** What the page has to say for itself, for attaching to a failure. */
async function diagnosis(page: Page): Promise<string> {
  const notes: string[] = [];

  // The game's own "this browser cannot run it" panel is the single most likely
  // explanation, and it is on screen while Playwright is waiting for something else.
  const refused = await page
    .evaluate(() => {
      const panel = document.getElementById('unsupported');
      if (!panel || panel.hidden) return null;
      return (panel.textContent ?? '').replace(/\s+/g, ' ').trim();
    })
    .catch(() => null);
  if (refused) notes.push(`the game refused to start: ${refused}`);

  // Whether a WebGL2 context can be had at all, asked directly rather than inferred.
  const webgl = await page
    .evaluate(() => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return 'getContext("webgl2") returned null';
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown renderer';
        return `webgl2 ok (${renderer})`;
      } catch (error) {
        return `getContext("webgl2") threw: ${String(error)}`;
      }
    })
    .catch(() => 'could not be asked about WebGL2');
  notes.push(webgl);

  const problems = PROBLEMS.get(page) ?? [];
  // Duplicates pile up fast when a frame loop throws every frame.
  if (problems.length) notes.push(...[...new Set(problems)].slice(0, 6));

  return notes.join('\n  ');
}

/** Runs one boot step and, if it does not finish, says what the page was doing. */
async function stage(page: Page, what: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (cause) {
    throw new Error(`${what}\n  ${await diagnosis(page)}`, { cause });
  }
}

/** Loads the page and waits for the title screen to be usable. */
export async function openTitle(page: Page, url = '/'): Promise<void> {
  watchPage(page);
  await page.goto(url);
  await stage(page, 'the title screen never became usable: #begin was not visible', () =>
    page.locator('#begin').waitFor({ state: 'visible', timeout: 15_000 })
  );
}

/** Presses Begin and waits for the game object the tests read through. */
export async function pressBegin(page: Page): Promise<void> {
  watchPage(page);
  await stage(page, 'the title screen never became usable: #begin was not visible', () =>
    page.locator('#begin').waitFor({ state: 'visible', timeout: 15_000 })
  );
  await page.locator('#begin').click();
  await waitForGame(page);
}

/** Waits for `window.qingMao`, which only exists once the engine has started. */
export async function waitForGame(page: Page): Promise<void> {
  watchPage(page);
  await stage(page, 'the game never started: window.qingMao was never defined', () =>
    page.waitForFunction(() => !!window.qingMao, null, { timeout: 20_000 })
  );
}

/** Title screen to a live game. */
export async function openGame(page: Page): Promise<void> {
  await openTitle(page);
  await pressBegin(page);
}

/** Skips whatever scene is playing and waits for control to come back. */
export async function skipToControl(page: Page): Promise<void> {
  await stage(page, 'no scene ever started: the skip button never appeared', () =>
    page.locator('#skipScene').waitFor({ state: 'visible', timeout: 30_000 })
  );
  await page.locator('#skipScene').click();
  await stage(page, 'control never came back to the player after the scene was skipped', () =>
    page.waitForFunction(() => window.qingMao.debug.isExploring(), null, { timeout: 30_000 })
  );
}
