/**
 * Player agency between beats.
 *
 * The first build of this chained all 68 beats back to back, so `inScene` was true
 * from the title screen to chapter 200 and the player could never move. These tests
 * assert that control comes back, that moving actually moves, and that skip and
 * auto-advance do what they say.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, skipToControl } from './harness';

// Reaching a playable state means sitting through (or skipping) the opening scene,
// which is slower than the default per-test budget allows for.
test.setTimeout(90_000);

/** Control must not come back until the next beat's area is actually loaded. */
async function currentArea(page: Page): Promise<string> {
  return page.evaluate(() => window.qingMao.debug.currentArea());
}

/**
 * Holds a key until the player has actually walked `paces`, and returns where they
 * started and finished.
 *
 * Not "hold it for 400 milliseconds". Movement is `speed * dt` with `dt` clamped at
 * 50ms so a stall cannot teleport anyone, which means distance covered depends on how
 * many frames ran — and headless WebKit throttles requestAnimationFrame hard enough
 * that 350ms of wall clock bought exactly one frame, 0.35 paces, on every one of these
 * tests. What they are actually asserting is the *direction* of travel; waiting for
 * movement rather than for the clock measures that on any frame rate.
 */
async function walk(page: Page, key: string, paces = 1): Promise<{
  before: { x: number; z: number };
  after: { x: number; z: number };
}> {
  const before = await page.evaluate(() => window.qingMao.debug.playerPosition());
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      ([start, distance]) => {
        const now = window.qingMao.debug.playerPosition();
        return Math.hypot(now.x - start.x, now.z - start.z) >= distance;
      },
      [before, paces] as const,
      { timeout: 20_000 }
    );
  } finally {
    await page.keyboard.up(key);
  }
  const after = await page.evaluate(() => window.qingMao.debug.playerPosition());
  return { before, after };
}

test('control returns to the player after the opening scene', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  expect(await page.evaluate(() => window.qingMao.debug.isExploring())).toBe(true);
});

test('the player can walk around between beats', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);

  // No click first: the canvas sits under the HUD, so Playwright would wait forever
  // for it to be clickable. Key events go to the window regardless.
  const { before, after } = await walk(page, 'KeyW', 1.2);
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
  const camera = await page.evaluate(() => window.qingMao.debug.cameraPosition());
  const { before, after } = await walk(page, 'KeyW', 1);

  const distBefore = Math.hypot(before.x - camera.x, before.z - camera.z);
  const distAfter = Math.hypot(after.x - camera.x, after.z - camera.z);
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

test('the character faces the way he is walking', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);

  // Convention: actors face local +z, because setFacing uses atan2(dx, dz). The first
  // build put the face at -z, so he walked backward down every path.
  const geometry = await page.evaluate(() => window.qingMao.debug.facingProbe('fang-yuan'));
  expect(geometry.faceZ, 'the face is not on the front of the model').toBeGreaterThan(0);
  expect(geometry.backZ, 'the hair is not on the back of the model').toBeLessThan(0);

  const { before, after } = await walk(page, 'KeyW', 1);
  const facing = await page.evaluate(() => window.qingMao.debug.facingProbe('fang-yuan'));

  const travelled = { x: after.x - before.x, z: after.z - before.z };
  const length = Math.hypot(travelled.x, travelled.z);
  expect(length, 'the player did not move').toBeGreaterThan(0.5);
  // The model's forward vector must point along the direction of travel, not against it.
  const alignment = (travelled.x / length) * facing.forward.x + (travelled.z / length) * facing.forward.z;
  expect(alignment, `he is walking backward (alignment ${alignment.toFixed(2)})`).toBeGreaterThan(0.9);
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

test('every area can be walked from its spawn point to the objective', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  // The underground river spawned the player nose-first into a boulder: the marker was
  // twenty-four paces away with a rock in between, and pushing straight forward simply
  // stopped. It took a sweep that walks the way a player walks to notice.
  //
  // The guarantee is reachability, not a clear straight lane. A forest is not supposed
  // to have a clear lane; a beat you cannot reach is a game you cannot finish.
  const stranded = await page.evaluate(() =>
    window.qingMao.debug
      .areaIds()
      .map((id) => ({ id, ...window.qingMao.debug.spawnClearance(id) }))
      .filter((area) => !area.reachable)
      .map((area) => area.id)
  );
  expect(stranded).toEqual([]);
});

test('the quest panel shows the objective, not the beat sheet design note', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  const questText = (await page.locator('#questText').textContent())?.trim() ?? '';
  const beat = await page.evaluate(() => window.qingMao.debug.currentBeatFacts());
  expect(beat).not.toBeNull();
  // The design note is the Reader's Lens annotation. It was printed here for everyone,
  // so players read "Weak on purpose" and "Also the combat tutorial" as their objective.
  expect(questText).toBe(beat!.objective);
  expect(questText).not.toBe(beat!.designNote);
  expect(questText.length).toBeGreaterThan(10);
});

test('pushing right moves the player to the camera\'s right', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);

  // Measured against the camera's own world matrix, not against a cross product written
  // out by hand. The basis had `cross(up, forward)` where it needed `cross(forward, up)`
  // — exactly mirrored — and the unit test checked it with the same wrong expression, so
  // a stick that felt wrong in the hand passed a check at 24 camera angles.
  for (const [key, sign] of [['ArrowRight', 1], ['ArrowLeft', -1]] as const) {
    const basis = await page.evaluate(() => window.qingMao.debug.cameraBasis());
    const { before, after } = await walk(page, key, 1);

    const moved = { x: after.x - before.x, z: after.z - before.z };
    const distance = Math.hypot(moved.x, moved.z);
    expect(distance, `${key} did not move the player`).toBeGreaterThan(0.5);
    const along = (moved.x * basis.right.x + moved.z * basis.right.z) / distance;
    expect(along * sign, `${key} moved the player the wrong way across the screen`)
      .toBeGreaterThan(0.9);
  }
});

/**
 * Fights.
 *
 * The five multi-phase bosses existed as data for a long time with nothing that could
 * instantiate one, so every must-land fight in the game — the prologue included — was
 * a dialogue scene with an essence bar that did nothing. These check that a fight is a
 * fight: that it starts, that the phase rule gates damage rather than a health bar,
 * and that it ends and hands the scene back.
 */
async function reachPrologueFight(page: Page): Promise<void> {
  await openGame(page);
  // A wall-clock deadline, not a fixed number of turns round the loop.
  //
  // Sixty iterations each costing up to a 2.5-second click timeout is 160 seconds of
  // worst case inside a 90-second test, so on a loaded runner the test budget ran out
  // before the loop did and the failure read as a timeout with no line of its own.
  // That is exactly what happened to both prologue-fight tests at desktop width, on
  // Chromium and WebKit alike, while passing everywhere else.
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline) {
    if (await page.locator('#fightPanel').isVisible()) return;
    const choice = page.locator('#dialogueChoices button').first();
    if ((await choice.count()) && (await choice.isVisible())) {
      await choice.click();
    } else {
      // Short, because a miss here is the normal case — the line is still typing — and
      // a long wait per miss is what ate the budget.
      await page.locator('#dialogueContinue').click({ timeout: 600 }).catch(() => {});
    }
    await page.waitForTimeout(150);
  }
  throw new Error('never reached the prologue fight');
}

test('the prologue is a fight, with the Rank eight arsenal it is meant to be fought at', async ({ page }) => {
  // Reaching the fight is itself a minute of scene on a loaded runner; the assertions
  // come after that, so the budget has to cover both.
  test.setTimeout(150_000);
  await reachPrologueFight(page);
  await expect(page.locator('#foeName')).toHaveText('The eight at the doorway');
  await expect(page.locator('#foePhase')).toHaveText('PHASE 1 OF 2');
  // Full power, hopeless odds: the drop to Rank one in the next beat has to be a drop
  // from something, and that something is this action bar.
  const abilities = await page.locator('#actions button').allTextContents();
  expect(abilities.join(' ')).toContain('Ruined Blade');
});

test('a strike only lands when the phase says it does', async ({ page }) => {
  test.setTimeout(150_000);
  await reachPrologueFight(page);

  // Asked of the rule directly rather than through the keyboard. A key is queued and
  // consumed on the next frame, so a press made just before the window opens lands
  // inside it — which is the right way for the game to feel, and makes a test that
  // presses and then reads the bar a test of the race rather than of the rule.
  const attempt = () =>
    page.evaluate(() => {
      const view = window.qingMao.debug.fightView()!;
      return { open: view.openNow, result: window.qingMao.debug.tryStrike('ruined-blade')! };
    });

  let intoGuard: Awaited<ReturnType<typeof attempt>> | null = null;
  let intoWindow: Awaited<ReturnType<typeof attempt>> | null = null;
  for (let i = 0; i < 120 && (!intoGuard || !intoWindow); i++) {
    const tried = await attempt();
    // Recovery can refuse a swing outright; that is a different rejection.
    if (!tried.result.reason.startsWith('Not ready')) {
      if (tried.open) intoWindow ??= tried;
      else intoGuard ??= tried;
    }
    await page.waitForTimeout(120);
  }

  expect(intoGuard, 'never caught the phase with its guard up').not.toBeNull();
  expect(intoGuard!.result.landed, 'a strike into the guard landed').toBe(false);
  expect(intoGuard!.result.reason, 'a refused strike must say why').toContain('gap');
  expect(intoWindow, 'never caught the open window').not.toBeNull();
  expect(intoWindow!.result.landed, 'a strike in the open window did not land').toBe(true);
  expect(intoWindow!.result.damage).toBeGreaterThan(0);
});

test('a fight ends and gives the scene back', async ({ page }) => {
  // A fight takes as long as it takes. The open windows the player strikes in are
  // produced by the frame loop, so under five projects in parallel there are fewer of
  // them per second — and a fixed count of two hundred iterations was the same mistake
  // as timing a walk by the clock instead of by the distance walked.
  test.setTimeout(180_000);
  await reachPrologueFight(page);

  // Strike whenever the window is open. Ability recovery is what stops this being a
  // click-race, so this is also a check that a fight is winnable at a human rate.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (!(await page.locator('#fightPanel').isVisible())) break;
    if (await page.evaluate(() => !document.getElementById('foeOpen')!.hidden)) {
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(100);
  }
  await expect(page.locator('#fightPanel')).toBeHidden();
  // The prologue's fight is the last thing in its scene, so what the fight hands back
  // is the world: control returns and the next beat is offered.
  await page.waitForFunction(() => window.qingMao.debug.isExploring(), null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.qingMao.debug.awaitingBeat())).not.toBeNull();
});

test('the village has people in it who answer when spoken to', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  // Every villager was an instanced cone: you could walk the length of the mountain
  // past forty people and not one of them would acknowledge that you existed.
  await page.evaluate(() => window.qingMao.debug.visitArea('mountain.village'));
  await page.waitForTimeout(500);

  const here = await page.evaluate(() => window.qingMao.debug.folkHere());
  expect(here.length, 'nobody is standing in the village').toBeGreaterThan(1);
  // Named people from the canon bible, not extras, and each with something to say.
  for (const person of here) {
    expect(person.name, 'a person is showing a raw id instead of a name').not.toContain('-');
    expect(person.next, `${person.id} has nothing to say`).toBeTruthy();
  }

  const walked = await page.evaluate(() => window.qingMao.debug.walkToFolk());
  expect(walked, 'could not walk to anybody').toBeTruthy();
  await page.waitForTimeout(250);

  // The context button names who is in reach, so you know who you are about to talk to.
  await expect(page.locator('#contextButton')).toHaveText(/^Speak to /);

  const expected = await page.evaluate(() => window.qingMao.debug.speakToNearest());
  expect(expected).toBeTruthy();
  const panel = page.locator('#dialoguePanel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#dialogueSpeaker')).not.toBeEmpty();
  await expect(panel).toContainText(expected!.slice(0, 24));

  // Talking is not a scene: the stick still works and there is no skip button.
  expect(await page.evaluate(() => window.qingMao.debug.isExploring())).toBe(true);
  await expect(page.locator('#skipScene')).toBeHidden();

  // And pressing again moves on rather than repeating the same line. Dismiss the first
  // one properly — talking to somebody is one line at a time, so a second attempt while
  // the first is still on screen is correctly refused.
  await page.locator('#dialogueContinue').click();
  await expect(panel).toBeHidden();
  const second = await page.evaluate(() => window.qingMao.debug.speakToNearest());
  expect(second, 'the second attempt said nothing at all').toBeTruthy();
  expect(second, 'a second press repeated the first line').not.toBe(expected);
});

test('there is something to gather, and gathering it puts it in the bag', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);

  // Gathering is the half of upkeep the player was never part of: the Moonlight Gu
  // eats moon orchid petals every six days, the bill was paid silently out of stones,
  // and walking through a field of orchids did nothing.
  const areas = await page.evaluate(() => window.qingMao.debug.forageSummary());
  expect(areas.length, 'nowhere in the game has anything to gather').toBeGreaterThan(2);
  // Not a field of free money either: a hundred and twenty-six nodes in one area is
  // not scarcity, and the whole economy leans on scarcity.
  for (const area of areas) expect(area.nodes, `${area.area} has ${area.nodes} nodes`).toBeLessThanOrEqual(12);

  await page.evaluate(() => window.qingMao.debug.visitArea('mountain.awakening-river'));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.qingMao.debug.forageState().ready)).toBeGreaterThan(0);

  expect(await page.evaluate(() => window.qingMao.debug.walkToGather())).toBe(true);
  await page.waitForTimeout(300);
  await expect(page.locator('#contextButton')).toHaveText(/Gather/);

  const before = await page.evaluate(() => window.qingMao.debug.forageState());
  await page.keyboard.press('KeyE');
  await page.waitForFunction(
    (was) => window.qingMao.debug.forageState().ready < was,
    before.ready,
    { timeout: 5000 }
  );
  const after = await page.evaluate(() => window.qingMao.debug.forageState());
  expect(after.carrying['moon-orchid-petal'], 'nothing went into the bag').toBeGreaterThan(0);
});

test('a mortal Gu Master carries only what canon allows', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  const state = await page.evaluate(() => window.qingMao.debug.guLoadout());
  // "Mortal Gu Masters ranked one to five would usually only raise at most five to six
  // mortal Gu at the same time." Accumulating without limit made upkeep a bill rather
  // than a decision, and the loadout no decision at all.
  //
  // Asserted as the rule rather than as a number: control comes back before chapter 3
  // has taken the prologue's Rank eight away from him, so a flat "expect five or six"
  // was checking the wrong character.
  const mortal = state.rank >= 1 && state.rank <= 5;
  if (mortal) {
    expect(state.capacity, `rank ${state.rank} should carry five or six`).toBeGreaterThanOrEqual(5);
    expect(state.capacity, `rank ${state.rank} should carry five or six`).toBeLessThanOrEqual(6);
  } else {
    // He has not woken up yet, and a Rank eight is not a mortal Gu Master.
    expect(state.capacity).toBeGreaterThan(6);
  }
  expect(state.carried.length).toBeLessThanOrEqual(state.capacity);

  // Past the limit a Gu goes into reserve rather than being refused: refusing it could
  // lose a canonical Gu the story needs later, and nothing may strand a save.
  // Overfilled relative to whatever the capacity is, so this holds at any rank.
  const overfilled = await page.evaluate(() => {
    const debug = window.qingMao.debug;
    const room = debug.guLoadout().capacity + 4;
    const canon = [
      'hope-gu', 'moonlight-gu', 'liquor-worm', 'little-light-gu', 'white-boar-gu',
      'jade-skin-gu', 'white-jade-gu', 'moonglow-gu', 'four-flavours-liquor-worm',
      'stealth-scales-gu', 'earth-ear-grass', 'nine-leaf-vitality-grass',
      'water-shield-gu', 'sky-canopy-gu', 'thunderwings-gu', 'blood-moon-gu',
      'chainsaw-golden-centipede', 'tusita-flower'
    ];
    for (const id of canon.slice(0, room)) debug.giveGu(id);
    return debug.guLoadout();
  });
  expect(overfilled.carried.length).toBe(overfilled.capacity);
  expect(overfilled.stored.length, 'the surplus was destroyed rather than stored').toBeGreaterThan(0);
  // And the Cicada is never put away: it is the reason there is a story.
  expect(overfilled.carried).toContain('spring-autumn-cicada');
});

test('a player can refine, which until now only scripts could do', async ({ page }) => {
  await openGame(page);
  await skipToControl(page);
  // The refinement system was complete and had no caller anywhere outside the scene
  // runner, so gathered materials led nowhere and the one piece of item progression in
  // the game was unreachable. A forge has a bench in it now.
  await page.evaluate(() => window.qingMao.debug.visitArea('mountain.forge'));
  await page.waitForTimeout(400);
  await expect(page.locator('#contextButton')).toHaveText(/Refine/);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#refinery')).toBeVisible();

  const rows = await page.locator('.refineRow').count();
  expect(rows, 'the bench is empty').toBeGreaterThan(3);
  // Canonical recipes have to say they cannot be lost. A player who has just watched
  // Moonglow fail at chapter 119 needs to know that is the chapter, not their save.
  // Matched on 'Moonglow' once, which also hit the Blood Moon row because that one is
  // refined *from* Moonglow Gu. The row's heading is what names the recipe.
  const detail = await page
    .locator('.refineRow')
    .filter({ has: page.locator('strong', { hasText: /^Moonglow Gu$/ }) })
    .locator('small')
    .textContent();
  expect(detail).toContain('Cannot be lost');

  // And it actually does something: days and stones move.
  const before = await page.evaluate(() => ({
    day: window.qingMao.save.calendar.day,
    stones: window.qingMao.save.economy.stones
  }));
  const outcome = await page.evaluate(() => window.qingMao.debug.refine('ledger-moth'));
  expect(['success', 'failure', 'delay', 'blocked']).toContain(outcome.kind);
  if (outcome.kind !== 'blocked') {
    const after = await page.evaluate(() => ({
      day: window.qingMao.save.calendar.day,
      stones: window.qingMao.save.economy.stones
    }));
    expect(after.day, 'a refinement costs days').toBeGreaterThan(before.day);
    expect(after.stones, 'a refinement costs stones').toBeLessThan(before.stones);
  }
});
