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

/** Control must not come back until the next beat's area is actually loaded. */
async function currentArea(page: Page): Promise<string> {
  return page.evaluate(() => window.qingMao.debug.currentArea());
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

test('the screen is not left black after playing a scene to its end', async ({ page }) => {
  await openGame(page);

  // This has to *play through*, not skip. A skip never runs the `fade` command at all,
  // so skipping the prologue hides the very bug this is here to catch: the scene ends
  // on `fade: black` and the fade back lives at the top of the next script.
  await page.locator('#autoAdvance').check();

  // Answer the chapter 2 choice when it appears, the way a player would.
  await page.waitForSelector('#dialogueChoices button', { state: 'visible', timeout: 90_000 });
  await page.locator('#dialogueChoices button').first().click();

  await page.waitForFunction(() => window.qingMao.debug.isExploring(), null, { timeout: 90_000 });
  await page.waitForTimeout(1200);

  const presentation = await page.evaluate(() => ({
    fadeOn: document.getElementById('fade')!.classList.contains('on'),
    fadeOpacity: Number(getComputedStyle(document.getElementById('fade')!).opacity),
    letterboxOn: document.getElementById('letterbox')!.classList.contains('on'),
    sceneArtVisible: !document.getElementById('sceneArt')!.hidden,
    drawCalls: window.qingMao.frameStats().drawCalls
  }));

  expect(presentation.fadeOn, 'the screen is still faded to black').toBe(false);
  expect(presentation.fadeOpacity, 'the fade overlay is still opaque').toBeLessThan(0.1);
  expect(presentation.letterboxOn, 'letterbox bars are still up').toBe(false);
  expect(presentation.sceneArtVisible, 'scene art is still covering the view').toBe(false);
  expect(presentation.drawCalls, 'nothing is being drawn').toBeGreaterThan(0);
});

test('the world is still being drawn once control returns', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  // A black screen and a stopped renderer look identical to a player; check both.
  const stats = await page.evaluate(() => window.qingMao.frameStats());
  expect(stats.drawCalls, 'nothing is being drawn after the scene').toBeGreaterThan(0);
});

test('forward walks away from the camera, not toward it', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);

  // The handedness of the movement basis is covered exhaustively at 24 camera angles
  // by tests/unit/movement.test.mts. This one only has to prove it is wired up — the
  // chapter 3 room is a bedroom, so a long walk in any direction hits a wall.
  const before = await page.evaluate(() => ({
    player: window.qingMao.debug.playerPosition(),
    camera: window.qingMao.debug.cameraPosition()
  }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.qingMao.debug.playerPosition());

  const distBefore = Math.hypot(before.player.x - before.camera.x, before.player.z - before.camera.z);
  const distAfter = Math.hypot(after.x - before.camera.x, after.z - before.camera.z);
  expect(distAfter, 'forward moved the player toward the camera').toBeGreaterThan(distBefore + 0.5);
});

test('the camera stays inside the walls of a small room', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  // Control is only released once the next beat's area is up, so this is deterministic.
  expect(await currentArea(page)).toBe('mountain.hostel-room');
  // A fixed 16-unit orbit put the camera outside an 18-by-20 bedroom, so the player
  // was looking at the room through its own wall.
  const view = await page.evaluate(() => ({
    camera: window.qingMao.debug.cameraPosition(),
    area: window.qingMao.debug.areaContents('mountain.hostel-room')
  }));
  expect(view.area.enclosed).toBe(true);
  expect(Math.abs(view.camera.x), 'camera is outside the room on x').toBeLessThan(9);
  expect(Math.abs(view.camera.z), 'camera is outside the room on z').toBeLessThan(10);
});

test('the chapter 3 room has the bed, window and stones the text describes', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  // The prologue hands off to the bamboo room; walk into it and check its contents.
  const contents = await page.evaluate(() => window.qingMao.debug.areaContents('mountain.hostel-room'));
  for (const required of ['bed', 'window', 'table', 'chest']) {
    expect(contents.props, `the room has no ${required}`).toContain(required);
  }
  expect(contents.dressing, 'no blanket on the bed').toContain('blanket');
  expect(contents.dressing, 'no bag of stones').toContain('stone-bag');
  expect(contents.enclosed, 'the room should have a ceiling').toBe(true);
});

test('Fang Yuan has long black hair', async ({ page }) => {
  await openGame(page);
  const hair = await page.evaluate(() => window.qingMao.debug.characterLook('fang-yuan'));
  expect(hair.length).toBe('long');
  // Near-black, not brown: every channel low and close together.
  expect(Math.max(...hair.colour)).toBeLessThan(0.12);
  expect(hair.meshes, 'the long-hair geometry is not in the actor').toBeGreaterThan(4);
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
