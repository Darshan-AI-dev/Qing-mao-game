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
  ground: 0x2a2430,
  sky: 0x1b1420,
  fog: { color: 0x1b1420, near: 20, far: 78 },
  enclosed: false,
  timeOfDay: 0.04,
  paths: [{ from: [0, 40], to: [0, -40], width: 9 }],
  props: [
    { kind: 'pillar', places: ring(10, 34) },
    { kind: 'rock', places: grid(28, 80, 77) },
    { kind: 'lantern', places: ring(6, 20) }
  ],
  blockers: []
};

/** Where he wakes. Rain on the roof, an open window, a thin blanket. */
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
    { kind: 'crate', places: [{ x: -5.4, z: -6 }, { x: -5.4, z: -4.2 }, { x: 5.6, z: 5.8 }] },
    { kind: 'lantern', places: [{ x: 0, z: -8 }] }
  ],
  blockers: [{ x: -5.4, z: -5, w: 1.4, d: 2.4 }]
};

/** Pale-green two-storey bamboo houses on wooden stakes over uneven ground. */
const village: AreaDescription = {
  id: 'mountain.village',
  size: { x: 180, z: 180 },
  ground: 0x314f43,
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
    { kind: 'villager', places: [
      { x: -10, z: -44 }, { x: 4, z: -40 }, { x: -26, z: -30 }, { x: 18, z: -20 },
      { x: -16, z: 12 }, { x: 26, z: 10 }, { x: -40, z: -6 }, { x: 0, z: 6 }
    ] },
    { kind: 'lantern', places: [{ x: -2, z: -40 }, { x: -2, z: -20 }, { x: -2, z: 0 }, { x: -2, z: 20 }, { x: 18, z: 2 }, { x: -22, z: 2 }] }
  ]
};

/** A clear, faintly blue river; moon orchids with jade stems on the far bank. */
const awakeningRiver: AreaDescription = {
  id: 'mountain.awakening-river',
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
  ground: 0x3a5246,
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
    { kind: 'villager', places: [{ x: -8, z: 24 }, { x: 6, z: 26 }, { x: -14, z: 16 }, { x: 16, z: 20 }, { x: 2, z: 34 }, { x: -4, z: 14 }] },
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
  props: [
    { kind: 'crate', places: ring(10, 9.6) },
    { kind: 'lantern', places: [{ x: -6, z: -6 }, { x: 6, z: -6 }, { x: 0, z: 8 }] }
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
  props: [
    { kind: 'crate', places: grid(14, 22, 1212) },
    { kind: 'villager', places: [{ x: -7, z: -4 }, { x: -4, z: 2 }, { x: 6, z: -2 }, { x: 8, z: 6 }, { x: 0, z: 8 }] },
    { kind: 'lantern', places: [{ x: -9, z: -9 }, { x: 9, z: -9 }, { x: -9, z: 9 }, { x: 9, z: 9 }] }
  ]
};

const bambooGrove: AreaDescription = {
  id: 'mountain.bamboo-grove',
  size: { x: 140, z: 140 },
  ground: 0x2a4536,
  sky: 0x4a6470,
  fog: { color: 0x22383c, near: 30, far: 120 },
  enclosed: false,
  timeOfDay: 0.85,
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
  ground: 0x26402f,
  sky: 0x2c3b46,
  fog: { color: 0x1a262c, near: 22, far: 96 },
  enclosed: false,
  timeOfDay: 0.92,
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
    { kind: 'villager', places: [{ x: -5, z: -4 }, { x: 4, z: -3 }, { x: 0, z: 6 }] },
    { kind: 'lantern', places: [{ x: -8, z: -8 }, { x: 8, z: -8 }] }
  ]
};

const HAND_LAID: AreaDescription[] = [
  prologue, hostelRoom, village, awakeningRiver, academy, guRoom,
  trainingYard, tavern, bambooGrove, bambooPath, flowerWineCave, uncleHouse
];

// ------------------------------------------------------- generated areas

/**
 * A layout derived from the canon bible for any area that has not been hand-laid
 * yet. Reads `outdoor`, `ceiling`, `dark` and `weather`, so a generated cave is
 * enclosed and dark and a generated outdoor area is not.
 */
function derive(area: CanonArea): AreaDescription {
  const seed = [...area.id].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const big = area.outdoor;
  const size = big ? { x: 132, z: 132 } : { x: 34, z: 32 };
  const cold = area.weather === 'snow';
  return {
    id: area.id,
    size,
    ground: area.ceiling ? 0x3b4448 : cold ? 0x8fb4bb : 0x34503f,
    sky: area.ceiling ? 0x121a1d : cold ? 0xbcd6de : 0x9db9c4,
    fog: area.dark
      ? { color: 0x0d1214, near: 8, far: 46 }
      : cold
        ? { color: 0x9cbcc4, near: 40, far: 140 }
        : { color: area.ceiling ? 0x1d272b : 0x2b4a52, near: big ? 50 : 16, far: big ? 130 : 42 },
    enclosed: area.ceiling,
    dark: area.dark ?? false,
    ceilingHeight: area.dark ? 18 : area.ceiling ? 6.4 : undefined,
    timeOfDay: area.dark ? 0 : 0.45,
    buildings: big
      ? []
      : [{ x: 0, z: -10, w: Math.min(22, size.x - 8), d: 10, h: 5, stilts: false, floors: area.floors ?? 1 }],
    paths: big ? [{ from: [0, size.z / 2 - 6], to: [0, -size.z / 2 + 6], width: 6 }] : [],
    props: big
      ? [
          { kind: area.dark ? 'pillar' : 'bamboo', places: grid(area.dark ? 26 : 180, size.x - 16, seed) },
          { kind: 'rock', places: grid(30, size.x - 12, seed + 7) },
          { kind: 'tree', places: cold || area.dark ? [] : grid(18, size.x - 20, seed + 13) },
          { kind: 'lantern', places: ring(4, 18) }
        ]
      : [
          { kind: 'crate', places: grid(8, size.x - 14, seed) },
          { kind: 'villager', places: [{ x: -4, z: -2 }, { x: 4, z: 0 }] },
          { kind: 'lantern', places: [{ x: -8, z: -7 }, { x: 8, z: -7 }] }
        ]
  };
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
