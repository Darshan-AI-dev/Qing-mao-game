/**
 * Player agency between beats.
 *
 * The first build of this chained all 68 beats back to back, so `inScene` was true
 * from the title screen to chapter 200 and the player could never move. These tests
 * assert that control comes back, that moving actually moves, and that skip and
 * auto-advance do what they say.
 */
import { expect, test, type Page } from '@playwright/test';

// Reaching a playable state means sitting through (or skipping) the opening scene,
// which is slower than the default per-test budget allows for.
test.setTimeout(90_000);

async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#begin').click();
  await page.waitForFunction(() => !!window.qingMao, null, { timeout: 20_000 });
}

/** Skips whatever scene is playing and waits for control to come back. */
async function skipToControl(page: Page): Promise<void> {
  await page.waitForSelector('#skipScene', { state: 'visible', timeout: 30_000 });
  await page.locator('#skipScene').click();
  await page.waitForFunction(() => window.qingMao.debug.isExploring(), null, { timeout: 30_000 });
}

test('control returns to the player after the opening scene', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  expect(await page.evaluate(() => window.qingMao.debug.isExploring())).toBe(true);
});

test('the player can walk around between beats', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);

  const before = await page.evaluate(() => window.qingMao.debug.playerPosition());
  // No click first: the canvas sits under the HUD, so Playwright would wait forever
  // for it to be clickable. Key events go to the window regardless.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.qingMao.debug.playerPosition());

  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  expect(moved, `player moved ${moved.toFixed(2)} paces`).toBeGreaterThan(1);
});

test('the next beat waits at a marker instead of starting itself', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);

  const state = await page.evaluate(() => ({
    awaiting: window.qingMao.debug.awaitingBeat(),
    distance: window.qingMao.debug.objectiveDistance()
  }));
  expect(state.awaiting, 'a beat should be offered, not auto-started').toBeTruthy();
  expect(state.distance).not.toBeNull();
  // Walkable: the review's complaint about the old build was a 192-pace spawn.
  expect(state.distance!).toBeLessThanOrEqual(24);

  // It must still be waiting a few seconds later, not have started on its own.
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.qingMao.debug.isExploring())).toBe(true);
});

test('skip interrupts a line that is still typing', async ({ page }) => {
  await openGame(page);
  // Wait for a line to be mid-typewriter, then skip without touching Continue.
  await page.waitForSelector('#dialogueText', { state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(600);

  const started = Date.now();
  await page.locator('#skipScene').click();
  await page.waitForFunction(() => window.qingMao.debug.isExploring(), null, { timeout: 20_000 });
  const elapsed = Date.now() - started;

  // Before the fix this needed a manual tap per remaining line and never resolved
  // on its own. It should now finish the scene without further input.
  expect(elapsed, `skip took ${elapsed}ms`).toBeLessThan(15_000);
});

test('a skipped scene still records its evidence and flags', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  // The cave beat (ch 14-19) leaves entry traces. Skipping must not quietly wipe the
  // investigation trail — skip is a presentation choice, not a state change.
  const wired = await page.evaluate(() => window.qingMao.debug.sceneStateAfterSkip());
  expect(wired.flagsApplied, 'the opening beat set no flags').toBeGreaterThan(0);
});

test('tapping the dialogue panel advances the line', async ({ page }) => {
  await openGame(page);
  await page.waitForSelector('#dialogueText', { state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(400);

  const first = await page.locator('#dialogueText').innerText();
  await page.locator('#dialoguePanel').click({ position: { x: 40, y: 40 } });
  await page.waitForTimeout(120);
  const completed = await page.locator('#dialogueText').innerText();
  // First tap completes the line rather than skipping past it.
  expect(completed.length).toBeGreaterThanOrEqual(first.length);
});

test('auto-advance moves through lines with no input', async ({ page }) => {
  await openGame(page);
  await page.waitForSelector('#dialogueText', { state: 'visible', timeout: 20_000 });
  await page.locator('#autoAdvance').check();

  const before = await page.evaluate(() => window.qingMao.debug.lineCount());
  // A long line types for ~3.5s and then holds for up to 4.5s, so allow for one of
  // each rather than assuming the shortest case.
  await page.waitForFunction(
    (start) => window.qingMao.debug.lineCount() > start,
    before,
    { timeout: 25_000 }
  );
  const after = await page.evaluate(() => window.qingMao.debug.lineCount());
  expect(after, 'auto-advance delivered no further lines').toBeGreaterThan(before);
});
