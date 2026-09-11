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
  // Let the chapter cards clear and the world settle before sampling.
  await page.waitForTimeout(6000);

  const stats = await page.evaluate(() => window.qingMao.frameStats());

  const budget = BUDGETS[stats.tier];
  testInfo.annotations.push({
    type: 'frame',
    description:
      `tier=${stats.tier} draws=${stats.drawCalls}/${budget.drawCalls} ` +
      `tris=${stats.triangles}/${budget.triangles} ` +
      `chunks=${stats.chunksVisible}/${stats.chunksTotal} scale=${stats.renderScale}`
  });

  expect(stats.drawCalls, `draw calls on ${stats.tier}`).toBeLessThanOrEqual(budget.drawCalls);
  expect(stats.triangles, `visible triangles on ${stats.tier}`).toBeLessThanOrEqual(budget.triangles);
  // Culling has to actually be culling: if every chunk is visible in a large area,
  // the frustum test has regressed.
  if (stats.chunksTotal > 4) {
    expect(stats.chunksVisible, 'frustum culling is not removing anything').toBeLessThan(stats.chunksTotal);
  }
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
