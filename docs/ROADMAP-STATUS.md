# Roadmap status

Honest accounting against the design review, section by section. **Done** means it is
implemented and checked. **Scaffolded** means it is real and playable but waiting for an
authoring or art pass. **Deferred** means it is deliberately not in this version.

## Phase 0 · Pre-production — done

| Item | Status | Where |
| --- | --- | --- |
| Canon bible | Done | `canon/` — 31 characters with chapter-referenced appearance notes, 29 canonical Gu plus 4 optional, 9 clans, 36 areas, ranks and aptitudes, a chapter-keyed timeline, a 15-term glossary |
| 200-chapter beat sheet with coverage levels | Done | `content/qingmao/acts/*/beats.json` — 68 beats, 200/200 chapters |
| Art style guide | Done | `docs/ART-STYLE-GUIDE.md` |
| Engine decision | Done | three.js on WebGL2, vendored under `vendor/three` |
| Public-release cleanup and the bug table | Done | `docs/BUGS-FIXED.md` — all 12 rows |

Chapter coverage: **163 played, 31 staged, 6 ledger**. All fifteen must-land moments
have a beat and are tagged.

## Phase 1 · Foundation — done

| Item | Status | Where |
| --- | --- | --- |
| Engine and content split | Done | `/engine`, `/content/qingmao`, `/canon`; the dependency direction is one-way |
| Stable IDs with migration | Done | `engine/core/beats.ts`; v1–v4 saves migrate and the original is kept |
| TypeScript and a static build | Done | strict TS, Vite, act-pack code splitting, PWA plus an offline ZIP |
| Event bus | Done | `engine/core/bus.ts`, ~45 typed events, `onAny()` for a sound pack |
| Timeline runner | Done | `engine/scene/timeline.ts`, 17 commands, skippable and replayable |
| Quality tiers | Done | `engine/render/quality.ts`, benchmark on first launch, manual override, adaptive render scale |
| IndexedDB saves | Done | `engine/save/store.ts` with a localStorage fallback, `persist()`, three slots plus autosave |
| New touch, gamepad and HUD | Done | `engine/input/input.ts`, `engine/ui/hud.ts`; contextual HUD, radial Gu wheel, full remapping |
| Playwright matrix | Done | 3 engines × 5 viewports, plus the performance budget in the same pass |
| Looking at the game | Done | `npm run sweep` photographs all 36 areas twice and prints mean and spread; `npm run sweep:play` plays the opening chapters and fails on a fade, letterbox or panel left over a scene. See `docs/ARCHITECTURE.md` |

## Play, not just presentation

The design review's §5 asked for canon-safe systems and got them as *state*: an economy,
upkeep, exposure, refinement, cultivation, a calendar and a combat module. What it did
not get was the player's hands on any of them. Three gaps, now closed.

| Gap | What it is now |
| --- | --- |
| **`BOSSES` was never instantiated.** Five multi-phase bosses with telegraphs and a per-phase answer sat in data; `Combat.bossFor()` had no callers, the HUD's telegraph renderer had no caller, and an ability press spent essence into the void. Every must-land fight, the prologue included, was a dialogue scene | Fights run. A phase is a rule, not a health bar: strike in the gap after its guard drops, get inside the reach it cannot raise that layer at, stand on the ground it retreats to, let the screen pass over you, do not repeat an opening it has answered. The rule is earned — recall the memory and Fang Yuan tells you, or work it out and keep it |
| **Gu accumulated without limit**, so upkeep was a bill rather than a decision | The source caps a mortal Gu Master at five or six. Past that a Gu arrives in reserve: no upkeep, no place on the action bar, and a journal tab to swap. Nothing is destroyed and every swap is reversible, so a loadout cannot strand a save |
| **Nothing could be gathered.** The canon item list says of the moon orchid petals, "gathered near the awakening river, or bought" — only the buying half existed, and walking through a field of orchids did nothing | Scenery is the resource. Nodes come from the props an area already places, capped at a dozen and limited to three things worth having: the petals a Gu eats, the leaves that are the only healing in the game, and the soil the winter mission is about. They regrow on the calendar, so a route is worth walking twice |

What this changes about the shape of the game: the loop between beats used to be *walk to
the marker*. It is now *walk to the marker, and decide on the way whether the detour to
the orchid bank is worth the day it costs, because the Gu you chose to carry eats in two
days and the stones say no.*

## Phase 2 · Vertical slice, chapters 1–19 — done for the slice

| Item | Status | Notes |
| --- | --- | --- |
| Prologue, awakening, Liquor worm and cave at final quality | Done | 7 authored scripts, 194 commands, 77 dialogue lines of which 35 are inner voice |
| Inner voice | Done | Its own visual channel; can sit on top of a spoken line |
| Recollections and Foresight | Done | `engine/systems/memory.ts`; no waypoints, partial memories marked, newcomers never penalised |
| Economy and upkeep | Done | `engine/systems/economy.ts`, `upkeep.ts`; canonical payments always go through |
| Calendar | Done | `engine/systems/calendar.ts`; seasons, weather, upkeep charged per day |
| Reader's Lens | Done | Per scene; veteran foresight is a separate opt-in, off by default |
| Five reader testers | Not done | Needs actual readers; that is the exit criterion, not a code change |
| Budgets met on a low-end phone | Partly | Budgets are asserted in CI on headless engines; a real low-end Android is still required |

## Phases 3–6 · Acts I–IV

**Scaffolded.** All 68 beats exist with final flags, evidence wiring, areas, cast,
chapters and art slots, and all 61 non-slice beats have a playable scaffold scene built
from the beat data and Fang Yuan's ledger entry. What they are waiting for is the
authoring pass that turns a scaffold into a scene like the seven in the slice, and the
hand-laid areas and illustrations to go with it.

Everything those acts depend on is already built and testable:

- The exposure system and both of its payoffs — Jia Fu's inquiry reads the Jia Jin
  Sheng trail, Tie Ruo Nan's investigation reads everything back to chapter 44.
- Multi-phase bosses for Fang Zheng, the monkey king, the boar king, the Thunder Crown
  Wolf and Bai Ning Bing, each phase a defence to read rather than a bar to out-damage.
- Refinement with the scripted chapter-119 Moonglow failure and canonical recipes that
  cannot fail outright.

## Phase 6 · The sequel bridge — done

- `engine/save/legacy.ts` exports the Legacy file and stores it for the same site.
- The `canon` block is identical for every player, and `validateLegacy()` overwrites
  whatever a hand-edited file claims.
- `defaultLegacy()` means game 2 runs standalone.
- "Unfinished business" lists the five threads in his voice after the ending only.
- New Game+ carries the codex, the ledger and the recognitions; canon stays fixed.

## Deferred, deliberately

| Item | Why |
| --- | --- |
| Sound | Out of scope for this version. The architecture is audio-ready: one event bus, `sfx`/`music` fields on every scene and line, reserved settings. A sound pack subscribes and fills in fields. |
| Rigged glTF characters | The actor API loads a rig and falls back to a procedural stand-in, so scenes, gestures and camera work are authorable now and swapping a rig in changes nothing above `engine/render/actors.ts`. |
| 28 of the 44 illustrations | Written prompts and reserved slots are in `content/qingmao/art/manifest.json`. |
| Localisation beyond English | All UI strings are already in `content/qingmao/strings/en.json`; shipping a second locale is a data change. |
| KTX2 compressed textures | The loader is vendored and wired; there are no textures to compress until the art pass. |

## How a session actually plays

Beats are offered, not chained. A scene ends, control returns, and the next beat sits
in the world as a marker you walk to and start with Interact. Between beats you can
explore the area, cultivate, call up a Recollection, or open the Journal. That is the
"fixed destination, free route" pillar in mechanical form — and the first build got it
wrong, chaining every beat into one unbroken slideshow.

## What a reader would notice is missing today

Being straight about it: the seven slice scenes read like the book. The other 61 do
not yet — they are staged, they carry his ledger entry as inner voice, they wire the
right flags and evidence, and they play, but they are a scaffold and they read like
one. That is exactly the phasing the review recommended: a polished slice on a finished
foundation before the other 181 chapters get written.
