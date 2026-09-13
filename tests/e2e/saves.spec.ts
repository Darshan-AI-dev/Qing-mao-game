/**
 * Saves, migration and the sequel bridge.
 *
 * Storage is the risk the support plan calls out: Safari clears script-writable
 * storage after seven days without a visit, which would silently destroy a long
 * save. These tests check that saves land in IndexedDB, that a pre-v5 save from the
 * previous build still loads, and that the Legacy file is well formed.
 */
import { expect, test } from '@playwright/test';
import { openGame, openTitle, pressBegin, waitForGame } from './harness';

test('progress is written to IndexedDB, not only localStorage', async ({ page }) => {
  await openGame(page);
  await page.waitForTimeout(3000);

  const stored = await page.evaluate(async () => {
    const open = indexedDB.open('qing-mao', 1);
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    if (!db.objectStoreNames.contains('saves')) return null;
    const request = db.transaction('saves', 'readonly').objectStore('saves').get('auto');
    return new Promise<string | null>((resolve) => {
      request.onsuccess = () => resolve((request.result as string) ?? null);
      request.onerror = () => resolve(null);
    });
  });

  expect(stored, 'an autosave should exist in IndexedDB').toBeTruthy();
  const save = JSON.parse(stored!);
  expect(save.version).toBe(5);
  expect(Array.isArray(save.completed)).toBe(true);
});

test('a pre-v5 save from the previous build still loads', async ({ page }) => {
  await openTitle(page);
  // The shape the old build wrote: a single step counter plus a few loose fields.
  await page.evaluate(() => {
    localStorage.setItem('qingmao.save', JSON.stringify({
      version: 4, step: 30, x: 12, z: -4, realm: 'mountain', stones: 91, essence: 44,
      health: 100, strength: 3, visited: [], clues: [], soil: [], defeated: {},
      heritage: { seen: [], lore: ['rain', 'hope'] },
      arc3: { briefed: [], choices: [], leaves: 6, leafCycles: 0, moonAttempts: 0, moonRest: false, tide: 0, echoes: [], routes: [], route: '', vigil: 0, ending: false },
      finale: { briefed: [], collected: [], crystal: 0, iceAttempts: 0, timer: 0, rewound: false, ending: false },
      options: { difficulty: 'hard', approach: 'patient' }
    }));
  });
  await page.reload();
  await expect(page.locator('#migrationNote')).toBeVisible();
  await expect(page.locator('#migrationNote')).toContainText('Save migrated from version 4');

  await pressBegin(page);
  const carried = await page.evaluate(() => {
    const game = window.qingMao;
    return {
      completed: game.save.completed.length,
      stones: game.save.economy.stones,
      difficulty: game.save.settings.difficulty,
      codex: game.save.reader.codex.length
    };
  });
  expect(carried.completed).toBeGreaterThan(10);
  expect(carried.stones).toBe(91);
  expect(carried.difficulty).toBe('hard');
  expect(carried.codex).toBe(2);
});

test('the Legacy file is fixed canon plus player texture', async ({ page }) => {
  await openGame(page);

  const legacy = await page.evaluate(() => window.qingMao.legacy.build());

  expect(legacy.legacyVersion).toBe(1);
  expect(legacy.game).toBe('qingmao');
  expect(legacy.completedAt).toBe('ch200');
  // Canon is identical for every player, however the first game was played.
  expect(legacy.canon.rank).toBe('rank1.initial');
  expect(legacy.canon.companions).toEqual(['bai-ning-bing']);
  expect(legacy.canon.gu).toContain('yang-gu');
  expect(legacy.canon.threads).toContain('no-healing-gu');
  expect(legacy.canon.threads).toContain('southern-border');
  expect(legacy.player).toHaveProperty('foresightRecognitions');
  expect(legacy.player).toHaveProperty('exposure');
});

test('an archived narrative set restores the prose exactly', async ({ page }) => {
  // The point of archiving the text is that a rewrite is reversible. If switching back
  // returns something merely similar, the archive is worthless — so this compares a
  // scene line and a ledger chapter before and after a round trip through the set.
  await openGame(page);
  const sets = await page.evaluate(() => window.qingMao.debug.narrative());
  expect(sets.sets, 'no narrative sets are registered').toContain('house');
  expect(sets.active, 'a fresh save should start on the live content files').toBeNull();

  const before = await page.evaluate(() => ({
    ledger7: window.qingMao.debug.ledgerText(7),
    ledger200: window.qingMao.debug.ledgerText(200)
  }));
  expect(before.ledger7).toBeTruthy();
  expect(before.ledger200).toBeTruthy();

  const applied = await page.evaluate(() => window.qingMao.debug.setNarrative('house'));
  expect(applied, 'the archived set did not load').toBe(true);
  const during = await page.evaluate(() => ({
    active: window.qingMao.debug.narrative().active,
    ledger7: window.qingMao.debug.ledgerText(7),
    ledger200: window.qingMao.debug.ledgerText(200)
  }));
  expect(during.active).toBe('house');
  expect(during.ledger7, 'the archive changed chapter 7').toBe(before.ledger7);
  expect(during.ledger200, 'the archive changed chapter 200').toBe(before.ledger200);

  // And back off it again, which is the direction that matters after a bad rewrite.
  await page.evaluate(() => window.qingMao.debug.setNarrative(null));
  const after = await page.evaluate(() => ({
    active: window.qingMao.debug.narrative().active,
    ledger7: window.qingMao.debug.ledgerText(7)
  }));
  expect(after.active).toBeNull();
  expect(after.ledger7).toBe(before.ledger7);
});

test('a default Legacy exists so the sequel runs standalone', async ({ page }) => {
  await openTitle(page);
  await waitForGame(page);
  const fallback = await page.evaluate(() => ({
    fromNothing: window.qingMao.legacy.fallback(),
    rejected: window.qingMao.legacy.validate({ legacyVersion: 99 })
  }));
  expect(fallback.fromNothing.canon.rank).toBe('rank1.initial');
  expect(fallback.fromNothing.player.foresightRecognitions).toBe(0);
  expect(fallback.rejected).toBeNull();
});

test('a hand-edited Legacy cannot change canon', async ({ page }) => {
  await openTitle(page);
  await waitForGame(page);
  const validated = await page.evaluate(() =>
    window.qingMao.legacy.validate({
      legacyVersion: 1, game: 'qingmao', completedAt: 'ch200',
      canon: { rank: 'rank5.peak', aptitude: 'A', gu: ['everything'], companions: [], threads: [] },
      player: { methods: {}, exposure: {}, foresightRecognitions: 3, codex: [], reader: { lens: true, veteran: false }, settings: { intensity: 'faithful', difficulty: 'standard' }, playtimeHours: 1, newGamePlus: 0 }
    }));
  expect(validated?.canon.rank).toBe('rank1.initial');
  expect(validated?.player.foresightRecognitions).toBe(3);
});
