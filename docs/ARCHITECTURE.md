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
