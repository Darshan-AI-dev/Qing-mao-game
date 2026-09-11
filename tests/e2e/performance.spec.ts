/**
 * Performance budget check, run in the same pass as the render matrix.
 *
 * The review measured the previous build at about 120 draw calls and about 326,000
 * vertices every frame with no culling at all. This test reads the renderer's own
 * counters after the world is up and asserts them against the active tier's budget.
 */
import { expect, test } from '@playwright/test';
import { BUDGETS } from '../../engine/render/quality';

test('the frame stays inside the tier budget', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#begin').click();
  await page.waitForFunction(() => !!window.qingMao, null, { timeout: 20_000 });
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

test('frustum culling removes chunks the camera cannot see', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#begin').click();
  await page.waitForFunction(() => !!window.qingMao, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.qingMao.frameStats().drawCalls > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  // The prologue arena is small enough that every chunk is legitimately on screen,
  // so point the camera straight up and check the count actually falls. That is the
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

  await page.goto('/');
  await page.locator('#begin').click();
  await page.waitForFunction(() => !!window.qingMao, null, { timeout: 20_000 });
  await page.waitForTimeout(4000);

  const total = [...transferred.values()].reduce((a, b) => a + b, 0);
  testInfo.annotations.push({ type: 'first-load', description: `${(total / 1e6).toFixed(2)} MB across ${transferred.size} responses` });
  expect(total, 'first playable moment should need under 10 MB').toBeLessThan(10_000_000);
});
