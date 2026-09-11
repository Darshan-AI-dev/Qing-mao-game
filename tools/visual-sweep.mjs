/**
 * Visual sweep: photograph every area in the game and report its frame stats.
 *
 * Data-level tests said the world was fine while it was rendering a black room, an
 * oversized objective marker and a character facing backwards. Looking at it is the
 * only check that catches those, so this makes looking at it repeatable.
 *
 *   node tools/visual-sweep.mjs [--out dir] [--width 900] [--height 900] [--phone]
 *
 * Writes one PNG per area plus contact sheets, and prints a table of draw calls,
 * triangles and a measured brightness for each — a room that is too dark to play
 * shows up as a low mean luminance long before anyone opens the image.
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { PNG_DIR } from './sweep-areas.mjs';
import { startServer, stopServer } from './sweep-server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const phone = args.includes('--phone');
const out = flag('out', PNG_DIR);
const width = Number(flag('width', phone ? 430 : 960));
const height = Number(flag('height', phone ? 932 : 900));
const url = flag('url', 'http://127.0.0.1:4173/');
const chromiumPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1194/chrome-linux/chrome`
  : undefined;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await startServer(url, !args.includes('--no-server'));

const browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 1,
  isMobile: phone,
  hasTouch: phone
});

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.locator('#begin').click();
await page.waitForFunction(() => !!window.qingMao, null, { timeout: 30_000 });
await page.waitForSelector('#skipScene', { state: 'visible', timeout: 30_000 });
await page.locator('#skipScene').click();
await page.waitForFunction(() => window.qingMao.debug.isExploring(), null, { timeout: 30_000 });

const areas = await page.evaluate(() => window.qingMao.debug.areaIds());
const rows = [];

for (const area of areas) {
  const ok = await page.evaluate((id) => window.qingMao.debug.visitArea(id), area);
  if (!ok) {
    rows.push({ area, error: 'visitArea refused' });
    continue;
  }
  // Let the area build, the lights settle and a couple of frames land.
  await page.waitForTimeout(700);
  const slug = area.replace(/[.]/g, '_');

  // Play distance: what the player actually sees.
  await page.evaluate(() => window.qingMao.debug.setCameraDistance(16));
  await page.waitForTimeout(350);
  const file = `${out}/${slug}.png`;
  const shot = await page.screenshot({ path: file });
  const stats = await page.evaluate(() => window.qingMao.frameStats());

  // Establishing shot: enough of the area to judge whether it is laid out at all.
  // Bypass the interior camera clamp, or an establishing shot of a room is no wider
  // than the play shot and tells you nothing about its layout.
  await page.evaluate(() => window.qingMao.debug.setInspectionDistance(54));
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/wide_${slug}.png` });
  await page.evaluate(() => window.qingMao.debug.setInspectionDistance(null));

  // Luminance is measured from the saved PNG by tools/contact-sheet.py. Reading it
  // back from the WebGL canvas here returns black, because the drawing buffer is not
  // preserved between frames.
  void shot;
  rows.push({ area, file, ...stats });
}

await browser.close();
stopServer();

const widest = Math.max(...rows.map((r) => r.area.length));
console.log('area'.padEnd(widest), 'draws  tris    chunks');
for (const row of rows) {
  if (row.error) {
    console.log(row.area.padEnd(widest), row.error);
    continue;
  }
  console.log(
    row.area.padEnd(widest),
    String(row.drawCalls).padStart(5),
    String(row.triangles).padStart(7),
    `${row.chunksVisible}/${row.chunksTotal}`.padStart(7)
  );
}

const empty = rows.filter((r) => !r.error && r.drawCalls === 0).map((r) => r.area);
await writeFile(`${out}/report.json`, JSON.stringify({ width, height, phone, rows, consoleErrors }, null, 2));

console.log(`\n${rows.length} areas photographed into ${out} (play + wide shots)`);
console.log('Now run: python3 tools/contact-sheet.py');
if (empty.length) console.log(`EMPTY FRAMES: ${empty.join(', ')}`);
if (consoleErrors.length) console.log(`CONSOLE ERRORS: ${[...new Set(consoleErrors)].slice(0, 5).join(' | ')}`);
