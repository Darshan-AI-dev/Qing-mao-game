# The bug and polish table, resolved

Every row from the design review's §11, with where it was fixed and what stops it
coming back.

| # | Issue | Fix | Guard |
| --- | --- | --- | --- |
| 1 | Controls table has duplicated, garbled rows (README.md) | `README.md` rewritten with one clean table covering keyboard, touch and gamepad | — |
| 2 | Missing word in intro: "tactical choices the wolf tide" (index.html) | Intro copy rewritten in `index.html` | `tests/e2e/smoke.spec.ts` asserts the phrase and the absence of the broken one |
| 3 | Journal download link returns 404; should be removed for public release | Removed; there is no resources ZIP link anywhere | `tests/e2e/smoke.spec.ts` asserts zero `a[download][href$=".zip"]` |
| 4 | Start buttons ordered 151 → 101 → 51 | Now 51 → 101 → 151 in `index.html` | `tests/e2e/smoke.spec.ts` asserts the exact label order |
| 5 | Region name and toast overlap at top centre (style.css) | Region name sits at the very top; the toast is offset below it | `tests/e2e/smoke.spec.ts` asserts the boxes do not overlap |
| 6 | "Underground" stone forest renders under open sky (game.js world build) | `canon/places.json` carries a `ceiling` flag; `buildArea()` draws a ceiling and four walls for any enclosed area and switches the lighting to underground | Content lint fails on a ceiling/enclosed mismatch; `verify.cjs` asserts the stone forest is enclosed and dark |
| 7 | Empty outlined box above the 青茅 seal glyph (style.css `.seal`) | `.seal` is a glyph with `border: 0; padding: 0; background: none` | — |
| 8 | Chapter-101 preset spawns 192 paces from its objective (state.js) | Spawn distance is clamped by `MAX_SPAWN_DISTANCE = 24` in `engine/main.ts` | `verify.cjs` asserts the cap and the clamp |
| 9 | Docs describe 24- and 44-stage versions; README says the launcher embeds all scripts but it is now a redirect | All docs rewritten against the current build; the redirect stub is gone and `tools/build-offline.mjs` produces a real offline build | — |
| 10 | No gamepad support, no reduced-motion support, no key remapping | `engine/input/input.ts` adds the Gamepad API with the standard mapping and full remapping; reduced motion follows both the in-game switch and `prefers-reduced-motion` | `tests/e2e/smoke.spec.ts` checks reduced motion under `emulateMedia` |
| 11 | No culling: about 326k vertices and about 120 draw calls every frame | Chunked worlds with per-chunk frustum culling, instancing for repeated props, quality tiers with explicit budgets, adaptive render scale | `tests/e2e/performance.spec.ts` asserts draw calls and triangles against the active tier and that culling is actually removing chunks |
| 12 | Source PDFs are bundled in the starter ZIP (tools/package.py) | `tools/package.py` excludes `source-reference/` and every `.pdf`, then re-opens the archive and refuses to finish if any slipped through; `tools/build-offline.mjs` applies the same rule | CI asserts no PDF reaches `dist/` or `dist-offline/` |

## Found while rebuilding

Six of these were caught by the new browser matrix on its first run, which is the
argument for having it.

| Issue | Fix |
| --- | --- |
| The render loop only started **after** the first beat's scene finished, so the entire playable prologue ran over a black screen | `start()` schedules the first frame before it awaits anything (`engine/main.ts`) |
| `#unsupported` is `hidden`, but a `display: grid` rule overrode it, leaving an invisible full-screen panel that swallowed every click in the game | `[hidden] { display: none !important }` in `style.css` |
| Opening the game reset a saved difficulty to the Options form's first option, because `applySettings()` pulled DOM values over the loaded save at construction | Split into `settingsToDom()` (save → form, on boot and on open) and `settingsFromDom()` (form → save, only from Apply) |
| Instanced props were chunked by the mesh's own position, which is the origin however far the instances spread — so a whole area collapsed into one chunk, culled as a unit, and drew nothing | Placements are bucketed into chunks *before* the InstancedMesh is built (`engine/render/world.ts`) |
| Chunk bounding spheres used a fixed generous radius large enough to contain the camera, so the frustum test never rejected anything | Tight bounds computed from each chunk's actual contents |
| The frustum was built from a stale `matrixWorldInverse`, which three only refreshes inside `render()` — wrong on the first frame and a frame behind after that | The camera's inverse is recomputed before the frustum is built |
| No autosave existed until the first 20-second tick, so a migration result could be lost to an early crash | `start()` writes the autosave immediately |
| The old save format conflated rank with the Liquor worm's refinement, so a migrated save could read as Rank two when it was not | `engine/save/migrate.ts` rebuilds the aperture from the chapter the legacy step lands on, not from the old essence cap |
| Inventory was a parallel list that could drift out of step with the story | Gu are derived from the flags the completed beats publish, so the inventory cannot disagree with the chapter you are on |

## Reported by a player

| Issue | Fix |
| --- | --- |
| **The player could never move.** `completeBeat()` called `enterBeat(next)` directly, so all 68 beats chained back to back with `inScene` true from the title screen to chapter 200. The game was a slideshow. | Beats are now *offered*: a marker goes into the world, control returns to the player, and the beat starts when they walk to it and press Interact. `tests/e2e/exploration.spec.ts` asserts control returns, that the player actually moves, and that an offered beat is still waiting three seconds later |
| Skip did nothing until you tapped Continue — `Timeline.abort()` only checks its flag between commands, and the pending typewriter promise never resolved | `Dialogue.cancelPending()` settles the line on screen, and `setInstant()` renders the rest immediately |
| Skipping a scene silently dropped its `evidence` commands, changing the investigation trail | A skip now still runs the stateful commands (`flag`, `evidence`, `weather`, `timeOfDay`) and resolves choices to their default. Skip is a presentation choice, never a state change |
| **The typewriter was starved by the render loop.** `setInterval(14ms)` competing with a 60 fps rAF loop measured a 78-character line at **16 seconds** instead of one. This is what made dialogue, skip and auto-advance all feel broken | Rewritten to drive off `requestAnimationFrame` against the clock, so pacing holds at any frame rate |
| Auto-advance used a flat 1.4 s hold regardless of line length, and turning it on mid-line did nothing | The hold scales with the length of the line, and the toggle re-arms a line that is already waiting |
| Only the Continue button advanced dialogue, which is not the gesture anyone uses on a phone | Tapping anywhere on the dialogue panel advances |
| **The screen went black after the chapter 2 choice.** The prologue ends on `fade: black` and the fade back lives at the top of the *next* script — invisible while beats chained, fatal once control returns between them | `playScene()` now calls `restorePresentation()`, which clears the fade, the letterbox, the scene art and the lens panel at the end of every scene, whatever the script left set. A scene must not leak presentation state into exploration |

### A note on the regression test for that last one

The first version of the test skipped the prologue to reach the end, and passed even
with the fix removed — because a skip does not run `fade` commands at all, so it never
reproduced the bug. The test now plays the scene through on auto-advance and answers
the chapter 2 choice the way a player does. Verified in both directions: it fails
without `restorePresentation()` and passes with it.
