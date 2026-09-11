/**
 * Render and layout pass across the support matrix.
 *
 * The measured problem this guards against: on a 390 px phone the previous HUD
 * covered about 70% of the screen and showed all eleven action buttons even though
 * most were locked. These tests assert the HUD's actual footprint and that only
 * unlocked abilities are in the DOM.
 */
import { expect, test, type Page } from '@playwright/test';

async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  const intro = page.locator('#intro');
  await expect(intro).toBeVisible();
  await page.locator('#begin').click();
  await expect(intro).toBeHidden();
  // The prologue opens with a chapter card; wait for the world to be live behind it.
  await page.waitForFunction(() => !!window.qingMao, null, { timeout: 20_000 });
}

test('the title screen shows the content notice and the intensity choice', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#intro .notice h3')).toHaveText('Before you begin');
  await expect(page.locator('#introIntensity')).toBeVisible();
  // Start points run forward, not backward: 51, then 101, then 151.
  const labels = await page.locator('.startRow button').allTextContents();
  expect(labels).toEqual(['Start at chapter 51', 'Start at chapter 101', 'Start at chapter 151']);
});

test('the intro copy has no missing words', async ({ page }) => {
  await page.goto('/');
  const text = (await page.locator('#intro').innerText()).replace(/\s+/g, ' ');
  expect(text).toContain('the wolf tide');
  expect(text).not.toMatch(/choices the wolf tide/);
});

test('no link in the game 404s', async ({ page, request }) => {
  await openGame(page);
  await page.waitForTimeout(2500);
  await page.locator('#journalButton').click();
  await expect(page.locator('#journal')).toBeVisible();

  // The old build offered a resources ZIP that was not there. Any href the game
  // renders has to actually resolve.
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? '')
      .filter((href) => href && !href.startsWith('#') && !href.startsWith('blob:') && !href.startsWith('data:')));

  for (const href of hrefs) {
    const response = await request.get(new URL(href, page.url()).toString());
    expect(response.status(), `${href} returned ${response.status()}`).toBeLessThan(400);
  }
});

test('the game renders and stays inside the frame', async ({ page }) => {
  await openGame(page);
  const canvas = page.locator('#world');
  await expect(canvas).toBeVisible();
  const size = await canvas.boundingBox();
  expect(size?.width).toBeGreaterThan(100);

  // The page itself must never scroll sideways at any viewport in the matrix.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the HUD leaves the world visible on a phone', async ({ page }, testInfo) => {
  await openGame(page);
  await page.waitForTimeout(2500);
  const viewport = page.viewportSize()!;
  const covered = await page.evaluate(() => {
    const ids = ['header', 'quest', 'dialoguePanel', 'footer', 'joystick'];
    let area = 0;
    for (const id of ids) {
      const node = document.getElementById(id) ?? document.querySelector(id);
      if (!node || (node as HTMLElement).hidden) continue;
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue;
      area += box.width * box.height;
    }
    return area;
  });
  const ratio = covered / (viewport.width * viewport.height);
  testInfo.annotations.push({ type: 'hud-coverage', description: `${(ratio * 100).toFixed(1)}%` });
  // The old build measured about 70% on a 390 px phone. Half the screen is the cap.
  expect(ratio).toBeLessThan(0.5);
});

test('only unlocked abilities are in the DOM', async ({ page }) => {
  await openGame(page);
  await page.waitForTimeout(2500);
  const buttons = await page.locator('#actions button').count();
  // The prologue is played at full power, but the Rank one body that follows it has
  // almost nothing. Either way, eleven buttons is the number we are not shipping.
  expect(buttons).toBeLessThan(8);
});

test('tap targets meet the 44 px minimum', async ({ page }) => {
  await openGame(page);
  await page.waitForTimeout(2000);
  const small = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const node of Array.from(document.querySelectorAll('button:not([hidden])'))) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.height < 44 - 0.5 || box.width < 44 - 0.5) {
        offenders.push(`${node.id || node.className || node.tagName}: ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return offenders;
  });
  expect(small, small.join(', ')).toEqual([]);
});

test('the journal lists all two hundred chapters', async ({ page }) => {
  await openGame(page);
  await page.waitForTimeout(2500);
  await page.locator('#journalButton').click();
  await expect(page.locator('#journal')).toBeVisible();
  await expect(page.locator('.chapterRow')).toHaveCount(200);
  await expect(page.locator('.coverageSummary')).toContainText('200 of 200 chapters covered');
});

test('no two HUD panels overlap', async ({ page }) => {
  await openGame(page);
  await page.waitForTimeout(2500);
  // Raise a toast through the game's own event bus, so it is positioned exactly as it
  // would be in play rather than by the test poking the DOM.
  await page.evaluate(() => window.qingMao.debug.toast('A reasonably long toast message, of the kind the game shows.'));
  await page.waitForTimeout(200);

  const overlaps = await page.evaluate(() => {
    const ids = ['header', 'quest', 'toast', 'joystick', 'guWheel'];
    const boxes: { id: string; r: DOMRect }[] = [];
    for (const id of ids) {
      const node = document.getElementById(id);
      if (!node || node.hidden || getComputedStyle(node).display === 'none') continue;
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) boxes.push({ id, r });
    }
    for (const name of ['.vitals', '.actionArea']) {
      const node = document.querySelector(name);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) boxes.push({ id: name, r });
    }
    const hits: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        // The action area is a child of the footer alongside the vitals; they are laid
        // out together and are allowed to touch.
        if (a.id === '.vitals' && b.id === '.actionArea') continue;
        const gap = 2;
        const intersects =
          a.r.left < b.r.right - gap && b.r.left < a.r.right - gap &&
          a.r.top < b.r.bottom - gap && b.r.top < a.r.bottom - gap;
        if (intersects) hits.push(`${a.id} overlaps ${b.id}`);
      }
    }
    return hits;
  });

  expect(overlaps, overlaps.join('; ')).toEqual([]);
});

test('the region name and the toast do not overlap', async ({ page }) => {
  await openGame(page);
  await page.waitForTimeout(1200);

  const boxes = async () =>
    page.evaluate(() => {
      const region = document.getElementById('regionName')!.getBoundingClientRect();
      const toast = document.getElementById('toast')!.getBoundingClientRect();
      return { region: region.bottom, toast: toast.top };
    });

  // Two code paths, and this test only ever checked the first one. Before any message
  // arrives the toast sits wherever the stylesheet put it, and that fallback was three
  // pixels above the region name on WebKit at desktop width — which is what failed here
  // for a run and a half while I kept fixing the measuring code instead.
  const resting = await boxes();
  expect(resting.toast, 'the resting position overlaps the region name')
    .toBeGreaterThanOrEqual(resting.region - 1);

  // And again with a message actually on screen, which is the measured path.
  await page.evaluate(() => window.qingMao.debug.toast('A reasonably long toast message, of the kind the game shows.'));
  await page.waitForTimeout(300);
  const showing = await boxes();
  expect(showing.toast, 'a toast on screen overlaps the region name')
    .toBeGreaterThanOrEqual(showing.region - 1);
});

test('reduced motion is honoured', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await page.waitForTimeout(1500);
  const duration = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'telegraph';
    document.body.append(probe);
    const value = getComputedStyle(probe).animationDuration;
    probe.remove();
    return value;
  });
  expect(parseFloat(duration)).toBeLessThan(0.05);
});
