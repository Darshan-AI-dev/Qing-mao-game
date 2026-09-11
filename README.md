# Qing Mao · Rebirth

A cross-device story world for the Qing Mao arc of *Reverend Insanity*, chapters 1 to
200. Every chapter is **played**, **staged**, or **recorded in Fang Yuan's own
ledger** — 200 out of 200, enforced in CI.

It ends in a state a second game, starting at chapter 201, can pick up.

---

## Play

```bash
npm install
npm run dev            # http://127.0.0.1:5173
```

Or build the static site and serve it:

```bash
npm run build
npm run preview        # http://127.0.0.1:4173
```

`npm run build` runs the content lint and the typecheck first, so a build that
succeeds is a build whose data is consistent.

## Controls

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Move | `W A S D` or arrows | Left stick | Left stick |
| Look | Drag | Drag anywhere right of the stick | Right stick |
| Interact | `E` | Context button | A |
| Attack | `Space` | Context button or Gu wheel | RB |
| Strike | `F` | Gu wheel | X |
| Guard | `R` (hold or toggle) | Guard button | LB |
| Dodge | `Q` | Gu wheel | B |
| Cultivate | `C` | Context button | Y |
| Run | `Shift` (hold or toggle) | Push the stick to its edge | Left stick click |
| Recall a memory | `G` | Recall button | D-pad up |
| Journal | `J` | Journal button | Select |
| Atlas | `M` | Atlas button | — |
| Pause | `Esc` | Pause button | Start |

Every key is remappable in **Options → Input → Keys**. Guard and run can each be hold
or toggle. Aim assist is the default on touch; manual aim is a setting.

## What is in the box

- **200 chapters, all covered.** 163 played, 31 staged, 6 recorded in the ledger.
  The Journal's Chapters view lists every one of them with a replay link.
- **A chapters 1–19 vertical slice at final quality**: the playable prologue at full
  power, the awakening, the household, the Liquor worm search, and the cave.
- **Fang Yuan's inner voice** as its own visual channel, original throughout.
- **Recollections** that point at an opportunity without placing a waypoint, and a
  **Foresight** recognition for acting on what you already know.
- **Reader's Lens**: chapter anchors and adaptation notes, with veteran foresight as
  a separate opt-in that is off by default.
- **A primeval stone economy** that uses the novel's figures where the text states
  them, with a ledger page, Gu upkeep, and canonical payments that always go through.
- **Exposure and evidence** feeding two investigations — Jia Fu's inquiry and Tie Ruo
  Nan's — that work the trail you actually left.
- **A Legacy export** at chapter 200 for the sequel, plus New Game+.

## Repository

```
canon/              shared canon bible (characters, Gu, clans, ranks, places, timeline, glossary)
engine/             renderer, systems, scenes, UI, saves, input, event bus
content/qingmao/    beats, scene scripts, the 200-chapter ledger, world, strings, art manifest
vendor/three/       vendored three.js (MIT)
tools/              content lint, authoring scripts, art optimisation, offline build
tests/              verify.cjs (logic) and tests/e2e (browser matrix)
docs/               architecture, art style guide, roadmap status, support matrix
```

See `docs/ARCHITECTURE.md` for the dependency rules that keep the engine reusable.

## Checks

```bash
npm run verify      # content lint + typecheck + logic tests
npm run test:e2e    # Playwright: 3 engines x 5 viewports, plus the performance budget
```

The content lint fails the build if any chapter is uncovered, a flag is read but never
set, a beat is unreachable, a canonical outcome depends on an optional flag, a string
key is missing, a dialogue line exceeds the cap, or an art reference does not resolve.

## Requirements

WebGL2 and `<dialog>`. That is current Chrome, Edge, Firefox, and Safari 15 and later.
A browser without WebGL2 gets a message explaining why, not a blank canvas.

**On iPhone and iPad**, Safari clears a site's saved data after seven days without a
visit. Add the game to your Home Screen — that exempts it, and it is the only reliable
way to keep a long save. The game says so on the title screen when it detects the risk.

## Sound

There is none yet, deliberately. The architecture is audio-ready: everything goes
through a central event bus, scene data carries empty `sfx` and `music` fields, and the
settings screen reserves the controls. A sound pack subscribes to events and fills in
fields; no gameplay code changes.

## Adaptation

All dialogue, inner-voice lines and ledger entries are **original writing**. Nothing is
transcribed from any translation. Canonical outcomes are fixed; what varies is method,
cost, risk, what evidence is left behind, and how Fang Yuan frames it to others.

Violence is cut away from and the aftermath is shown through places and people. The
content notice and the intensity setting are on the title screen, and neither setting
changes a story outcome.

Found a canon error? **Journal → Report a canon issue** attaches the scene and chapter.
