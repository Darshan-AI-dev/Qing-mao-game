/**
 * Area descriptions.
 *
 * The chapters 1-19 slice is hand-laid to final quality. Every other area in the
 * canon bible gets a generated layout from `derive()` so the whole game is
 * traversable now and each one can be replaced with a hand-laid version as its act
 * comes up the roadmap. `enclosed` always follows the canon bible's `ceiling` flag,
 * which is what keeps an underground area from rendering under open sky.
 */
import { areas as canonAreas, type CanonArea } from '../../../canon/index';
import type { AreaDescription, PropPlacement } from '../../../engine/render/world';

const grid = (count: number, spread: number, seed: number, jitter = 0.8): PropPlacement[] => {
  const places: PropPlacement[] = [];
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const cx = (i % side) / (side - 1 || 1) - 0.5;
    const cz = Math.floor(i / side) / (side - 1 || 1) - 0.5;
    places.push({
      x: (cx + (rand() - 0.5) * jitter / side) * spread,
      z: (cz + (rand() - 0.5) * jitter / side) * spread,
      rotation: rand() * Math.PI * 2,
      scale: 0.8 + rand() * 0.5
    });
  }
  return places;
};

const ring = (count: number, radius: number, y = 0): PropPlacement[] =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y, rotation: -angle };
  });

// ---------------------------------------------------------------- hand-laid areas

/** Moment 1. Full power against hopeless odds; also the combat tutorial. */
const prologue: AreaDescription = {
  id: 'prologue.last-stand',
  size: { x: 96, z: 96 },
  // A hall he is cornered in, lit by what is still burning in it. The first version was
  // an unlit purple murk; the second was lit, but open to the sky, so the line about a
  // room with one exit played over what looked like a forest at night.
  ground: 0x3a3038,
  sky: 0x16101c,
  fog: { color: 0x1c1522, near: 30, far: 92 },
  enclosed: true,
  dark: true,
  ceilingHeight: 20,
  // Worked stone, not a grotto: this is somewhere that was built.
  interior: { floor: 0x3a3038, wall: 0x2b2430, ceiling: 0x181320 },
  timeOfDay: 0.06,
  paths: [{ from: [0, 44], to: [0, -44], width: 11 }],
  props: [
    // A broken colonnade: the ring behind him, and two rows closing the approach.
    { kind: 'pillar', places: ring(12, 36).map((pl, i) => ({ ...pl, scale: i % 3 === 0 ? 0.55 : 1 })) },
    { kind: 'pillar', places: [-13, 13].flatMap((x) =>
      [-22, -8, 8, 22].map((z) => ({ x, z, rotation: 0, scale: 0.9 }))) },
    // Rubble belongs against the walls of a hall, not scattered over its floor: thirty
    // boulders down the middle read as a quarry, and hid the eight behind them.
    { kind: 'rock', places: grid(30, 84, 77).filter((pl) => Math.hypot(pl.x, pl.z) > 26) },
    { kind: 'brazier', places: [
      { x: -9, z: -16 }, { x: 9, z: -16 }, { x: -9, z: 14 }, { x: 9, z: 14 }, { x: 0, z: -30 }
    ] },
    { kind: 'lantern', places: ring(6, 26) },
    // The eight of them, at the edge of the light, not coming in. At radius 21 they
    // were past the fog and behind the rubble, so the line about eight of them having
    // the doorway surrounded played over an empty floor.
    { kind: 'villager', places: ring(8, 14).map((pl) => ({ ...pl, scale: 1.35 })) }
  ],
  blockers: []
};

/**
 * Where he wakes. Built to match what chapter 3 actually describes: rain on the roof,
 * an open window with a latch that has been broken since last spring, a thin blanket,
 * and twelve primeval stones in a cloth bag beside the bed. The first version of this
 * room had crates and a lantern in it and nothing a reader would recognise.
 */
const hostelRoom: AreaDescription = {
  id: 'mountain.hostel-room',
  size: { x: 18, z: 20 },
  ground: 0x6a5a3c,
  sky: 0x9db9c4,
  fog: { color: 0x1b2326, near: 14, far: 30 },
  enclosed: true,
  ceilingHeight: 5.4,
  timeOfDay: 0.22,
  props: [
    // The bed against the far wall, the window beside it.
    { kind: 'bed', places: [{ x: -5.6, z: -5.4, rotation: 0, scale: 1 }] },
    { kind: 'window', places: [{ x: 0.5, z: -9.85, rotation: 0, scale: 1 }] },
    { kind: 'table', places: [{ x: 4.6, z: -5.2, rotation: 0, scale: 1 }] },
    { kind: 'stool', places: [{ x: 4.6, z: -3.6, rotation: 0, scale: 1 }] },
    { kind: 'chest', places: [{ x: 6.4, z: 4.8, rotation: 0.3, scale: 1 }] },
    { kind: 'shelf', places: [{ x: -5.6, z: -9.7, rotation: 0, scale: 1 }] },
    { kind: 'lantern', places: [{ x: 5.2, z: -8.6 }] }
  ],
  dressing: [
    { kind: 'blanket', x: -5.6, z: -5.0 },
    { kind: 'mullion', x: 0.5, z: -9.7 },
    // Twelve stones, and he has already counted them.
    { kind: 'stone-bag', x: -4.0, z: -3.4 }
  ]
};

/** Pale-green two-storey bamboo houses on wooden stakes over uneven ground. */
const village: AreaDescription = {
  id: 'mountain.village',
  size: { x: 180, z: 180 },
  ground: 0x4f6c4e,
  sky: 0x9db9c4,
  fog: { color: 0x2b4a52, near: 60, far: 170 },
  enclosed: false,
  timeOfDay: 0.3,
  buildings: [
    { x: -6, z: -54, w: 9, d: 8, h: 4.4, floors: 2 },
    { x: 14, z: -48, w: 10, d: 9, h: 4.2, floors: 2 },
    { x: -24, z: -38, w: 11, d: 9, h: 4.6, floors: 2 },
    { x: 22, z: -26, w: 9, d: 8, h: 4.2, floors: 2 },
    { x: -20, z: 18, w: 13, d: 11, h: 5, floors: 2 },
    { x: 30, z: 16, w: 10, d: 9, h: 4.4, floors: 2 },
    { x: -44, z: -12, w: 14, d: 12, h: 5.6, floors: 1 }
  ],
  paths: [
    { from: [-6, -48], to: [-6, 26], width: 5 },
    { from: [-48, 2], to: [36, 2], width: 5 },
    { from: [-6, -48], to: [24, -28], width: 4 },
    { from: [-6, 26], to: [-22, 20], width: 3.5 }
  ],
  props: [
    { kind: 'bamboo', places: grid(240, 170, 2031) },
    { kind: 'tree', places: grid(26, 160, 99) },
    { kind: 'rock', places: grid(34, 170, 1777) },
    // (-40, -6), (0, 6) and (-16, 12) are Wang Da, Jiang Ya and Jia Jin Sheng.
    { kind: 'villager', places: [
      { x: -10, z: -44 }, { x: 4, z: -40 }, { x: -26, z: -30 }, { x: 18, z: -20 },
      { x: 26, z: 10 }
    ] },
    { kind: 'lantern', places: [{ x: -2, z: -40 }, { x: -2, z: -20 }, { x: -2, z: 0 }, { x: -2, z: 20 }, { x: 18, z: 2 }, { x: -22, z: 2 }] }
  ]
};

/** A clear, faintly blue river; moon orchids with jade stems on the far bank. */
const awakeningRiver: AreaDescription = {
  id: 'mountain.awakening-river',
  // "Gathered near the awakening river, or bought" — canon/gu.json, on the petals. It
  // is enclosed, being underground, but it is a river bank rather than a room.
  gathering: true,
  size: { x: 84, z: 84 },
  ground: 0x3c4a4e,
  sky: 0x20333a,
  fog: { color: 0x16222a, near: 22, far: 70 },
  enclosed: true,
  ceilingHeight: 20,
  dark: true,
  timeOfDay: 0,
  water: [{ x: 0, z: -4, w: 74, d: 13, color: 0x3f8aa6 }],
  paths: [{ from: [0, 36], to: [0, 6], width: 7 }],
  props: [
    { kind: 'pillar', places: ring(9, 33) },
    { kind: 'orchid', places: grid(64, 48, 4004, 1.4).map((p) => ({ ...p, z: -18 + (p.z % 8) })) },
    { kind: 'rock', places: grid(20, 74, 555) },
    { kind: 'lantern', places: [{ x: -12, z: 14 }, { x: 12, z: 14 }, { x: 0, z: 26 }] },
    { kind: 'villager', places: [{ x: -6, z: 12 }, { x: -2, z: 14 }, { x: 3, z: 12 }, { x: 7, z: 15 }, { x: -10, z: 16 }] }
  ]
};

const academy: AreaDescription = {
  id: 'mountain.academy',
  size: { x: 120, z: 120 },
  ground: 0x587355,
  sky: 0x9db9c4,
  fog: { color: 0x2b4a52, near: 52, far: 118 },
  enclosed: false,
  timeOfDay: 0.42,
  buildings: [
    { x: 0, z: -22, w: 30, d: 16, h: 6.4, stilts: false, floors: 2 },
    { x: -26, z: 6, w: 14, d: 12, h: 4.8, stilts: false },
    { x: 26, z: 8, w: 14, d: 12, h: 4.8, stilts: false }
  ],
  paths: [
    { from: [0, 46], to: [0, -12], width: 7 },
    { from: [-30, 8], to: [30, 8], width: 5 }
  ],
  props: [
    { kind: 'bamboo', places: grid(120, 112, 313) },
    // (-8, 24) and (6, 26) are Mo Yan and Elder Mo Chen.
    { kind: 'villager', places: [{ x: -14, z: 16 }, { x: 16, z: 20 }, { x: 2, z: 34 }, { x: -4, z: 14 }] },
    { kind: 'lantern', places: [{ x: -8, z: -6 }, { x: 8, z: -6 }, { x: 0, z: 30 }] },
    { kind: 'crate', places: grid(9, 40, 808) }
  ]
};

const guRoom: AreaDescription = {
  id: 'mountain.gu-room',
  size: { x: 26, z: 26 },
  ground: 0x4a4435,
  sky: 0x32424a,
  fog: { color: 0x1d272b, near: 16, far: 40 },
  enclosed: true,
  ceilingHeight: 6.2,
  timeOfDay: 0.4,
  // Where the clan keeps every Gu it owns. Ten crates in a ring left it looking like a
  // storeroom somebody had cleared out: walls of shelved cases, a counter the keeper
  // works from, and the orchid trays the Moonlight Gu are fed out of.
  props: [
    { kind: 'shelf', places: [-11.5, 11.5].flatMap((x) =>
      [-8, -4, 0, 4, 8].map((z) => ({ x, z, rotation: 0, scale: 1 }))) },
    { kind: 'shelf', places: [-6, -2, 2, 6].map((x) => ({ x, z: -11.5, rotation: Math.PI / 2, scale: 1 })) },
    { kind: 'desk', places: [{ x: 0, z: -6, rotation: 0, scale: 1.2 }] },
    { kind: 'stool', places: [{ x: 0, z: -7.6 }] },
    { kind: 'table', places: [{ x: -4.5, z: 2 }, { x: 4.5, z: 2 }] },
    { kind: 'orchid', places: grid(18, 2.6, 4177).map((pl) => ({ ...pl, x: pl.x - 4.5, z: pl.z + 2, y: 0.82 })) },
    { kind: 'orchid', places: grid(18, 2.6, 913).map((pl) => ({ ...pl, x: pl.x + 4.5, z: pl.z + 2, y: 0.82 })) },
    // The Moonlight Gu themselves, on the trays this room feeds them from. The clan's
    // signature Gu is the first upkeep the player ever pays and it had never once been
    // on screen — in the room built to hold every Gu the clan owns.
    { kind: 'moth', places: [
      { x: -5.1, z: 1.4, y: 0.95, rotation: 0.4 }, { x: -3.9, z: 2.7, y: 0.95, rotation: 2.1 },
      { x: -4.6, z: 3.1, y: 0.95, rotation: 4.4 }, { x: 4.2, z: 1.6, y: 0.95, rotation: 1.2 },
      { x: 5.2, z: 2.9, y: 0.95, rotation: 3.6 }, { x: 3.8, z: 2.2, y: 0.95, rotation: 5.5 }
    ] },
    { kind: 'chest', places: [{ x: -8, z: 8 }, { x: 8, z: 8 }, { x: 0, z: 10.5 }] },
    // The figure behind the counter is Elder Feng, who runs this room and talks.
    { kind: 'lantern', places: [{ x: -8.5, z: -6 }, { x: 8.5, z: -6 }, { x: 0, z: 8 }] }
  ]
};

const trainingYard: AreaDescription = {
  id: 'mountain.training-yard',
  size: { x: 70, z: 70 },
  ground: 0x5c5a42,
  sky: 0x9db9c4,
  fog: { color: 0x2b4a52, near: 40, far: 76 },
  enclosed: false,
  timeOfDay: 0.5,
  paths: [{ from: [0, 30], to: [0, -24], width: 8 }],
  props: [
    { kind: 'bamboo', places: grid(58, 64, 626) },
    { kind: 'crate', places: [{ x: -8, z: -14 }, { x: 0, z: -16 }, { x: 8, z: -14 }] },
    { kind: 'lantern', places: [{ x: -14, z: 0 }, { x: 14, z: 0 }] }
  ]
};

const tavern: AreaDescription = {
  id: 'mountain.tavern',
  size: { x: 30, z: 28 },
  ground: 0x4e4230,
  sky: 0x32424a,
  fog: { color: 0x231c16, near: 16, far: 42 },
  enclosed: true,
  ceilingHeight: 9.4,
  timeOfDay: 0.66,
  // A drinking house, not a storeroom. It held fourteen crates, five cones and four
  // lamps, which is the same furniture the Gu room and the uncle's house had.
  props: [
    // The counter Keeper Lu works from, along the back wall, with the stock behind it.
    { kind: 'dais', places: [{ x: -7, z: -6.5, rotation: 0, scale: 1 }] },
    { kind: 'shelf', places: [-9, -6.4, -3.8].map((x) => ({ x, z: -12.4, rotation: 0, scale: 1.1 })) },
    { kind: 'jar', places: [
      { x: -9.4, z: -12.4, y: 0.1 }, { x: -8.2, z: -12.4, y: 0.1 }, { x: -6.6, z: -12.4, y: 0.1 },
      { x: -4.2, z: -12.4, y: 0.1 }, { x: 5.6, z: -11.6 }, { x: 7.1, z: -11.4 }, { x: 6.4, z: -10.2 },
      { x: -11.8, z: 4.2 }, { x: -11.4, z: 5.6 }
    ] },
    // Three tables with stools round them, which is what the room is for.
    { kind: 'table', places: [
      { x: -4, z: 2, scale: 1.5 }, { x: 6, z: -2, scale: 1.5 }, { x: 1, z: 8, scale: 1.5 }
    ] },
    { kind: 'stool', places: [
      { x: -5.6, z: 2 }, { x: -2.4, z: 2 }, { x: -4, z: 3.6 },
      { x: 4.4, z: -2 }, { x: 7.6, z: -2 }, { x: 6, z: -0.4 },
      { x: -0.6, z: 8 }, { x: 2.6, z: 8 }, { x: 1, z: 9.6 }
    ] },
    { kind: 'crate', places: grid(6, 20, 1212) },
    // Keeper Lu at (-7, -4) and Jiang He at (6, -2) are people now, not cones.
    { kind: 'villager', places: [{ x: -4, z: 2 }, { x: 8, z: 6 }, { x: 0, z: 8 }] },
    { kind: 'brazier', places: [{ x: 10, z: 0 }, { x: -11, z: -1 }] },
    { kind: 'lantern', places: [{ x: -9, z: -9 }, { x: 9, z: -9 }, { x: -9, z: 9 }, { x: 9, z: 9 }] }
  ]
};

const bambooGrove: AreaDescription = {
  id: 'mountain.bamboo-grove',
  size: { x: 140, z: 140 },
  ground: 0x466545,
  sky: 0x4a6470,
  fog: { color: 0x3a5258, near: 44, far: 130 },
  enclosed: false,
  // Dusk rather than night: the search happens over several evenings, and the player
  // still has to be able to see the grove they are searching.
  timeOfDay: 0.72,
  paths: [{ from: [0, 54], to: [18, -40], width: 3.5 }],
  props: [
    { kind: 'bamboo', places: grid(420, 132, 7071, 1.1) },
    { kind: 'rock', places: grid(22, 120, 4242) },
    { kind: 'lantern', places: [{ x: 0, z: 40 }] }
  ]
};

const bambooPath: AreaDescription = {
  id: 'mountain.bamboo-path',
  size: { x: 150, z: 150 },
  ground: 0x436042,
  sky: 0x2c3b46,
  fog: { color: 0x2c3f48, near: 34, far: 112 },
  enclosed: false,
  timeOfDay: 0.8,
  paths: [
    { from: [0, 60], to: [-10, 0], width: 4 },
    { from: [-10, 0], to: [26, -56], width: 3.5 }
  ],
  props: [
    { kind: 'bamboo', places: grid(360, 140, 5150, 1.2) },
    { kind: 'rock', places: grid(30, 134, 3131) },
    { kind: 'tree', places: grid(14, 130, 2121) }
  ]
};

/** Genuinely dark. The player carries the light. */
const flowerWineCave: AreaDescription = {
  id: 'mountain.flower-wine-cave',
  size: { x: 88, z: 88 },
  ground: 0x333c3f,
  sky: 0x101618,
  fog: { color: 0x0d1214, near: 8, far: 44 },
  enclosed: true,
  ceilingHeight: 17,
  dark: true,
  timeOfDay: 0,
  paths: [{ from: [0, 38], to: [0, -30], width: 5 }],
  props: [
    { kind: 'pillar', places: ring(11, 32) },
    { kind: 'rock', places: grid(36, 76, 9090) },
    { kind: 'crate', places: [{ x: -6, z: -22 }, { x: 5, z: -24 }] },
    { kind: 'lantern', places: [{ x: 0, z: 30 }] }
  ]
};

const uncleHouse: AreaDescription = {
  id: 'mountain.uncle-house',
  size: { x: 28, z: 26 },
  ground: 0x5a4c35,
  sky: 0x32424a,
  fog: { color: 0x241d15, near: 16, far: 40 },
  enclosed: true,
  ceilingHeight: 6,
  timeOfDay: 0.35,
  props: [
    { kind: 'crate', places: grid(10, 20, 1616) },
    // The three cones that used to stand here are the uncle, the aunt and the brother,
    // placed as real people in `folk.ts` — see the note there.

    { kind: 'lantern', places: [{ x: -8, z: -8 }, { x: 8, z: -8 }] }
  ]
};

const HAND_LAID: AreaDescription[] = [
  prologue, hostelRoom, village, awakeningRiver, academy, guRoom,
  trainingYard, tavern, bambooGrove, bambooPath, flowerWineCave, uncleHouse
];

// ------------------------------------------------------- generated areas

/**
 * Archetypes for areas that have not been hand-laid yet.
 *
 * The first version of this returned one generic outdoor layout and one generic
 * interior, so twenty-four of the game's thirty-six areas were the same picture: a tan
 * path between green cones, or an empty dark box. The glacier and the winter grounds
 * were green forests. A visual sweep of every area is what surfaced it.
 *
 * Each archetype below builds the place it actually is. They are still generated
 * rather than hand-laid, and each one is meant to be replaced by a hand-laid version
 * as its act comes up the roadmap.
 */
type Archetype =
  | 'council-hall' | 'records-hall' | 'medicine-hall' | 'foreign-hall'
  | 'classroom' | 'forge' | 'market' | 'lodging'
  | 'treasury' | 'passage' | 'cavern' | 'stone-forest' | 'blood-lake'
  | 'forest' | 'deep-forest' | 'trail' | 'hollow' | 'gate'
  | 'snow-camp' | 'snow-crossing' | 'glacier' | 'terraces'
  | 'river' | 'arena' | 'camp';

function archetypeFor(area: CanonArea): Archetype {
  const id = area.id;
  if (id.includes('stone-forest')) return 'stone-forest';
  if (id.includes('blood-lake')) return 'blood-lake';
  // Three dark chambers were one dark chamber three times. A vault, a sloping passage
  // with a boulder in it and a deep cavern are not interchangeable places.
  if (id.includes('treasury')) return 'treasury';
  if (id.includes('passage')) return 'passage';
  if (area.dark) return 'cavern';
  if (id.includes('forge')) return 'forge';
  if (id.includes('classroom')) return 'classroom';
  if (id.includes('market')) return 'market';
  if (id.includes('medicine')) return 'medicine-hall';
  if (id.includes('affairs')) return 'records-hall';
  // Another clan's hall should read as somewhere else the moment you walk in.
  if (id.startsWith('bai.')) return 'foreign-hall';
  if (id.includes('hall') || id.includes('gu-room')) return 'council-hall';
  if (!area.outdoor) return 'lodging';
  if (id.includes('glacier')) return 'glacier';
  if (area.weather === 'snow') return id.includes('crossing') ? 'snow-crossing' : 'snow-camp';
  if (id.includes('river')) return 'river';
  if (id.includes('terrace')) return 'terraces';
  if (id.includes('arena')) return 'arena';
  // A gate, a hunters' rest and a hideout were one campsite three times over, and the
  // boar trail and the wolf forest were one bamboo field twice. They are five places.
  if (id.includes('gate')) return 'gate';
  if (id.includes('hideout') || id.includes('refuge')) return 'hollow';
  if (id.includes('rest')) return 'camp';
  if (id.includes('trail')) return 'trail';
  if (id.includes('wolf') || id.includes('forest')) return 'deep-forest';
  return 'forest';
}

function derive(area: CanonArea): AreaDescription {
  const seed = [...area.id].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const kind = archetypeFor(area);
  const big = area.outdoor;
  // Rooms are room-sized. The first pass used 38 x 34 for every interior, which at a
  // room's camera distance is a large empty floor with a column in the middle of it.
  const size = big ? { x: 132, z: 132 } : { x: 26, z: 30 };
  // Small deterministic variations so two halls are not the same hall.
  const vary = (n: number) => ((seed >>> n) & 7) - 3;
  const half = size.x / 2 - 10;

  const base: AreaDescription = {
    id: area.id,
    size,
    ground: 0x53704b,
    sky: 0x9db9c4,
    fog: { color: 0x2b4a52, near: 50, far: 130 },
    enclosed: area.ceiling,
    dark: area.dark ?? false,
    ceilingHeight: area.dark ? 18 : area.ceiling ? 6.4 : undefined,
    timeOfDay: area.dark ? 0 : 0.45,
    props: []
  };

  switch (kind) {
    // ---------------------------------------------------------------- interiors
    case 'council-hall': {
      // The clan judges you standing in the middle of the floor. Elders' benches face
      // inward down both long sides, the leader's dais closes the far end, and the
      // floor between them is deliberately empty: it is where the accused stands.
      const benches = [-6.6, 6.6].flatMap((x) =>
        [-6, -1.5, 3, 7.5].map((z) => ({ x, z, rotation: x < 0 ? Math.PI / 2 : -Math.PI / 2, scale: 0.95 })));
      return {
        ...base,
        size: { x: 30, z: 36 },
        ceilingHeight: 9,
        props: [
          { kind: 'pillar', places: [-11.5, 11.5].flatMap((x) =>
            [-12, -4, 4, 12].map((z) => ({ x, z, rotation: 0, scale: 0.3 }))) },
          { kind: 'pew', places: benches },
          { kind: 'dais', places: [{ x: 0, z: -13.5, rotation: 0, scale: 1.25 }] },
          { kind: 'banner', places: [{ x: -6, z: -17 }, { x: 0, z: -17 }, { x: 6, z: -17 }] },
          { kind: 'brazier', places: [{ x: -8.5, z: -11 }, { x: 8.5, z: -11 }] },
          { kind: 'lantern', places: [{ x: -12, z: 8 }, { x: 12, z: 8 }] },
          { kind: 'villager', places: [
            { x: 0, z: -12 },
            ...benches.map((b) => ({ x: b.x * 0.82, z: b.z })),
            { x: -3, z: 13 + vary(5) * 0.3 }, { x: 3, z: 13 }
          ] }
        ]
      };
    }
    case 'records-hall': {
      // Bookkeeping, not ceremony: a counter across the door, two files of clerks'
      // desks down an aisle, and the clan's ledgers on every wall. This is the room
      // where a month's stones are signed for, so the chests are the point of it.
      const desks = [-5.2, 5.2].flatMap((x) =>
        [-6, -2, 2, 6].map((z) => ({ x, z, rotation: 0, scale: 1 })));
      return {
        ...base,
        size: { x: 26, z: 32 },
        ceilingHeight: 7,
        interior: { floor: 0x5d4a2f, wall: 0x6f6a4c, ceiling: 0x322a1d },
        props: [
          { kind: 'desk', places: desks },
          { kind: 'stool', places: desks.map((d) => ({ ...d, z: d.z + 1.4 })) },
          { kind: 'shelf', places: [-11, 11].flatMap((x) =>
            [-9, -4, 1, 6, 11].map((z) => ({ x, z, rotation: 0, scale: 1 }))) },
          { kind: 'table', places: [{ x: -3, z: 12.5 }, { x: 3, z: 12.5 }] },
          { kind: 'chest', places: [
            { x: -8.5, z: -13 }, { x: -4.5, z: -13 }, { x: 0, z: -13 },
            { x: 4.5, z: -13 }, { x: 8.5, z: -13 }
          ] },
          { kind: 'lantern', places: [{ x: -8, z: 8 }, { x: 8, z: 8 }, { x: 0, z: -8 }] },
          { kind: 'villager', places: [
            { x: -5.2, z: -0.6 }, { x: 5.2, z: 3.4 }, { x: -5.2, z: 7.4 },
            { x: 0, z: 11 + vary(5) * 0.3 }
          ] }
        ]
      };
    }
    case 'medicine-hall': {
      // Herbs and heat. Sorting tables down the centre, racks and jars on the walls, a
      // decoction furnace at the back, and cots along one side for whoever came in on
      // someone else's shoulder.
      return {
        ...base,
        size: { x: 28, z: 30 },
        ceilingHeight: 7,
        interior: { floor: 0x6d5a38, wall: 0x8a815a, ceiling: 0x3a3020 },
        props: [
          { kind: 'furnace', places: [{ x: 0, z: -11, rotation: 0, scale: 0.8 }] },
          { kind: 'brazier', places: [{ x: -4.5, z: -10 }, { x: 4.5, z: -10 }] },
          { kind: 'table', places: [
            { x: -3.4, z: -3 }, { x: 3.4, z: -3 }, { x: -3.4, z: 1.5 }, { x: 3.4, z: 1.5 }
          ] },
          { kind: 'stool', places: [{ x: -3.4, z: -1.2 }, { x: 3.4, z: 3.3 }] },
          { kind: 'shelf', places: [-12, 12].flatMap((x) =>
            [-7, -2, 3, 8].map((z) => ({ x, z, rotation: 0, scale: 1 }))) },
          { kind: 'bed', places: [
            { x: -8.5, z: 9, rotation: Math.PI / 2, scale: 0.9 },
            { x: -8.5, z: 12.5, rotation: Math.PI / 2, scale: 0.9 },
            { x: 8.5, z: 11, rotation: Math.PI / 2, scale: 0.9 }
          ] },
          { kind: 'orchid', places: grid(14, 22, seed + 3).filter((pl) => Math.abs(pl.x) < 11 && pl.z < -5) },
          { kind: 'lantern', places: [{ x: -9, z: 4 }, { x: 9, z: 4 }] },
          { kind: 'villager', places: [
            { x: -3.4, z: -1.4 }, { x: 3.4, z: 3.1 }, { x: 0, z: -8 + vary(5) * 0.3 }
          ] }
        ],
        dressing: [{ kind: 'blanket', x: -8.5, z: 9 }, { kind: 'blanket', x: 8.5, z: 11 }]
      };
    }
    case 'foreign-hall': {
      // Another clan's hall. Pale stone instead of the Gu Yue clan's dark boards, a
      // long cold approach and a raised seat at the end of it: the room is arranged so
      // that anyone who walks in is walking towards someone who has not stood up.
      return {
        ...base,
        size: { x: 26, z: 44 },
        ceilingHeight: 11,
        interior: { floor: 0x878c86, wall: 0x9ba09a, ceiling: 0x545a56 },
        timeOfDay: 0.3,
        props: [
          { kind: 'pillar', places: [-9.5, 9.5].flatMap((x) =>
            [-16, -9, -2, 5, 12, 18].map((z) => ({ x, z, rotation: 0, scale: 0.34 }))) },
          { kind: 'dais', places: [{ x: 0, z: -17.5, rotation: 0, scale: 1.4 }] },
          { kind: 'banner', places: [{ x: -4.5, z: -20.8 }, { x: 4.5, z: -20.8 }] },
          { kind: 'brazier', places: [{ x: -6, z: -13 }, { x: 6, z: -13 }] },
          { kind: 'lantern', places: [{ x: -10.5, z: 2 }, { x: 10.5, z: 2 }, { x: -10.5, z: 15 }, { x: 10.5, z: 15 }] },
          // Attendants standing in two files, not sitting. Nobody here is a guest.
          { kind: 'villager', places: [
            ...[-5.5, 5.5].flatMap((x) => [-8, -3, 2, 7].map((z) => ({ x, z }))),
            { x: 0, z: -15.5 }, { x: -2.2, z: 18 + vary(5) * 0.3 }
          ] },
          { kind: 'orchid', places: ring(8, 7).map((pl) => ({ ...pl, z: pl.z - 17.5 })) }
        ]
      };
    }
    case 'classroom': {
      // Four ranks of desks facing the front, a stool behind each.
      const desks = [-5.5, -1.8, 1.8, 5.5].flatMap((x) =>
        [-2, 1.6, 5.2, 8.8].map((z) => ({ x, z, rotation: 0, scale: 1 })));
      return {
        ...base,
        size: { x: 26, z: 30 },
        props: [
          { kind: 'desk', places: desks },
          { kind: 'stool', places: desks.map((d) => ({ ...d, z: d.z + 1.3 })) },
          { kind: 'dais', places: [{ x: 0, z: -9, rotation: 0, scale: 0.6 }] },
          { kind: 'shelf', places: [{ x: -10.5, z: -4 }, { x: 10.5, z: -4 }] },
          { kind: 'lantern', places: [{ x: -10, z: -10 }, { x: 10, z: -10 }] },
          { kind: 'villager', places: [
            { x: -5.5, z: 1.6 }, { x: 1.8, z: -2 }, { x: 5.5, z: 5.2 }, { x: 0, z: -7.5 }
          ] }
        ]
      };
    }
    case 'forge':
      return {
        ...base,
        size: { x: 26, z: 28 },
        props: [
          { kind: 'furnace', places: [{ x: 0, z: -9, rotation: 0, scale: 1 }] },
          { kind: 'brazier', places: [{ x: -5, z: -7 }, { x: 5, z: -7 }, { x: 0, z: 4 }] },
          { kind: 'table', places: [{ x: -6.5, z: 0 }, { x: 6.5, z: 0 }, { x: 0, z: -3 }] },
          { kind: 'stool', places: [{ x: -6.5, z: 1.6 }, { x: 6.5, z: 1.6 }] },
          { kind: 'shelf', places: [{ x: -10.5, z: -4 }, { x: 10.5, z: -4 }] },
          { kind: 'chest', places: [{ x: -9, z: 8 }, { x: 9, z: 8 }, { x: 0, z: 10 }] },
          { kind: 'lantern', places: [{ x: -9, z: 6 }, { x: 9, z: 6 }] }
        ]
      };
    case 'market':
      return {
        ...base,
        size: { x: 104, z: 104 },
        ground: 0x6b6344,
        timeOfDay: 0.5,
        paths: [
          { from: [-44, 0], to: [44, 0], width: 9 },
          { from: [0, -40], to: [0, 40], width: 7 }
        ],
        props: [
          // Two rows of stalls facing each other across the main lane.
          { kind: 'stall', places: [-32, -20, -8, 8, 20, 32].flatMap((x) => [
            { x, z: -7, rotation: 0, scale: 1 },
            { x, z: 7, rotation: Math.PI, scale: 1 }
          ]) },
          { kind: 'awning', places: [-32, -20, -8, 8, 20, 32].flatMap((x) => [
            { x, z: -7, rotation: 0, scale: 1 },
            { x, z: 7, rotation: 0, scale: 1 }
          ]) },
          { kind: 'crate', places: grid(16, 84, seed, 1.1) },
          { kind: 'villager', places: [
            { x: -26, z: 0 }, { x: -12, z: 2 }, { x: 0, z: -2 }, { x: 14, z: 1 },
            { x: 26, z: -1 }, { x: -6, z: 16 }, { x: 10, z: -16 }
          ] },
          { kind: 'lantern', places: [{ x: -20, z: 0 }, { x: 20, z: 0 }, { x: 0, z: 20 }, { x: 0, z: -20 }] },
          { kind: 'bamboo', places: grid(40, 96, seed + 5).filter((pl) => Math.abs(pl.x) > 40 || Math.abs(pl.z) > 26) }
        ]
      };
    case 'lodging':
      return {
        ...base,
        size: { x: 22, z: 24 },
        props: [
          { kind: 'bed', places: [{ x: -6.5, z: -6, rotation: 0, scale: 1 }] },
          { kind: 'window', places: [{ x: 3, z: -11.8, rotation: 0, scale: 1 }] },
          { kind: 'table', places: [{ x: 5.5, z: -4 }] },
          { kind: 'stool', places: [{ x: 5.5, z: -2.3 }, { x: 2, z: 3 }] },
          { kind: 'chest', places: [{ x: -8, z: 6 }, { x: 8, z: 7 }] },
          { kind: 'shelf', places: [{ x: -6.5, z: -11.6 }] },
          { kind: 'lantern', places: [{ x: 7, z: -9 }] }
        ],
        dressing: [{ kind: 'blanket', x: -6.5, z: -5.6 }, { kind: 'mullion', x: 3, z: -11.6 }]
      };

    // ------------------------------------------------------------------- caves
    case 'treasury':
      // A vault, not a cave: ranks of stone coffers under a low worked ceiling, an
      // empty pedestal at the centre, and a clear aisle to walk between them. What is
      // and is not still in the chests is the whole of chapters 60 and 64.
      return {
        ...base,
        size: { x: 56, z: 64 },
        fog: { color: 0x11161a, near: 26, far: 74 },
        ceilingHeight: 10,
        props: [
          { kind: 'pillar', places: [-16, 16].flatMap((x) =>
            [-18, -6, 6, 18].map((z) => ({ x, z, rotation: 0, scale: 0.45 }))) },
          { kind: 'chest', places: [-22, -11, 11, 22].flatMap((x) =>
            [-22, -16, -10, -4, 2, 8, 14, 20].map((z) => ({ x, z, rotation: 0, scale: 1.15 }))) },
          { kind: 'dais', places: [{ x: 0, z: -12, rotation: 0, scale: 0.9 }] },
          { kind: 'crate', places: grid(10, 40, seed + 11).filter((pl) => Math.abs(pl.x) < 8) },
          { kind: 'brazier', places: [{ x: -6, z: -20 }, { x: 6, z: -20 }, { x: -6, z: 22 }, { x: 6, z: 22 }] },
          // Nothing stands on the origin: that is where the objective marker sits and
          // where every scene stages itself, so a lamp post there is a lamp post in the
          // middle of the shot, every time.
          { kind: 'lantern', places: [{ x: -5, z: 26 }, { x: 5, z: -26 }] }
        ]
      };
    case 'passage': {
      // Canon is specific about this one: a sloping passage and a round boulder. So it
      // is a corridor — narrow enough that the walls are always in frame — with the
      // boulder sitting in it, and not another wide chamber with rocks scattered about.
      const walls = [-7.5, 7.5].flatMap((x) =>
        Array.from({ length: 12 }, (_, i) => ({ x, z: -58 + i * 10.5, rotation: 0, scale: 0.5 })));
      return {
        ...base,
        size: { x: 22, z: 132 },
        fog: { color: 0x0b1012, near: 16, far: 52 },
        ceilingHeight: 9,
        props: [
          { kind: 'pillar', places: walls },
          { kind: 'rock', places: grid(22, 16, seed).map((pl) => ({ ...pl, z: pl.z * 7 })) },
          // The boulder. Oversized on purpose: it is meant to fill the passage.
          { kind: 'rock', places: [{ x: 0, z: -22, rotation: 0, scale: 3.1 }] },
          { kind: 'brazier', places: Array.from({ length: 6 }, (_, i) => ({ x: i % 2 ? 6 : -6, z: -50 + i * 20 })) },
          { kind: 'lantern', places: [{ x: 0, z: 56 }, { x: 0, z: 10 }, { x: 0, z: -40 }] }
        ]
      };
    }
    case 'cavern':
      // Deep and open: a stalagmite floor under a vault you cannot see, with a worked
      // platform at the far end that somebody cut a long time before you got here.
      return {
        ...base,
        size: { x: 108, z: 108 },
        fog: { color: 0x0d1214, near: 22, far: 78 },
        ceilingHeight: 24,
        props: [
          { kind: 'pillar', places: ring(11, 40).map((pl) => ({ ...pl, scale: 1.1 })) },
          { kind: 'rock', places: grid(46, 96, seed) },
          { kind: 'icespike', places: grid(18, 84, seed + 3) },
          { kind: 'dais', places: [{ x: 0, z: -34, rotation: 0, scale: 1.6 }] },
          { kind: 'brazier', places: ring(5, 14) },
          { kind: 'lantern', places: [{ x: 0, z: 30 }] }
        ]
      };
    case 'stone-forest':
      return {
        ...base,
        size: { x: 128, z: 128 },
        fog: { color: 0x0d1214, near: 26, far: 86 },
        ceilingHeight: 26,
        props: [
          // The pillars are the place. Dense, tall, and you cannot see the vault.
          { kind: 'pillar', places: grid(38, 112, seed, 1.1).map((p) => ({ ...p, scale: 0.8 + (p.x % 3) * 0.2 })) },
          { kind: 'rock', places: grid(30, 110, seed + 5) }
        ]
      };
    case 'blood-lake':
      return {
        ...base,
        size: { x: 120, z: 120 },
        fog: { color: 0x180a0c, near: 24, far: 82 },
        ceilingHeight: 30,
        ground: 0x3a2226,
        water: [{ x: 0, z: -12, w: 76, d: 46, color: 0x5e1b1e }],
        props: [
          { kind: 'pillar', places: ring(10, 44).map((p) => ({ ...p, scale: 1.3 })) },
          { kind: 'rock', places: grid(26, 104, seed) },
          { kind: 'brazier', places: ring(6, 20) }
        ]
      };

    // ---------------------------------------------------------------- outdoors
    case 'snow-camp': {
      // The winter gathering grounds are occupied: the clan's tents and fires in a
      // cleared hollow, stores stacked behind them, the pines pushed back to the edge.
      // Somewhere people are living, not somewhere you are crossing.
      const fires: PropPlacement[] = ring(4, 20);
      return {
        ...base,
        ground: 0x82a1b0,
        sky: 0x8aa6b3,
        fog: { color: 0x7f9ca9, near: 46, far: 136 },
        timeOfDay: 0.4,
        // Packed snow, not a dirt track: the shared tan path laid a brown swathe across
        // a snowfield and took over a third of the frame.
        paths: [
          { from: [-46, 0], to: [46, 0], width: 9, color: 0x9db8c4 },
          { from: [0, -40], to: [0, 40], width: 6, color: 0x9db8c4 }
        ],
        props: [
          { kind: 'awning', places: ring(9, 30).map((pl) => ({ ...pl, scale: 1.2 })) },
          { kind: 'stall', places: ring(9, 32).map((pl) => ({ ...pl, scale: 1.1 })) },
          { kind: 'brazier', places: fires },
          { kind: 'crate', places: grid(22, 56, seed, 1.1) },
          { kind: 'villager', places: [
            ...fires.flatMap((f) => [{ x: f.x * 0.82, z: f.z * 0.82 }, { x: f.x * 1.2, z: f.z * 1.2 }]),
            { x: 0, z: 6 }, { x: -7, z: -4 }
          ] },
          { kind: 'snowdrift', places: grid(18, 112, seed + 2, 1.1).filter((pl) => Math.hypot(pl.x, pl.z) > 34) },
          { kind: 'pine', places: grid(28, 120, seed + 7).filter((pl) => Math.hypot(pl.x, pl.z) > 44) },
          { kind: 'lantern', places: ring(6, 24) }
        ]
      };
    }
    case 'snow-crossing':
      // The crossing is the opposite: nothing built, nobody there. A frozen channel cut
      // through the drifts, dead pines on the banks, and a long sightline down it —
      // because what matters here is seeing the beasts coming before they arrive.
      return {
        ...base,
        ground: 0x9fbbc8,
        sky: 0x8fadba,
        fog: { color: 0x8aa8b4, near: 34, far: 118 },
        timeOfDay: 0.28,
        water: [{ x: 0, z: 0, w: 26, d: 150, color: 0x8fb4c4 }],
        props: [
          { kind: 'snowdrift', places: grid(40, 124, seed, 1.2).filter((pl) => Math.abs(pl.x) > 16) },
          { kind: 'icespike', places: grid(20, 120, seed + 4).filter((pl) => Math.abs(pl.x) > 14) },
          { kind: 'pine', places: grid(22, 126, seed + 7).filter((pl) => Math.abs(pl.x) > 26) },
          { kind: 'rock', places: grid(16, 118, seed + 13).filter((pl) => Math.abs(pl.x) > 15) },
          // The channel itself needs something in it. Clearing every prop out of the
          // middle left the part of the area the player actually walks down as a flat
          // pale sheet with nothing to judge distance or speed against.
          { kind: 'icespike', places: grid(14, 110, seed + 21, 1.3)
            .filter((pl) => Math.abs(pl.x) < 12)
            .map((pl) => ({ ...pl, scale: 0.55 })) },
          { kind: 'rock', places: grid(10, 104, seed + 31).filter((pl) => Math.abs(pl.x) < 11)
            .map((pl) => ({ ...pl, scale: 0.5 })) }
        ]
      };
    case 'glacier':
      return {
        ...base,
        ground: 0x9bb9c6,
        sky: 0xa0bbc6,
        fog: { color: 0x93b1bd, near: 42, far: 132 },
        timeOfDay: 0.35,
        paths: [{ from: [0, 58], to: [0, -58], width: 8, color: 0x93b0be }],
        props: [
          { kind: 'snowdrift', places: grid(26, 118, seed, 1.1) },
          { kind: 'icespike', places: grid(30, 118, seed + 7).map((pl) => ({ ...pl, scale: 0.9 + ((seed >>> 4) & 3) * 0.2 })) },
          { kind: 'rock', places: grid(14, 112, seed + 13) }
        ]
      };
    case 'terraces':
      return {
        ...base,
        ground: 0x647f52,
        timeOfDay: 0.6,
        paths: [{ from: [0, 58], to: [0, -58], width: 5 }],
        props: [
          { kind: 'terrace', places: [-36, -24, -12, 12, 24, 36].map((z) => ({ x: 0, z, rotation: 0, scale: 1 })) },
          { kind: 'reed', places: grid(120, 112, seed, 1.2) },
          { kind: 'rock', places: grid(10, 110, seed + 9) },
          { kind: 'villager', places: [{ x: -14, z: 6 }, { x: 15, z: -10 }] }
        ]
      };
    case 'river':
      return {
        ...base,
        // Banks are pale silt; the water is a much darker ochre. The first version had
        // the two within a few points of each other, so the river was invisible and the
        // area read as one flat tan plane.
        ground: 0x8a7a4e,
        fog: { color: 0x9aa08c, near: 46, far: 132 },
        timeOfDay: 0.24,
        water: [{ x: 0, z: 0, w: 58, d: 132, color: 0x3f3a1c }],
        paths: [
          { from: [-46, 60], to: [-46, -60], width: 14 },
          { from: [46, 60], to: [46, -60], width: 14 }
        ],
        props: [
          { kind: 'reed', places: grid(110, 120, seed, 1.3).map((pl) => ({
            ...pl, x: pl.x < 0 ? -30 - Math.abs(pl.x) * 0.3 : 30 + Math.abs(pl.x) * 0.3
          })) },
          { kind: 'raft', places: [{ x: 0, z: 6, rotation: 0, scale: 1 }] },
          { kind: 'rock', places: grid(16, 118, seed + 4).map((pl) => ({
            ...pl, x: pl.x < 0 ? pl.x - 34 : pl.x + 34
          })) },
          { kind: 'pine', places: grid(12, 116, seed + 9).map((pl) => ({
            ...pl, x: pl.x < 0 ? pl.x - 44 : pl.x + 44
          })) }
        ]
      };
    case 'arena':
      // The year-end examination: a cleared floor with the clan close enough around it
      // to be a crowd. At radius 40 they were scattered dots on the horizon.
      return {
        ...base,
        size: { x: 96, z: 96 },
        ground: 0x7a6f4c,
        timeOfDay: 0.52,
        props: [
          { kind: 'pew', places: ring(20, 24).map((pl, i) => ({ ...pl, rotation: (i / 20) * Math.PI * 2 })) },
          { kind: 'pew', places: ring(24, 29).map((pl, i) => ({ ...pl, rotation: (i / 24) * Math.PI * 2 })) },
          // Two rows of spectators, the front row standing at the edge of the floor.
          { kind: 'villager', places: [...ring(24, 21), ...ring(28, 26.5)] },
          { kind: 'banner', places: ring(8, 33) },
          { kind: 'lantern', places: ring(6, 31) },
          { kind: 'bamboo', places: grid(50, 92, seed).filter((pl) => Math.hypot(pl.x, pl.z) > 38) }
        ]
      };
    case 'camp':
      // A rest stop on a hunting road: a cleared pad off the trail with a fire ring,
      // drying racks, benches and the hunters' gear stacked where they dropped it.
      return {
        ...base,
        timeOfDay: 0.42,
        paths: [{ from: [-58, 26], to: [58, -14], width: 7 }],
        props: [
          { kind: 'awning', places: [
            { x: -12, z: -10, rotation: 0, scale: 1.3 }, { x: 8, z: -14, rotation: 0.4, scale: 1.2 }
          ] },
          { kind: 'brazier', places: [{ x: -2, z: -6 }] },
          { kind: 'pew', places: ring(5, 7).map((pl, i) => ({ ...pl, x: pl.x - 2, z: pl.z - 6, rotation: -(i / 5) * Math.PI * 2 })) },
          { kind: 'crate', places: grid(14, 30, seed + 2, 1.1).map((pl) => ({ ...pl, x: pl.x - 6, z: pl.z - 12 })) },
          { kind: 'stall', places: [{ x: -18, z: -4, rotation: 0.6, scale: 1 }] },
          { kind: 'villager', places: [{ x: -5, z: -8 }, { x: 2, z: -3 }, { x: -14, z: -12 }] },
          { kind: 'lantern', places: [{ x: -9, z: -1 }, { x: 5, z: -12 }] },
          { kind: 'bamboo', places: grid(90, 122, seed, 1.2).filter((pl) => Math.hypot(pl.x + 4, pl.z + 8) > 26) },
          { kind: 'tree', places: grid(14, 116, seed + 6).filter((pl) => Math.hypot(pl.x + 4, pl.z + 8) > 30) },
          { kind: 'rock', places: grid(12, 114, seed + 8).filter((pl) => Math.hypot(pl.x + 4, pl.z + 8) > 24) }
        ]
      };
    case 'gate': {
      // An approach, not a clearing. A broad stone-flagged road runs straight at a gate
      // in a wall, and the wall closes the view to either side of it, so the only way
      // through the picture is the one everybody else also has to use.
      const wall = (from: number, to: number) =>
        Array.from({ length: Math.round((to - from) / 3.4) }, (_, i) => ({
          x: from + i * 3.4, z: -34, rotation: 0, scale: 0.5
        }));
      return {
        ...base,
        timeOfDay: 0.52,
        paths: [{ from: [0, 60], to: [0, -32], width: 14 }],
        props: [
          { kind: 'pillar', places: [
            { x: -7, z: -34, rotation: 0, scale: 0.8 }, { x: 7, z: -34, rotation: 0, scale: 0.8 }
          ] },
          { kind: 'crate', places: [...wall(-58, -9), ...wall(9, 58)].map((pl) => ({ ...pl, scale: 2.6 })) },
          { kind: 'banner', places: [{ x: -10, z: -33 }, { x: 10, z: -33 }] },
          { kind: 'lantern', places: [{ x: -8.5, z: -30 }, { x: 8.5, z: -30 }, { x: -8.5, z: -12 }, { x: 8.5, z: -12 }] },
          // Two guards at the gate, and people queueing back down the road.
          { kind: 'villager', places: [
            { x: -4.5, z: -30 }, { x: 4.5, z: -30 },
            { x: -2, z: -20 }, { x: 3, z: -14 }, { x: -3.5, z: -4 }, { x: 1, z: 8 }
          ] },
          { kind: 'bamboo', places: grid(70, 122, seed, 1.2).filter((pl) => Math.abs(pl.x) > 20 || pl.z < -38) },
          { kind: 'tree', places: grid(12, 118, seed + 6).filter((pl) => Math.abs(pl.x) > 26) }
        ]
      };
    }
    case 'hollow':
      // Somewhere chosen because it cannot be seen into: a bowl of rock with one gap in
      // the rim, a fire that is kept small, and no path leading to it at all.
      return {
        ...base,
        ground: 0x5c6b44,
        fog: { color: 0x22321f, near: 30, far: 96 },
        timeOfDay: 0.3,
        props: [
          // The rim. One gap, at the south, so the hollow has a way in.
          { kind: 'rock', places: ring(26, 26)
            .filter((pl) => !(pl.z > 18 && Math.abs(pl.x) < 10))
            .map((pl) => ({ ...pl, scale: 1.9 })) },
          { kind: 'rock', places: ring(22, 32).map((pl) => ({ ...pl, scale: 1.5 })) },
          { kind: 'brazier', places: [{ x: -3.5, z: -3.5 }] },
          { kind: 'crate', places: grid(9, 16, seed + 2) },
          { kind: 'awning', places: [{ x: -8, z: -8, rotation: 0.3, scale: 1.1 }] },
          { kind: 'villager', places: [{ x: -4, z: -5 }, { x: 5, z: 1 }] },
          { kind: 'tree', places: grid(26, 120, seed + 6).filter((pl) => Math.hypot(pl.x, pl.z) > 38) },
          { kind: 'bamboo', places: grid(80, 124, seed, 1.2).filter((pl) => Math.hypot(pl.x, pl.z) > 36) }
        ]
      };
    case 'trail':
      // A trail beaten through scrub by something heavy: churned mud, wallows, snapped
      // stalks where it shouldered through. It winds, so you cannot see far along it.
      return {
        ...base,
        ground: 0x5f6a45,
        timeOfDay: 0.38,
        paths: [
          { from: [-52, 58], to: [-14, 14], width: 6 },
          { from: [-14, 14], to: [22, -8], width: 6 },
          { from: [22, -8], to: [12, -56], width: 6 }
        ],
        water: [
          { x: -16, z: 20, w: 11, d: 8, color: 0x2f2a1a },
          { x: 20, z: -18, w: 9, d: 12, color: 0x2f2a1a }
        ],
        props: [
          { kind: 'bamboo', places: grid(150, 122, seed, 1.25) },
          { kind: 'reed', places: grid(70, 118, seed + 3, 1.3) },
          // Snapped stalks lying where the boar went through.
          { kind: 'bamboo', places: grid(18, 90, seed + 21).map((pl) => ({
            ...pl, y: 0.3, rotation: pl.rotation, scale: 0.7
          })) },
          { kind: 'rock', places: grid(18, 116, seed + 12) },
          { kind: 'tree', places: grid(10, 114, seed + 6) }
        ]
      };
    case 'deep-forest':
      // Old forest, closed in: high canopy, fog in among the trunks, no road. The wolf
      // tide comes out of this, so the point of it is that you cannot see what is coming.
      return {
        ...base,
        ground: 0x3c5230,
        sky: 0x5d7a72,
        fog: { color: 0x1b2a24, near: 16, far: 72 },
        timeOfDay: 0.22,
        props: [
          { kind: 'tree', places: grid(74, 122, seed + 6, 1.15).map((pl) => ({ ...pl, scale: 1.25 })) },
          { kind: 'bamboo', places: grid(120, 120, seed, 1.2) },
          { kind: 'rock', places: grid(26, 116, seed + 12) },
          { kind: 'reed', places: grid(40, 112, seed + 17, 1.3) }
        ]
      };
    case 'forest':
    default:
      return {
        ...base,
        paths: [{ from: [0, 58], to: [0, -58], width: 6 }],
        props: [
          { kind: 'bamboo', places: grid(190, 120, seed, 1.15) },
          { kind: 'tree', places: grid(20, 116, seed + 6) },
          { kind: 'rock', places: grid(22, 114, seed + 12) }
        ]
      };
  }
  void half;
}

const byId = new Map<string, AreaDescription>(HAND_LAID.map((a) => [a.id, a]));
for (const area of canonAreas) if (!byId.has(area.id)) byId.set(area.id, derive(area));

export const AREAS: ReadonlyMap<string, AreaDescription> = byId;
export const HAND_LAID_IDS: ReadonlySet<string> = new Set(HAND_LAID.map((a) => a.id));

export function areaDescription(id: string): AreaDescription {
  const found = byId.get(id);
  if (!found) throw new Error(`No area description for ${id}`);
  return found;
}
