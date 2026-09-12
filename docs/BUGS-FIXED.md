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

### Reported after playing on a phone

| Issue | Fix |
| --- | --- |
| **The joystick felt reversed, and differently reversed depending on which way you faced.** The movement basis was a plain 2D rotation of the raw input, which is the wrong handedness for this camera: at yaw 0 forward drove the player *toward* the camera, at yaw 90 forward was right but strafing was mirrored | Extracted to `engine/core/movement.ts` and derived from the camera's own forward and right vectors. `tests/unit/movement.test.mts` checks every axis at 24 camera angles |
| Dragging right orbited the camera left | The yaw sign is corrected, and **Invert horizontal look**, **Invert vertical look** and a **look sensitivity** slider are in Options, because this one is partly taste |
| The touch stick was twitchy and had no deadzone, and a thumb sliding off it also dragged the camera | A 0.12 deadzone with the range rescaled past it, so just past the threshold is a slow walk; the usable throw is 78% of the ring; the knob lights up past the deadzone; a touch that starts on the stick can never become a look drag |
| **The chapter 3 room had no bed and no window**, though the narration describes both down to the broken latch | The room is built from what the chapter says: bed with blanket and pillow, a window with mullions and a sill, table, stool, chest, shelf, and twelve stones in a cloth bag beside the bed |
| **Interiors rendered almost black.** A roof blocks the sun, so a room lit by the outdoor rig got nothing, and outdoor fog distances turned its own walls to near-black at 14 units | Enclosed-but-not-underground areas get their own lighting balance and an overhead fill, and fog is pushed past the far wall. Point lights were also using candela-scale intensities of `1.6`, which arrive as ~0.1 at floor level |
| The third-person camera sat 16 units back inside an 18-wide bedroom — outside the wall, looking in | Camera distance is clamped to the area's smaller half-extent for interiors |
| The gold objective disc filled the corner of a small room like a blob | A thin ring, scaled to the area, that fades out as you arrive |
| Fang Yuan read as a cone wearing a hat | Rebuilt with human proportions — robe skirt, chest, cross-collar, sash, separate head with a face — and **long black hair**, loose or tied per the canon bible's new `hair` field. The content lint now requires chapter-referenced appearance notes and a valid hair spec for every named character |
| The region name was centred underneath the nav buttons and clipped | It is a flex item in the header now, so the layout keeps them apart at every width |
| Control returned a moment before the next beat's area loaded, so the camera framed the previous area | `playScene` no longer clears `inScene`; the caller does, once the next beat is set up |

### Reported after the control fixes

| Issue | Fix |
| --- | --- |
| **The character walked backward.** `setFacing(atan2(dx, dz))` points the model's local **+z** along the direction of travel, but the model was built with its face at **−z** and its hair at **+z**. Movement was correct; the model was on backwards | The convention is now stated and enforced: actors face **+z**, every face-side detail is at positive z and every back-side detail at negative, and the walk cycle swings to match. `exploration.spec.ts` checks the geometry *and* that the model's forward vector aligns with the direction of travel — verified to fail without the fix |
| Interiors were built from cave stone, so a bedroom looked like a wet grotto | `dark` now separates a cave from a room: rooms get bamboo and board colours for floor, walls and ceiling |
| The header wrapped onto two rows below about 1000 px, pushing Pause onto its own line | The header no longer wraps; the strapline and key hints drop out before the nav has to |
| **On a phone the toast printed on top of the quest strip, and the joystick sat on the vitals panel and the Recall button** | The phone layout stacks header → quest strip → toast deliberately, and the stick owns the bottom-left corner with the footer inset past it. A new test asserts that **no two HUD panels overlap at any viewport** — the previous test only checked one specific pair |

### Found by the first full visual sweep

Photographing all 36 areas turned these up at once. None were visible to any assertion.

| Issue | Fix |
| --- | --- |
| **Twenty-four of the thirty-six areas were the same two pictures**: a tan path between green cones, or an empty dark box. Identical draw-call and triangle counts gave it away before the images did | The area generator now has fifteen archetypes — hall, classroom, forge, market, lodging, cave, stone forest, blood lake, forest, snowfield, glacier, terraces, river, arena, camp — each building the place it actually is |
| **The glacier and the winter grounds were green forests** with tan paths | Snow archetypes: white ground, drifts, pines or ice spikes, cold fog |
| **The caves were unplayable black voids** (luminance 26). The design calls for darkness with the player carrying the light; only the darkness had been built | `Renderer.setCarriedLight()` gives the player a light underground, and it survives area rebuilds because it belongs to the player rather than the area |
| Interiors were 38×34 halls with a single column, at a camera distance that showed a corner of the floor | Rooms are room-sized, with colonnades, benches and a dais in halls, ranks of desks in the classroom, a furnace and benches in the forge |
| **The Yellow Dragon River was invisible** — its water colour was within a few points of its own bank, so the area read as one flat tan plane | Dark ochre water against pale silt banks, with reeds and pines set back on both sides |
| The prologue — the first thing anyone sees — was an unlit purple murk | A broken colonnade lit by braziers, with the eight of them at the edge of the light |
| The year-end duel arena had its crowd at radius 40 in a 132-unit area, so the spectators were dots on the horizon | A 96-unit arena with two rows of benches and spectators close enough to be a crowd |
| The establishing shot was being throttled by the interior camera clamp, so interiors could not be inspected at all | An explicit inspection distance bypasses the clamp; the clamp still governs the play camera |

### Found by the second sweep, and by the first play sweep

The second area sweep was run to check the first one's fixes and found eight areas still
sharing three layouts. The play sweep — which plays the game rather than photographing
it — is new, and everything below it found on its first run.

| Issue | Fix |
| --- | --- |
| **The quest panel printed the beat sheet's authoring notes as the player's objective.** Everyone playing read "Weak on purpose", "Also the combat tutorial, so the drop to Rank one has something to be a drop from" as their instruction for what to do next | Beats now carry an `objective` — one player-facing line each, for all 68 — and the design note stays where it belongs, behind the Reader's Lens opt-in. The content lint fails a beat with no objective, and fails one that reuses its design note |
| **The underground river could not be finished.** The spawn point was a fixed spot on the +z axis, which at chapter 4 put the player's face into a boulder twenty-four paces from the marker; walking straight forward stopped dead | The spawn is chosen, not fixed: candidate angles are tested for a clear line to the objective, widening and then stepping in until one is walkable. A test asserts that all 36 areas spawn with a clear lane |
| Three halls — the clan council pavilion, the internal affairs hall and the Bai clan hall — were the same room with the same benches | Four hall archetypes. The council seats its elders facing inward around an empty floor because that floor is where the accused stands; internal affairs is a counter, clerks' desks and ledger shelves; the medicine hall has sorting tables, racks and cots; the Bai hall is pale stone and a long cold approach, so another clan's hall reads as somewhere else |
| The Earth Treasury, the inheritance passage and the deep inheritance were one dark chamber three times | A vault of stone coffers, a narrow sloping passage with the canonical round boulder in it, and a deep stalagmite cavern |
| The winter gathering grounds and the winter beast crossing were the same snowfield | The grounds are occupied — tents, fires, stores, people. The crossing is a frozen channel with dead pines and a long sightline, because seeing what is coming is the point of it |
| The academy gate, the hunter's rest and Wang Da's hideout were one campsite; the boar trail and the wolf forest were one bamboo field | A walled approach with a queue at the gate; a rest stop with racks and a fire; a bowl of rock with one gap in the rim; a churned winding trail with wallows; and old closed-in forest with high canopy and short fog |
| The caves were navigable but the carried light reached about four paces, which is a torch in a black box | Wider and slower falloff, and a little more underground ambient — enough to silhouette stone against the fog, not enough to stop it being dark |
| **Fifty-four scenes narrated their own production notes to the player.** In the game's own narrator voice: "He is provisioning for departure thirty chapters before he leaves. Readers should notice", "The room has to feel too large", "Nothing here is a fight the player can win" | Every one rewritten as narration from inside the scene. The lint now fails a line that repeats its Reader's Lens note, and fails a line that talks *about* the game — readers, players, chapters, staging, spawn points |
| The Gu room elder was still standing in the tavern in the next chapter of the same scene, shoulder to shoulder with the keeper | Scenes have an `exit` command, and the lint fails an actor still on stage when a later chapter of the same scene stages a different cast |
| **`AreaDescription.ground` was dead data.** Every outdoor area in the game used one shared green, so the glacier, the river silt, the arena dust and the forest floor were the same colour and only the fog told them apart. `sky` was dead too | Both are used. The floor is the area's own ground; the clear colour behind everything is the area's own sky |
| **The outdoor ground was almost invisible.** ACES tone mapping at 1.05 returned a forest floor at about a fifth of its own brightness, so the hunter's rest, the boar trail and the wolf forest each read as a flat void with a few stalks floating in it | Exposure to 1.32, the outdoor ground colours lifted, and a scatter of wide soft patches in neighbouring tones — one extra draw call — so ground reads as ground and not as background |
| The prologue was open to the sky, so "eight of them have the doorway surrounded" and "a room with one exit" played over what looked like a forest at night. Thirty boulders were scattered over the hall floor, hiding the eight behind them | It is an enclosed hall now, in worked dark stone, with the rubble pushed to the walls and the eight standing close enough to the light to be people |
| Lanterns were bare brown sticks. In the Gu room one stood directly behind the player and read as part of him | A post with a paper lamp and a cap on it, merged into one geometry so the pair is still a single instanced draw |
| The Gu room — where the clan keeps every Gu it owns — was ten crates in a ring | Walls of shelved cases, a keeper's counter, the orchid trays the Moonlight Gu are fed from |
| A scripted camera could be placed inside an actor, who then filled the frame as an unreadable shape | Scripted cameras back off along their own view direction until they are clear of everyone |
| The exploration HUD stayed up during cutscenes: the vitals panel sat half-swallowed by the letterbox bar, the joystick hung over a scene nobody can walk through, and any scene with an illustration overlapped the quest strip | The HUD stands down for the length of a scene, by opacity rather than display, so the panels-do-not-overlap test can still measure it |
| The play sweep's own first two findings were false: it read the letterbox's opacity, which is always 1, and caught fades mid-transition | The check reads the height of the letterbox bars, and lets both overlays settle before judging. Worth recording: a check that cries wolf is worse than no check |
| **Every beat opened with the camera between the player and his objective**, looking back up the road he had just come down, so walking to the marker meant walking into the lens. This is the other half of "the character is walking backward" | A beat now sets the camera yaw to the direction of the objective, so the player is seen from behind with the place he is going to in front of him |
| The interior camera clamp assumed the player stood at the area's origin. Four paces off it, the camera went through the far wall, and the chapter 3 room rendered as a brown plane with none of the bed, window or stones on it | The orbit position itself is clamped inside the walls and under the ceiling |
| Three areas opened on a giant lamp post filling the frame, and the Earth Treasury had one standing on the objective marker | Lamp posts are solid, the spawn search keeps the stretch behind the player clear because that is where the camera stands, and nothing is placed on an area's origin |
| **A phone held upright saw almost nothing.** A fixed 52-degree vertical field of view is about 55 across on a laptop and 25 across at 430×932, so every interior on a phone was the back of Fang Yuan's head and very little room | The vertical angle opens as the frame narrows, capped short of the fish-eye a truly constant horizontal field would need at that aspect |
| Background people were pale seven-sided cones. Fine as a distant crowd; in the same room as the camera, a traffic cone standing next to the player | A robe, shoulders, head and hair merged into one geometry carrying its colours in a vertex attribute, so a crowd is still a single instanced draw |
| Fang Yuan's robe was an open-ended cylinder, so it had no bottom and its inner wall was back-face culled. From a low camera you looked through the front of the robe at the lit inside of its back, and he read as a pale lampshade | Closed, and a little less flared |
| The luminance check's washed-out ceiling flagged the snow areas while their drifts, tents and fires were perfectly legible | Brightness alone says nothing. The flag is now a high mean *with* a low spread: a bright frame with nothing in it |

### Reported from play: the stick, and scenes behind the text

| Issue | Fix |
| --- | --- |
| **Left and right on the joystick were mirrored at every camera angle.** The movement basis used `cross(up, forward)` where screen-right is `cross(forward, up)` — exactly the negative of it. Forward was correct, which is why it read as "left and right is off" rather than as reversed controls | The basis is fixed, and the convention is now pinned on the textbook camera: looking down −Z with up +Y, screen-right is +X. **The unit test asserted the same wrong cross product**, which is how a mirrored stick passed a check at 24 camera angles. It now computes the cross product rather than writing it out by hand, and a browser test measures the strafe against the right vector read out of the camera's own world matrix — something that cannot agree with a mistake of mine. Both verified to fail on the old basis |
| **The aperture awakening played behind the text box.** The scene is framed on Fang Yuan's chest at the centre of the screen, and on a phone the dialogue panel — at its tallest, because that scene also shows an illustration — was 461 of 932 pixels directly over it | Four things, and it needed all four. The camera drops its aim point by half the panel's measured height, so the subject rises clear of it, re-measured every frame because the panel grows when a line has a thought or an illustration under it. With the HUD standing down, the panel drops to the bottom edge instead of floating twelve rem up to clear a stick that is not there. The bar depth has one definition (`--bar`) that the header and the panel both respect, so the nav is no longer under the top bar nor Skip scene under the bottom one. Illustrations are capped by frame height as well as column width |
| The play sweep now fails a run where the dialogue panel covers more than 55% of the screen, or where the panel or the nav is under a letterbox bar | |

### Found once CI could actually be read

Sharding CI by engine brought the browser matrix from three hours to thirteen minutes,
and the first run that anyone waited for answered the standing question: the camera fix
worked — `the camera stays inside the walls of a small room` passes on WebKit at every
viewport now — and it turned up three more things.

| Issue | Fix |
| --- | --- |
| **The quest strip showed the previous beat's title and objective** after control had already come back for the next one. The HUD was only drawn by the render loop, so on any device where frames are slow the panel lagged behind the game | The HUD repaints when the beat changes, not on the next frame — the same shape as the camera fix. WebKit throttles `requestAnimationFrame` hard enough in CI to make this visible; a slow phone would show it too |
| The toast measured the quest panel to place itself, but not the region name. At desktop width on WebKit the region name hangs three pixels lower than the card beside it, and the toast landed on it | The toast clears everything above it, taking the lowest bottom edge of the two |
| **That fix did not fix it**, and the second run came back with the identical numbers. The measuring code only ran when a message arrived; before the first toast the element sits wherever the stylesheet put it, and that fallback — 9rem, less a 0.4rem transform — is 137.6px, exactly the number both runs reported. I had spent a run and a half improving the half of the code that was never executing | The toast is placed on load and again whenever anything above it changes size, via a `ResizeObserver` on the quest panel and the region name, which also covers the case that matters in play: the quest panel reflowing while a toast is on screen. The fallback moved down as well, for the frame before the observer fires. The test now checks **both** paths — at rest and with a message showing — because only checking one is what let this hide |
| **Four movement tests asserted a distance after holding a key for 350ms.** Movement is `speed * dt` with `dt` clamped at 50ms so a stall cannot teleport anyone, so distance depends on how many frames ran — and under a throttled `requestAnimationFrame` 350ms bought exactly one frame, 0.35 paces, every time. The clamp is right; the assumption was not | The tests hold the key until the player has walked a pace, then measure. What they are really asserting is the direction of travel, and that is now checked at any frame rate |

### Systems that had no door

Four systems were complete, correct, and unreachable. They were all built during the
systems pass, all covered by data-level checks, and a player could not touch any of
them. That is a pattern worth naming: a system with no caller passes every test you
write about its data and does nothing at all in the game.

| Issue | Fix |
| --- | --- |
| **`BOSSES` was never instantiated.** Five multi-phase bosses with telegraph shapes, reaction windows and a per-phase answer. `Combat.bossFor()` had no callers. The HUD's telegraph renderer had no callers. Pressing an ability spent essence into the void. Every must-land fight in the game — the prologue included — was a dialogue scene | Fights run, as an encounter runtime with the phase rules kept pure and unit-tested. A phase is a rule, not a health bar |
| **`Refinement` had no callers outside the scene runner**, so the player could never make anything and gathered materials led nowhere. It was the only item progression in the game | A bench, at any forge and permanently in the journal. Every recipe states its materials, stones, essence, days and odds, and whether it can be lost |
| **Nothing in the world could be gathered**, although the canon item list says of the moon orchid petals: "gathered near the awakening river, or bought" | Nodes derived from the props an area already places, capped at a dozen, three resources worth having, regrowing on the calendar |
| **Gu accumulated without limit**, so upkeep was a bill that arrived rather than a decision | The source's cap of five or six for a mortal master, with a reserve that costs no upkeep and grants no abilities. Reversible, so no loadout can strand a save |
| Upkeep was invisible until something went hungry | The HUD strip shows what eats in the next few days and whether there is anything in the bag to feed it, so the detour to the orchid bank is a decision rather than a surprise |
| A crowded interior pushed the spawn search inward until the player started four paces from the objective marker, which makes the context button read "Begin" from the first frame and puts everything else in that room out of reach | The search will not go inside the objective's own range |

### A note on the frustum-culling test

Making the prologue an enclosed hall broke it, and the break was informative. Every
chunk carries a bounding sphere large enough to hold its props, and a camera standing
inside one of those spheres always counts as seeing it. The prologue is ninety-six units
across in four chunks, so the camera is inside all four at once and nothing there can
ever be culled — the test had been passing on the old open-sky prologue, whose far
chunks happened to fall outside the frustum. It now measures on the bamboo path, which
is a hundred and thirty-two units across in sixteen chunks. Verified in both directions:
it fails with culling disabled and passes with it.

### A note on the regression test for the black screen

The first version of the test skipped the prologue to reach the end, and passed even
with the fix removed — because a skip does not run `fade` commands at all, so it never
reproduced the bug. The test now plays the scene through on auto-advance and answers
the chapter 2 choice the way a player does. Verified in both directions: it fails
without `restorePresentation()` and passes with it.
