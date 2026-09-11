# Architecture

## The split

```
/canon               shared canon bible — characters, Gu, clans, ranks, places, timeline, glossary
/engine              renderer, player, combat, scenes, UI, saves, input, event bus
/content/qingmao     this game: beats, scenes, ledger, world, strings, art
/vendor/three        vendored three.js (MIT), refreshed by `npm run vendor:three`
/tools               content lint, authoring scripts, art optimisation, offline build
/tests               logic tests (node) and the browser matrix (Playwright)
```

The dependency direction is one-way and is what makes a sequel cheap:

```
content/qingmao ──▶ engine ──▶ canon
        └──────────────────────▶ canon
```

`/engine` never imports from `/content`. Game 2 adds `/content/southern-border`,
extends `/canon`, and changes one import in `engine/main.ts`.

## Stable beat IDs

The previous build tested `step >= N` in 178 places, so inserting a single arc
renumbered everything after it and invalidated every save. Here each beat has a
stable ID and declares what it needs and what it publishes:

```json
{
  "id": "act1.jia-jin-sheng.night",
  "chapters": [44, 49],
  "coverage": "played",
  "requires": ["act1.caravan.fossil"],
  "sets": ["secret.jjs"],
  "evidence": ["jjs.trail", "jjs.witness"],
  "template": "stealth-confrontation",
  "area": "mountain.bamboo-path",
  "script": "act1/044-jia-jin-sheng-night.json",
  "art": "reader-cicada",
  "sfx": null
}
```

Inserting a beat between two others changes nothing else. `legacyStep` exists only so
a pre-v5 save can be mapped onto the graph once, at migration time: legacy step *N*
means every beat with `legacyStep <= N` is complete, with prerequisites closed over.

## The event bus

Every system publishes through `engine/core/bus.ts` and nothing reaches into another
system for a notification. This is the seam a sound pack uses later: it subscribes
once with `bus.onAny()` and reads the `sfx` and `music` fields that scene data already
carries. No gameplay code has to change to add audio.

## The timeline runner

Scenes are data, not code. `engine/scene/timeline.ts` executes a list of commands —
`move`, `face`, `gesture`, `camera`, `cut`, `line`, `choice`, `wait`, `fade`,
`letterbox`, `weather`, `timeOfDay`, `flag`, `evidence`, `title`, `art` — against
actors already standing in the world. Every scene is skippable and replayable from the
Journal.

Dialogue lines carry a `kind`. `thought` renders in its own italic channel and can sit
on top of a spoken line, which is how the gap between what he says and what he thinks
becomes visible. All inner-voice writing is original.

## Rendering

three.js on WebGL2, vendored locally so the build carries no CDN reference and the
offline ZIP still works from `file://`.

- **Chunked worlds with frustum culling.** Areas are split into ~48-unit chunks and
  tested per frame. The previous build drew everything, every frame.
- **Instancing** for bamboo, rocks, villagers, pillars and lanterns.
- **Quality tiers** with the budgets in `engine/render/quality.ts`, picked by a short
  benchmark on first launch and always overridable by hand.
- **Adaptive render scale** inside the tier's range before a tier is dropped, so a
  recent phone is not demoted on one bad second.

## Saves

`engine/save/` — v5 schema keyed entirely by stable IDs, stored in IndexedDB with
localStorage as a fallback, `navigator.storage.persist()` requested on boot, three
manual slots plus an autosave, and migration from the previous build's v1–v4 formats
that keeps the original file verbatim.

## The sequel bridge

`engine/save/legacy.ts`. At chapter 200 the game exports a Legacy JSON file and also
writes it to site storage. The `canon` block is identical for every player, and
`validateLegacy()` overwrites whatever a hand-edited file claims — a first-game choice
can never change what the sequel treats as canon. The `player` block only changes
texture. `defaultLegacy()` is what game 2 uses when there is no file at all.

## Looking at the game

Data-level tests said the world was fine while it was rendering a black room, an
objective marker the size of the floor, and a character walking backwards. None of
those are visible in an assertion; all of them are obvious in a screenshot.

```bash
npm run sweep            # every area, desktop framing
npm run sweep:phone      # every area, 430 x 932 — a different set of bugs
npm run sweep:play       # play the opening chapters and photograph every step
npm run sweep:play:phone # the same, at 430 x 932
```

`tools/visual-sweep.mjs` walks into all 36 areas and photographs each twice — once at
the play camera distance and once from far enough back to judge the layout — then
`tools/contact-sheet.py` builds two contact sheets and prints a luminance table. The
sweep runs and stops its own preview server, so it never leaves one behind for the
Playwright suite to collide with.

What the numbers are for:

- **Luminance under ~12** means the area is not navigable. This is how the unlit caves
  were found: they were black voids because the carried light had never been built.
- **A high mean with a low spread** means a bright frame with nothing in it. Brightness
  on its own says nothing — a snowfield is meant to be bright, and a flat ceiling of 155
  flagged the snow areas while their drifts, tents and fires were perfectly legible. The
  spread is what separates snow from paper.
- **Identical draw-call and triangle counts across many areas** mean they are the same
  generated layout wearing different names. Twenty-four of the thirty-six areas were
  once exactly that, including a glacier that was a green forest; a second sweep, run
  to check the first one's fixes, found eight more still sharing three layouts.

Run it after any change to lighting, world building or the area archetypes, and look
at the sheets. It takes about two minutes.

`tools/play-sweep.mjs` covers what the area sweep structurally cannot. It starts at the
title screen and plays: it presses Continue, takes the first option at every choice, and
walks to the objective marker between scenes, photographing the frame each time anything
on screen changes. Presentation bugs only exist while a scene is running, so this is the
sweep that can see them, and it fails the run rather than only reporting:

- a fade still opaque once control is back — the black screen after the chapter 2 choice
  was exactly this, and it survived a regression test that skipped the scene instead of
  playing it, because skipping never runs the `fade` command;
- a letterbox still down while exploring;
- a choice button below the bottom of the screen, which is a phone-shaped bug;
- the Reader's Lens open on top of the dialogue it is meant to annotate.

CI runs one job per browser engine, in parallel, with two Playwright workers each.
Before that it was all three engines in one job at Playwright's CI default of a single
worker: 540 software-rendered WebGL tests, one at a time, for about three hours. Three
hours is not feedback — it is why two WebKit camera failures sat in the branch across
several pushes without anyone reading the result. `fail-fast` is off, so a WebKit break
still reports what Firefox and Chromium did.

Note that the workflow sets `cancel-in-progress`, so pushing cancels the run you are
waiting on. That is the right default; just do not push while you need the answer.

`walkToObjective()` on the debug surface really walks, in the same steps and through the
same blockers as the player. An objective walled off behind its own scenery therefore
shows up as a walk that does not arrive, rather than as a beat that silently never fires.
