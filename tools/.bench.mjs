import { chromium } from '@playwright/test';
import { startServer, stopServer } from './sweep-server.mjs';
import { rm } from 'node:fs/promises';
await rm('bench.png', { force: true });
const url = 'http://127.0.0.1:4173/';
await startServer(url);
const browser = await chromium.launch({ executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1194/chrome-linux/chrome` });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.locator('#begin').click();
await page.waitForFunction(() => !!window.qingMao);
await page.waitForSelector('#skipScene', { state: 'visible' });
await page.locator('#skipScene').click();
await page.waitForFunction(() => window.qingMao.debug.isExploring());
await page.evaluate(() => window.qingMao.debug.visitArea('mountain.forge'));
await page.waitForTimeout(700);
console.log('state:', JSON.stringify(await page.evaluate(() => ({
  area: window.qingMao.debug.currentArea(),
  pos: window.qingMao.debug.playerPosition(),
  objective: window.qingMao.debug.objectiveDistance(),
  awaiting: window.qingMao.debug.awaitingBeat(),
  context: document.getElementById('contextButton')?.textContent
}))));
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
console.log('open:', await page.locator('#refinery').isVisible());
const rows = await page.evaluate(() => [...document.querySelectorAll('.refineRow')].map((r) => ({
  gu: r.querySelector('strong')?.textContent,
  detail: r.querySelector('small')?.textContent,
  button: r.querySelector('button')?.textContent,
  enabled: !r.querySelector('button')?.hasAttribute('disabled')
})));
console.log('recipes:', rows.length);
for (const r of rows.slice(0, 4)) console.log(' -', r.gu, '|', r.detail, '|', r.button);
await page.screenshot({ path: 'bench.png' });
// Attempt one and see what it says.
const attempt = await page.evaluate(() => window.qingMao.debug.refine('dull-sight'));
console.log('attempt dull-sight:', JSON.stringify(attempt));
await browser.close(); stopServer();
