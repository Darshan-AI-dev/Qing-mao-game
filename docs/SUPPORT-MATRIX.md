# Support matrix, budgets and distribution

## Platforms

| Platform | Browsers | Input | Notes |
| --- | --- | --- | --- |
| Windows / macOS / Linux desktop | Chrome, Edge, Firefox, Safari 16+ | Keyboard and mouse, or gamepad | Full quality |
| iPhone and iPad | Safari 16+ (iOS 16+) | Touch, gamepad optional | Install to the Home Screen — see storage below |
| Android phones and tablets | Chrome, Samsung Internet, Firefox | Touch, gamepad optional | |
| Chromebook | Chrome | Keyboard, touch or gamepad | Gamepad is the natural input here |

**Minimum:** WebGL2 and `<dialog>`. Anything without WebGL2 gets an explanation, not a
blank canvas (`engine/render/quality.ts`, `NO_WEBGL2_MESSAGE`).

Landscape is recommended during play; portrait is supported for dialogue and reading.

## Quality tiers and budgets

| | Low (phones) | Medium | High (desktop) |
| --- | --- | --- | --- |
| Target frame rate | 30 fps steady | 60 fps | 60 fps |
| Draw calls per frame | ≤ 150 | ≤ 300 | ≤ 600 |
| Visible triangles | ≤ 250k | ≤ 600k | ≤ 1.5M |
| Shadows | Blob only | One cascade | Soft |
| Render scale | 0.75–1.0× | 1.0× | Native, capped at 2× |
| View distance | 110 | 170 | 260 |
| Instances | 700 | 2000 | 5000 |

The tier is chosen by a short benchmark on first launch and is **always overridable**.
A recent flagship phone should run High; the automatic choice is a starting point, not
a ceiling. Inside a tier the render scale adapts before the tier itself is dropped.

**Measured in the previous build** (headless Chromium, start of the village): about
120 draw calls and about 326,000 vertices every frame with no culling at all, about
16 MB of geometry uploaded, about 4 MB transferred before first play, 24 MB of art.

**Techniques now in place:** chunked worlds with per-chunk frustum culling, instancing
for bamboo/rocks/villagers/pillars/lanterns, act-pack code splitting, and WebP art.

**Measured now:** the first playable moment is about 250 kB gzipped of code and CSS
against a 10 MB budget, and the art set is 3.1 MB (down from 24.3 MB) after
`tools/optimise-art.py`. `tests/e2e/performance.spec.ts` asserts the frame budget and
the first-load budget on every matrix run.

## Storage

Safari deletes a site's script-writable storage after seven days of browser use
without a visit to the site. A player who takes a break from a hosted build could lose
their save.

- Saves go to **IndexedDB**, with localStorage as a fallback.
- `navigator.storage.persist()` is requested on boot.
- On iOS outside a Home Screen app the game says so on the title screen. **Home-screen
  web apps are exempt from the eviction.**
- Three manual slots plus an autosave. The schema is versioned and keyed by stable IDs,
  and the v1–v4 migration path from the previous build is kept, original file included.

## Distribution

- **Primary: a hosted PWA** (GitHub Pages, Netlify or Cloudflare Pages). `public/sw.js`
  caches the shell and Act I on install and the later act packs as they are reached, so
  the game is playable offline after the first visit, and it installs on phones and
  desktops.
- **itch.io**, which accepts the same static build as an HTML5 upload.
- **An offline ZIP** for desktop players, built by `node tools/build-offline.mjs`.
  Service workers do not run from `file://`, so that build uses plain script loading
  and omits the worker.

## Testing

- `npm run test:e2e` drives **Chromium, Firefox and WebKit** (the engine behind Safari)
  at **390×844, 768×1024, 1024×768, 1440×900 and 1920×1080** — 15 projects — and runs
  the performance budget check in the same pass.
- `npm test` runs 54 logic checks over every beat ID, the migration path and the
  canon-safety rules.
- `npm run lint:content` is the CI gate on the content data.
- **Real devices before each release**: one low-end Android phone, one iPhone, one iPad
  and one Chromebook.
