# Art style guide

One written guide so generated and hand-made art land in the same world. Every prompt
in `content/qingmao/art/manifest.json` is written against this page.

## The look

**Stylised low-poly with hand-painted texture atlases and soft cel-style lighting.**

It suits a wuxia mountain, it ages better than an attempt at realism, and it is
achievable at this scope. Three properties matter more than any individual asset:

1. **Silhouette before detail.** A character or a place must be identifiable as a
   black shape. Fang Yuan reads as unremarkable on purpose; Man Shi reads as a head
   taller than the room; the founder's chamber reads as too large for a person.
2. **Flat planes, few of them.** Faceted geometry with a clear light side and shade
   side. No smooth normals on rock, no micro-detail that a 3–5k triangle budget
   cannot carry.
3. **Colour does the season, not the drama.** Spring is yellow-green and wet; winter
   is blue-grey with a high, cold key; underground is one carried light against
   near-black. Drama comes from staging and scale.

## Palette

| Role | Value | Used for |
| --- | --- | --- |
| Ground green | `#314f43` | Village and forest floor |
| Spear bamboo | `#38744c` | Qing Mao's signature bamboo |
| Roof teal | `#27494a` | Roofs, awnings, clan buildings |
| Wall straw | `#8f8d64` | Bamboo and daub walls |
| Stone | `#3e5457` | Cave, inheritance, blood-lake rock |
| Jade | `#63b794` | Gu light, essence, the inner voice |
| Gold | `#e7b057` | Objectives, clan authority, lantern light |
| Blood | `#c4584f` | Damage, the curtain, Blood Moon |
| Winter | `#9cbcc4` | Snow, glacier, cold fog |

The jade/gold pair carries almost all UI meaning. Blood is reserved: if it appears,
something has gone wrong for the player.

## Characters

- About 30 named characters, rigged, **3–5k triangles** each, with LODs.
- Model sheets come from `canon/characters.json`, where every appearance note carries
  the chapters it is drawn from. Do not invent an appearance that has no note.
- Two appearance rules readers will check immediately:
  - **Bai Ning Bing has one arm** until chapter 199, and the restored model only
    appears after the Yin Gu. `canon/characters.json` carries both variants and
    `variantForChapter()` picks between them.
  - **Fang Yuan looks ordinary.** The gap between how harmless he looks and how he
    thinks is the design; do not make him look dangerous.
- Every rig must expose the shared animation set in `engine/render/actors.ts`:
  `idle, walk, run, cultivate, cast, strike, guard, dodge, hit, fall, talk-point,
  talk-bow, talk-cross-arms, talk-dismiss`. A rig missing one still loads; the actor
  reports it through `missingAnimations()`.

## Environments

One coherent mountain, not a set of disconnected levels. Areas are chunks of it.

- **Village**: pale-green two-storey bamboo and wood houses on wooden stakes over
  uneven ground, exactly as the text describes them.
- **Bamboo**: straight stems, sharpened at the tip like a spear. This is the
  mountain's distinguishing feature and it should be visible in almost every
  outdoor shot.
- **Interiors and caves have ceilings.** `canon/places.json` carries a `ceiling`
  flag and the content lint fails a build where an enclosed area is not enclosed —
  the previous build rendered the "underground" stone forest under open sky.
- **Underground is genuinely dark.** The player carries the light. The stone forest
  and the Flower Wine cave are the two places this matters most.

## Illustrations

Grow from the 16 that ship to about 40. Every act gets an opener, every must-land
moment gets a key illustration. `content/qingmao/art/manifest.json` is the list, with
a written prompt for each planned piece.

Rules for every illustration:

- **Alt text is mandatory** and is checked by the lint.
- **Nothing graphic.** Violence is cut away from; show the aftermath through places
  and through people's reactions. For chapters 34–37, 143–145, 151–152 and 194–198
  in particular, the aftermath is the picture and the act is not.
- **Aspect**: 3:2 landscape, delivered at 1600 px wide. `tools/optimise-art.py`
  converts the set to WebP; the current 16 go from 24.3 MB to 3.1 MB.

## What the art must never do

- Imitate any published cover, illustration or official artwork.
- Reproduce panel compositions from any adaptation.
- Depict a named character in a way that contradicts a chapter-referenced note in
  the canon bible without that note being corrected first.
