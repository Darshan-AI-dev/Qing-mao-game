/**
 * Play sweep: actually play the game and photograph it as it goes.
 *
 * The area sweep walks into every place and photographs it, which finds dark rooms and
 * duplicate layouts. It never plays a scene, so it cannot see the bugs that live in the
 * presentation layer — a fade left up over the world (which is what the black screen
 * after the chapter 2 choice was), a letterbox that never lifts, a choice list running
 * off the bottom of a phone, the Reader's Lens sitting on top of the dialogue.
 *
 * So this one presses Continue the way a player does, from the title screen through the
 * opening chapters, and after every step it photographs the frame and records what is
 * on screen. At the end it fails if any scene finished with an overlay still up.
 *
 *   node tools/play-sweep.mjs [--out dir] [--steps 120] [--phone] [--no-server]
 */
import { chromium } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { startServer, stopServer } from './sweep-server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const phone = args.includes('--phone');
const out = flag('out', phone ? 'sweep-play-phone' : 'sweep-play');
const steps = Number(flag('steps', 1600));
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

/** Everything a screenshot cannot tell you, read straight out of the DOM. */
const inspect = () =>
  page.evaluate(() => {
    const shown = (id) => {
      const el = document.getElementById(id);
      return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
    };
    const fade = document.getElementById('fade');
    const letterbox = document.getElementById('letterbox');
    const text = document.getElementById('dialogueText');
    const choices = [...document.querySelectorAll('#dialogueChoices button')];
    const rect = (el) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) } : null;
    };
    return {
      chapter: document.getElementById('chapterLabel')?.textContent?.trim() ?? '',
      speaker: document.getElementById('dialogueSpeaker')?.textContent?.trim() ?? '',
      line: (text?.textContent ?? '').trim().slice(0, 80),
      dialogue: shown('dialoguePanel'),
      choices: choices.map((b) => b.textContent?.trim().slice(0, 40) ?? ''),
      choiceBottom: choices.length ? rect(choices[choices.length - 1]).bottom : null,
      lens: shown('lensPanel'),
      recollection: shown('recollectionPanel'),
      // A fade that is still opaque after a scene ends is a black screen, which is
      // exactly how chapter 2 used to end.
      fadeOpacity: fade ? Number(getComputedStyle(fade).opacity) : 0,
      // The letterbox element is always present and always opaque; what moves is the
      // height of its two bars. Reading its opacity reported a letterbox down over
      // every frame in the game, which is a check that can only cry wolf.
      letterbox: letterbox
        ? Math.max(...[...letterbox.children].map((bar) => bar.getBoundingClientRect().height))
        : 0,
      // Boxes for the overlap checks below. A panel at opacity 0 still has a box, and
      // that is deliberate: standing the HUD down must not hide it from measurement.
      boxes: Object.fromEntries(
        [
          ['quest', document.getElementById('quest')],
          ['vitals', document.querySelector('.vitals')],
          ['dialogue', document.getElementById('dialoguePanel')],
          ['nav', document.querySelector('header nav')]
        ].map(([name, el]) => {
          // Effective visibility, ancestors included. Reading the element's own
          // opacity said the vitals panel was on screen through every cutscene in the
          // game: the panel's opacity is 1, and the 0 that hides it sits on the
          // `footer` above it. Twenty-six frames of "this panel is under a letterbox
          // bar" about a panel that was not being drawn at all.
          const visible = el && !el.hidden && (
            typeof el.checkVisibility === 'function'
              ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })
              : getComputedStyle(el).opacity !== '0'
          );
          const r = visible ? el.getBoundingClientRect() : null;
          return [name, r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null];
        })
      ),
      fight: window.qingMao?.debug?.fightView?.() ?? null,
      exploring: !!window.qingMao?.debug?.isExploring?.(),
      area: window.qingMao?.debug?.currentArea?.() ?? '',
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  });

/** The same reading, once both overlay transitions have had time to finish. */
async function settle() {
  let state = await inspect();
  for (let attempt = 0; attempt < 8 && (state.fadeOpacity > 0.05 || state.letterbox > 1); attempt++) {
    await page.waitForTimeout(150);
    state = await inspect();
  }
  return state;
}

await page.goto(url, { waitUntil: 'load' });
await page.screenshot({ path: `${out}/000-title.png` });
await page.locator('#begin').click();
await page.waitForFunction(() => !!window.qingMao, null, { timeout: 30_000 });

const frames = [];
const problems = [];
let shot = 0;
let lastLine = '';
let stuck = 0;
/** Reasons a strike was refused, so the sweep can report what a player would learn. */
const fightMisses = new Set();
const fightsSeen = new Set();

for (let step = 0; step < steps; step++) {
  await page.waitForTimeout(220);
  const state = await inspect();

  // Only photograph when something changed: a hundred pictures of the same line is not
  // a sweep, it is a flipbook of one frame.
  const key = `${state.chapter}|${state.speaker}|${state.line}|${state.choices.join('/')}|${state.area}|${state.exploring}`;
  if (key !== lastLine) {
    lastLine = key;
    const name = `${String(++shot).padStart(3, '0')}-${state.exploring ? 'explore' : 'scene'}`;
    await page.screenshot({ path: `${out}/${name}.png` });
    frames.push({ shot: name, step, ...state });

    if (state.fight) fightsSeen.add(state.fight.name);
    if (state.choices.length && state.choiceBottom > state.viewport.h) {
      problems.push(`${name}: the last choice is ${state.choiceBottom - state.viewport.h}px below the screen`);
    }
    if (state.lens && state.dialogue) {
      problems.push(`${name}: the Reader's Lens is open on top of the dialogue`);
    }
    // A scene that shows an illustration grows the dialogue panel up into the quest
    // strip. Whatever is on screen at once has to fit on screen at once.
    const hit = (a, b) =>
      a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    if (hit(state.boxes.dialogue, state.boxes.quest)) {
      problems.push(`${name}: the dialogue panel overlaps the quest strip`);
    }
    // The letterbox bars are drawn over everything; anything under one is half a panel.
    if (state.boxes.vitals && state.letterbox > 1
        && state.boxes.vitals.bottom > state.viewport.h - state.letterbox) {
      problems.push(`${name}: the vitals panel runs under the bottom letterbox bar`);
    }
    if (state.boxes.dialogue && state.letterbox > 1
        && state.boxes.dialogue.bottom > state.viewport.h - state.letterbox + 1) {
      problems.push(`${name}: the dialogue panel runs under the bottom letterbox bar`);
    }
    if (state.boxes.nav && state.letterbox > 1 && state.boxes.nav.top < state.letterbox - 1) {
      problems.push(`${name}: the nav runs under the top letterbox bar`);
    }
    // Half the screen is the most the text may take: a scene the player cannot see is
    // not a scene. The aperture awakening played entirely behind the panel on a phone.
    if (state.boxes.dialogue) {
      const share = (state.boxes.dialogue.bottom - state.boxes.dialogue.top) / state.viewport.h;
      if (share > 0.55) {
        problems.push(`${name}: the dialogue panel covers ${Math.round(share * 100)}% of the screen`);
      }
    }
    // Between scenes nothing may be left covering the world. Both overlays animate
    // out over about half a second, so let them settle before judging: a fade caught
    // at 0.7 on its way to 0 is a transition, not a black screen.
    const settled = state.exploring ? await settle() : state;
    if (state.exploring && settled.fadeOpacity > 0.05) {
      problems.push(`${name}: exploring with the fade still at ${settled.fadeOpacity}`);
    }
    if (state.exploring && settled.letterbox > 1) {
      problems.push(`${name}: exploring with the letterbox bars still ${Math.round(settled.letterbox)}px deep`);
    }
  }

  // Fight when there is a fight. Without this the sweep wedges at the prologue, which
  // is now an encounter rather than a scene — and a sweep that cannot get past chapter
  // two tells you nothing about chapter two hundred.
  if (state.fight) {
    const struck = await page.evaluate(() => {
      const view = window.qingMao.debug.fightView();
      if (!view) return null;
      // Take the strongest thing that is affordable and let the rule decide.
      for (const id of ['blood-moon', 'moonglow', 'ruined-blade', 'centipede', 'moonblade', 'strike']) {
        const result = window.qingMao.debug.tryStrike(id);
        if (result && (result.landed || !result.reason.startsWith('Not ready'))) return result;
      }
      return null;
    });
    if (struck && !struck.landed) fightMisses.add(struck.reason);
    continue;
  }

  if (state.choices.length) {
    await page.locator('#dialogueChoices button').first().click();
    continue;
  }
  if (state.dialogue) {
    await page.locator('#dialogueContinue').click({ timeout: 5000 }).catch(() => {});
    continue;
  }
  if (state.exploring) {
    // Walk at the marker so the next beat actually starts, instead of idling in an
    // empty area for the rest of the sweep.
    const reached = await page.evaluate(() => {
      const debug = window.qingMao?.debug;
      if (!debug?.walkToObjective) return false;
      return debug.walkToObjective();
    });
    if (!reached) {
      // One refusal is usually the beat still opening; several in a row means the walk
      // genuinely cannot arrive, and that is worth reporting rather than exiting quietly.
      if (++stuck < 6) continue;
      problems.push(`stopped at ${state.area}: could not walk to the objective (${state.chapter})`);
      break;
    }
    stuck = 0;
  }
}

await browser.close();
stopServer();

for (const frame of frames) {
  console.log(
    frame.shot.padEnd(14),
    (frame.chapter || frame.area).padEnd(26),
    frame.choices.length ? `choice: ${frame.choices.join(' / ')}` : frame.line
  );
}

await writeFile(`${out}/report.json`, JSON.stringify({ width, height, phone, frames, problems, consoleErrors }, null, 2));
console.log(`\n${frames.length} frames photographed into ${out}`);
if (fightsSeen.size) console.log(`fights played: ${[...fightsSeen].join(', ')}`);
if (fightMisses.size) console.log(`strikes refused, with reasons: ${[...fightMisses].join(' | ')}`);
if (consoleErrors.length) problems.push(`console: ${[...new Set(consoleErrors)].slice(0, 5).join(' | ')}`);
if (problems.length) {
  console.log('\nPROBLEMS');
  for (const problem of problems) console.log(' -', problem);
  process.exitCode = 1;
} else {
  console.log('no presentation problems found');
}
