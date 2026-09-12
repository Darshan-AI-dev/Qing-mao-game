/**
 * Performance budget check, run in the same pass as the render matrix.
 *
 * The review measured the previous build at about 120 draw calls and about 326,000
 * vertices every frame with no culling at all. This test reads the renderer's own
 * counters after the world is up and asserts them against the active tier's budget.
 */
import { expect, test } from '@playwright/test';
import { openGame } from './harness';
import { BUDGETS } from '../../engine/render/quality';

test('the frame stays inside the tier budget', async ({ page }, testInfo) => {
  await openGame(page);
  // Wait for the world to be on screen rather than guessing at a settle time; under
  // parallel load a fixed delay races the first area build.
  await page.waitForFunction(() => window.qingMao.frameStats().drawCalls > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const stats = await page.evaluate(() => window.qingMao.frameStats());

  const budget = BUDGETS[stats.tier];
  testInfo.annotations.push({
    type: 'frame',
    description:
      `tier=${stats.tier} draws=${stats.drawCalls}/${budget.drawCalls} ` +
      `tris=${stats.triangles}/${budget.triangles} ` +
      `chunks=${stats.chunksVisible}/${stats.chunksTotal} scale=${stats.renderScale}`
  });

  // A frame that draws nothing would satisfy every ceiling below, so check the world
  // is actually on screen before checking that it fits.
  expect(stats.drawCalls, 'the frame drew nothing at all').toBeGreaterThan(0);
  expect(stats.triangles, 'the frame drew no geometry at all').toBeGreaterThan(100);

  expect(stats.drawCalls, `draw calls on ${stats.tier}`).toBeLessThanOrEqual(budget.drawCalls);
  expect(stats.triangles, `visible triangles on ${stats.tier}`).toBeLessThanOrEqual(budget.triangles);
  expect(stats.chunksVisible, 'no chunk is being submitted').toBeGreaterThan(0);
  expect(stats.chunksVisible).toBeLessThanOrEqual(stats.chunksTotal);
});

test('the high tier renders through its postprocessing chain', async ({ page }, testInfo) => {
  // Everything that runs these tests detects software rendering and pins itself to the
  // low tier, so the high path — bloom, normal maps, the environment — is never
  // exercised unless a test asks for it. It went out once reporting one draw call and
  // one triangle a frame, because `renderer.info` resets on every internal render and
  // the composer makes one per pass, which left the frame budget assertion below
  // measuring a fullscreen quad and unable to fail.
  test.setTimeout(180_000);
  const thrown: string[] = [];
  page.on('pageerror', (error) => thrown.push(error.message));

  await openGame(page);
  await page.evaluate(async () => {
    const save = JSON.parse(JSON.stringify(window.qingMao.save));
    save.settings.tier = 'high';
    const open = indexedDB.open('qing-mao', 1);
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve) => {
      const put = db.transaction('saves', 'readwrite').objectStore('saves').put(JSON.stringify(save), 'auto');
      put.onsuccess = () => resolve();
      put.onerror = () => resolve();
    });
  });
  await page.reload();
  await page.waitForFunction(() => !!window.qingMao, null, { timeout: 30_000 });
  await page.locator('#begin').click().catch(() => {});
  await page.waitForFunction(() => window.qingMao.frameStats().drawCalls > 0, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  const stats = await page.evaluate(() => window.qingMao.frameStats());
  testInfo.annotations.push({ type: 'high-tier', description: JSON.stringify(stats) });
  expect(stats.tier, 'the seeded tier did not take').toBe('high');
  // A whole scene, not the composer's output quad.
  expect(stats.drawCalls, 'the frame is only the postprocessing quad').toBeGreaterThan(20);
  expect(stats.triangles, 'the frame drew no world').toBeGreaterThan(2000);
  const budget = BUDGETS.high;
  expect(stats.drawCalls, 'draw calls on high').toBeLessThanOrEqual(budget.drawCalls);
  expect(stats.triangles, 'visible triangles on high').toBeLessThanOrEqual(budget.triangles);
  expect(thrown, 'the postprocessing chain threw').toEqual([]);
});

test('frustum culling removes chunks the camera cannot see', async ({ page }, testInfo) => {
  // Time to boot, skip a scene and build a 132-unit area before the measurement even
  // starts. On a software rasteriser at desktop width a frame costs a few hundred
  // milliseconds, so the default thirty seconds is spent on setup and the test times
  // out at about thirty-two — which says nothing about culling, the thing it checks.
  // What this asserts is behaviour, not speed; the frame budget test above is what
  // guards cost, and it has its own numbers to fail on.
  test.setTimeout(120_000);
  await openGame(page);
  await page.waitForFunction(() => window.qingMao.frameStats().drawCalls > 0, null, { timeout: 30_000 });
  await page.waitForSelector('#skipScene', { state: 'visible', timeout: 30_000 });
  await page.locator('#skipScene').click();
  await page.waitForFunction(() => window.qingMao.debug.isExploring(), null, { timeout: 30_000 });

  // Measure this somewhere large and open.
  //
  // Every chunk carries a bounding sphere big enough to hold its props, and a camera
  // standing inside one of those spheres always counts as seeing it. The prologue is a
  // 96-unit hall in four chunks, so the camera is inside all of them at once and
  // nothing there can ever be culled — this only passed while the prologue was open to
  // the sky and its far chunks were small enough to fall outside. The bamboo path is
  // 132 units across in sixteen chunks, and from it the far ones genuinely leave the
  // frustum when the camera looks away.
  await page.evaluate(() => window.qingMao.debug.visitArea('mountain.bamboo-path'));
  await page.waitForTimeout(900);

  // Point the camera straight up and check the count actually falls. That is the
  // behaviour the old build had none of: it drew everything, every frame.
  const before = await page.evaluate(() => window.qingMao.frameStats());
  const after = await page.evaluate(async () => {
    window.qingMao.debug.lookStraightUp();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.qingMao.frameStats();
  });

  testInfo.annotations.push({
    type: 'culling',
    description: `${before.chunksVisible}/${before.chunksTotal} facing the world, ` +
      `${after.chunksVisible}/${after.chunksTotal} facing the sky`
  });
  expect(after.chunksVisible, 'culling removed nothing when the world left the frustum')
    .toBeLessThan(before.chunksVisible);
  expect(after.drawCalls).toBeLessThan(before.drawCalls);
});

test('the first playable moment stays inside the download budget', async ({ page }, testInfo) => {
  const transferred = new Map<string, number>();
  page.on('response', async (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(page.url() || 'http://127.0.0.1:4173').origin) return;
    try {
      const body = await response.body();
      transferred.set(url.pathname, body.length);
    } catch {
      /* redirects and cached responses have no body */
    }
  });

  await openGame(page);
  await page.waitForTimeout(4000);

  const total = [...transferred.values()].reduce((a, b) => a + b, 0);
  testInfo.annotations.push({ type: 'first-load', description: `${(total / 1e6).toFixed(2)} MB across ${transferred.size} responses` });
  expect(total, 'first playable moment should need under 10 MB').toBeLessThan(10_000_000);
});
