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

## Two more found while rebuilding

| Issue | Fix |
| --- | --- |
| The old save format conflated rank with the Liquor worm's refinement, so a migrated save could read as Rank two when it was not | `engine/save/migrate.ts` rebuilds the aperture from the chapter the legacy step lands on, not from the old essence cap |
| Inventory was a parallel list that could drift out of step with the story | Gu are derived from the flags the completed beats publish, so the inventory cannot disagree with the chapter you are on |
