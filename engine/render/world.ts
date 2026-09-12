/**
 * World building primitives.
 *
 * Areas are described declaratively by the content package and assembled here into
 * chunks. Repeated props — bamboo, rocks, villagers, lanterns, pillars — go through
 * InstancedMesh so a dense grove costs one draw call instead of three hundred.
 *
 * Enclosed areas get a real ceiling. The previous build rendered the "underground"
 * stone forest under open sky; `enclosed: true` is what fixes that, and the content
 * lint cross-checks it against the canon bible's `ceiling` flag.
 */
import {
  BoxGeometry, BufferAttribute, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide,
  Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, SphereGeometry,
  BufferGeometry, PlaneGeometry, Quaternion, RingGeometry, Vector3, type Material
} from 'three';
import { detailLevel, surface, type Detail, type Surface, type SurfaceOptions } from './surfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';

export interface Blocker {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface PropPlacement {
  x: number;
  z: number;
  y?: number;
  scale?: number;
  rotation?: number;
}

export type PropKind =
  | 'bamboo' | 'rock' | 'tree' | 'villager' | 'lantern' | 'pillar' | 'crate' | 'orchid'
  // Interior furniture. The chapter 3 room is described down to the window latch and
  // the stones by the bed, so those have to exist as objects, not as narration.
  | 'bed' | 'table' | 'stool' | 'chest' | 'shelf' | 'window'
  // Area-archetype props, so a hall, a market and a forge are not the same empty box.
  | 'pew' | 'dais' | 'stall' | 'awning' | 'furnace' | 'brazier' | 'desk' | 'jar'
  | 'snowdrift' | 'pine' | 'icespike' | 'terrace' | 'reed' | 'raft' | 'banner';

export interface AreaDescription {
  id: string;
  /** Playable extent; the ground plane and the ceiling are sized from this. */
  size: { x: number; z: number };
  ground: number;
  sky: number;
  fog: { color: number; near: number; far: number };
  /** Interiors and caves. Draws a ceiling and switches the lighting to underground. */
  enclosed: boolean;
  dark?: boolean;
  timeOfDay: number;
  props: { kind: PropKind; places: PropPlacement[] }[];
  buildings?: { x: number; z: number; w: number; d: number; h: number; stilts?: boolean; floors?: number }[];
  /** A trodden way. `color` for ground a dirt track would be wrong on, such as snow. */
  paths?: { from: [number, number]; to: [number, number]; width?: number; color?: number }[];
  water?: { x: number; z: number; w: number; d: number; color: number }[];
  /** Ceilings can be raised locally, e.g. the stone forest's vault. */
  ceilingHeight?: number;
  /**
   * Shell colours for an enclosed area. Three halls built from the same boards are
   * three pictures of the same hall; the Bai clan's is meant to read as somewhere
   * else the moment you walk in, so the shell has to be able to change with it.
   */
  interior?: { floor?: number; wall?: number; ceiling?: number };
  /**
   * Whether anything here can be picked. Defaults to true outdoors, false inside.
   *
   * The default gets the Bai clan's audience hall and the Gu room's orchid trays right
   * — those are furnishings — and the underground awakening river wrong, because the
   * canon item list says the moon orchid petals are "gathered near the awakening
   * river, or bought". Enclosed is not the same as built, so the content says which.
   */
  gathering?: boolean;
  /** Hand-placed interior details: blankets, window mullions, a bag of stones. */
  dressing?: InteriorDressing[];
  blockers?: Blocker[];
}

export interface BuiltArea {
  group: Group;
  chunks: { group: Group; centre: Vector3; radius: number }[];
  blockers: Blocker[];
  lanterns: { x: number; y: number; z: number }[];
}

const CHUNK_SIZE = 48;

/**
 * Every prop names the material it is made of, not just a colour.
 *
 * `mat()` used to return a flat Lambert material, so a crate, a stone pillar, a silk
 * banner and a straw awning differed only in hue. They are different substances now:
 * the surface decides roughness, how metallic it is, and which generated grain and
 * normal map it wears. See `surfaces.ts`.
 */
const mat = (kind: Surface, hex: number, options: SurfaceOptions = {}) => surface(kind, hex, options);

const PALETTE = {
  grass: 0x4f6c4e, path: 0x7d7758, wood: 0x49331f, roof: 0x27494a, wall: 0x8f8d64,
  rock: 0x3e5457, bamboo: 0x38744c, leaf: 0x265f45, stone: 0x4a5458, water: 0x2f6f86,
  cloth: 0xa6a383, orchid: 0xbcc8ee, ceiling: 0x1b2326, gold: 0xf0b047,
  // A room is not a cave. Interiors get bamboo and boards rather than wet rock.
  roomFloor: 0x6b5535, roomWall: 0x7c7a55, roomCeiling: 0x3c3323
};

function propGeometry(kind: PropKind): { geometry: BufferGeometry; material: Material; blocker?: Blocker } {
  switch (kind) {
    // Qing Mao's bamboo is straight with a spear-sharp tip, per the source text.
    case 'bamboo': return { geometry: bambooGeometry(detailLevel()), material: surface('foliage', 0xffffff, { vertexColors: true }), blocker: { x: 0, z: 0, w: 0.3, d: 0.3 } };
    case 'rock': return { geometry: rockGeometry(), material: mat('stone', PALETTE.rock), blocker: { x: 0, z: 0, w: 1.4, d: 1.4 } };
    case 'tree': return { geometry: treeGeometry(detailLevel()), material: surface('foliage', 0xffffff, { vertexColors: true }), blocker: { x: 0, z: 0, w: 1, d: 1 } };
    // Not a cone. A pale seven-sided cone at 1.9 tall is fine as a distant crowd and
    // looks like a traffic cone the moment the camera is in the same room as one — on
    // a phone, where interiors put the camera close, the hall and the tavern each had
    // a cream cone standing next to the player.
    case 'villager': return {
      geometry: villagerGeometry(),
      material: surface('cloth', 0xffffff, { vertexColors: true })
    };
    // A post with a paper lamp on it. The post alone was a bare brown stick that read
    // as a pole planted in the floor, and in the Gu room one stood directly behind the
    // player and looked like part of him.
    // Paper over a flame. It carries the light the area already places at its top, so
    // now that bloom exists the shade should be the thing that glows rather than a
    // slightly paler cylinder next to a point light.
    case 'lantern': return { geometry: lanternGeometry(), material: surface('paper', 0xffffff, { vertexColors: true, emissive: 0xffa64d, emissiveIntensity: 0.55 }), blocker: { x: 0, z: 0, w: 0.2, d: 0.2 } };
    case 'pillar': return { geometry: new CylinderGeometry(1.5, 2.1, 22, 7), material: mat('stone', PALETTE.stone), blocker: { x: 0, z: 0, w: 1.8, d: 1.8 } };
    case 'crate': return { geometry: new BoxGeometry(1.2, 1, 1.2), material: mat('wood', PALETTE.wood), blocker: { x: 0, z: 0, w: 0.7, d: 0.7 } };
    case 'orchid': return { geometry: new ConeGeometry(0.22, 0.6, 5), material: mat('foliage', PALETTE.orchid) };
    case 'bed': return { geometry: new BoxGeometry(2.0, 0.42, 3.1), material: mat('wood', PALETTE.wood), blocker: { x: 0, z: 0, w: 1.1, d: 1.7 } };
    case 'table': return { geometry: new BoxGeometry(1.5, 0.08, 0.95), material: mat('wood', PALETTE.wood), blocker: { x: 0, z: 0, w: 0.8, d: 0.55 } };
    case 'stool': return { geometry: new CylinderGeometry(0.26, 0.3, 0.44, 8), material: mat('wood', PALETTE.wood), blocker: { x: 0, z: 0, w: 0.3, d: 0.3 } };
    case 'chest': return { geometry: new BoxGeometry(1.1, 0.62, 0.66), material: mat('wood', PALETTE.wood), blocker: { x: 0, z: 0, w: 0.6, d: 0.4 } };
    case 'shelf': return { geometry: new BoxGeometry(1.8, 0.07, 0.42), material: mat('wood', PALETTE.wood) };
    // A pale panel standing in for daylight through an opening, with its frame.
    case 'window': return { geometry: new BoxGeometry(1.7, 1.5, 0.12), material: mat('paper', 0x9fc6d2, { emissive: 0x32505c, emissiveIntensity: 1 }) };
    // --- halls and rooms
    case 'pew': return { geometry: new BoxGeometry(3.6, 0.36, 0.7), material: mat('wood', PALETTE.wood), blocker: { x: 0, z: 0, w: 1.8, d: 0.4 } };
    case 'dais': return { geometry: new BoxGeometry(7, 0.5, 4), material: mat('wood', 0x5a4a30), blocker: { x: 0, z: 0, w: 3.4, d: 2 } };
    case 'desk': return { geometry: new BoxGeometry(1.9, 0.12, 0.7), material: mat('wood', PALETTE.wood), blocker: { x: 0, z: 0, w: 1, d: 0.4 } };
    case 'banner': return { geometry: new BoxGeometry(1.1, 3.2, 0.08), material: mat('cloth', 0x6d3630) };
    // A working furnace is hot enough to see. Enough emission to warm the stone and
    // catch the bloom without turning the whole vessel into a lamp.
    case 'furnace': return { geometry: new CylinderGeometry(1.25, 1.5, 2.6, 8), material: mat('stone', 0x4a2f22, { emissive: 0xc4400c, emissiveIntensity: 0.3 }), blocker: { x: 0, z: 0, w: 1.4, d: 1.4 } };
    // Burning coals, not a bucket. The old emissive was so dim it never cleared the
    // bloom threshold, so a brazier in a forge was a dull red cylinder standing next to
    // a fire that existed only as a point light.
    case 'brazier': return { geometry: new CylinderGeometry(0.5, 0.34, 0.7, 8), material: mat('metal', 0x8a3b16, { emissive: 0xff5a12, emissiveIntensity: 1.1, roughness: 0.7 }) };
    // --- market
    case 'stall': return { geometry: new BoxGeometry(2.6, 1.05, 1.5), material: mat('wood', 0x6a5230), blocker: { x: 0, z: 0, w: 1.4, d: 0.9 } };
    case 'awning': return { geometry: new BoxGeometry(3.2, 0.1, 2.2), material: mat('cloth', 0x8a4a3a) };
    // --- winter
    // Snow is bright and slightly softer than bare earth, and takes almost no grain.
    case 'snowdrift': return { geometry: new ConeGeometry(2.6, 1.1, 7), material: mat('earth', 0xdde9ee, { roughness: 0.8 }) };
    // Ice is the smoothest thing in the game, so it is the one surface that visibly
    // mirrors the sky now that there is a sky to mirror.
    case 'icespike': return { geometry: new ConeGeometry(1.1, 6.5, 5), material: mat('stone', 0xa9cfdb, { roughness: 0.09, metalness: 0.05 }), blocker: { x: 0, z: 0, w: 0.9, d: 0.9 } };
    case 'pine': return { geometry: pineGeometry(detailLevel()), material: surface('foliage', 0xffffff, { vertexColors: true }), blocker: { x: 0, z: 0, w: 0.9, d: 0.9 } };
    // --- cultivation and water
    case 'terrace': return { geometry: new BoxGeometry(11, 0.5, 3.4), material: mat('earth', 0x4a5a34), blocker: { x: 0, z: 0, w: 5.5, d: 1.7 } };
    case 'reed': return { geometry: new CylinderGeometry(0.05, 0.07, 2.4, 4), material: mat('foliage', 0x6d7a3e) };
    // The tavern is named for its wine and did not contain a single vessel.
    case 'jar': return { geometry: jarGeometry(), material: surface('paper', 0xffffff, { vertexColors: true }), blocker: { x: 0, z: 0, w: 0.3, d: 0.3 } };
    case 'raft': return { geometry: new BoxGeometry(4.2, 0.24, 6.4), material: mat('wood', 0x5a4326), blocker: { x: 0, z: 0, w: 2.1, d: 3.2 } };
  }
}

const UP = new Vector3(0, 1, 0);

export function buildArea(description: AreaDescription, budget: { instanceBudget: number; shadows: string }): BuiltArea {
  const root = new Group();
  root.name = `area:${description.id}`;
  const shell = new Group();
  shell.name = `shell:${description.id}`;
  const buildingGroup = new Group();
  buildingGroup.name = `buildings:${description.id}`;
  root.add(shell, buildingGroup);
  const blockers: Blocker[] = [...(description.blockers ?? [])];
  const lanterns: { x: number; y: number; z: number }[] = [];
  const castShadow = budget.shadows !== 'blob';
  const rng = new Rng(hash(description.id));

  // --- ground and ceiling
  //
  // An enclosed area is either a cave or a room, and they should not be built from the
  // same wet grey stone. `dark` is what separates them.
  const cave = description.enclosed && (description.dark ?? false);
  const room = description.enclosed && !cave;
  // Outdoor floors used the one grass colour for every area in the game, so `ground`
  // — the field each area sets to say what it is standing on — did nothing at all. The
  // glacier, the river silt and the arena dust were all the same dark green, and only
  // the fog colour made them look different from one another.
  const floorColour = description.interior?.floor
    ?? (cave ? PALETTE.stone : room ? PALETTE.roomFloor : description.ground ?? PALETTE.grass);
  const shellColour = description.interior?.wall ?? (cave ? PALETTE.ceiling : PALETTE.roomWall);
  const ceilingColour = description.interior?.ceiling
    ?? (cave ? PALETTE.ceiling : PALETTE.roomCeiling);
  const ground = new Mesh(new PlaneGeometry(description.size.x, description.size.z), mat(description.enclosed ? 'wood' : 'earth', floorColour));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = castShadow;
  shell.add(ground);

  // --- ground variation
  //
  // One flat plane in one flat colour is not ground, it is a background. At the play
  // camera the hunter's rest, the boar trail and the wolf forest were each a single
  // untextured green field with a few stalks on it and no horizon to speak of. A
  // scatter of wide, soft patches in neighbouring tones breaks that up for one extra
  // draw call, and costs nothing on a phone.
  if (!description.enclosed) {
    const patchRng = new Rng(hash(`${description.id}:ground`));
    const count = 26;
    // White material: an InstancedMesh multiplies the material colour by the per-
    // instance colour, so tinting both meant every patch came out as the ground colour
    // squared — twenty-six near-black discs laid over the floor.
    // No `vertexColors` here. An InstancedMesh takes its per-instance tint from
    // `setColorAt`, which three wires up on its own; asking for vertex colours as well
    // makes the shader look for an attribute `CircleGeometry` does not have, reads
    // zero, and paints twenty-six black discs up to twenty-two metres across over the
    // foreground of every outdoor area.
    const patches = new InstancedMesh(new CircleGeometry(1, 10), mat('earth', 0xffffff), count);
    patches.receiveShadow = castShadow;
    const base = new Color(floorColour);
    const matrix = new Matrix4();
    const tint = new Color();
    for (let i = 0; i < count; i++) {
      const radius = 6 + patchRng.next() * 16;
      matrix.makeRotationX(-Math.PI / 2);
      matrix.scale(new Vector3(radius, radius, radius));
      matrix.setPosition(
        (patchRng.next() - 0.5) * description.size.x * 0.92,
        0.015,
        (patchRng.next() - 0.5) * description.size.z * 0.92
      );
      patches.setMatrixAt(i, matrix);
      // Neighbouring tones, never a different colour: this is meant to read as ground
      // that is not perfectly even, not as a pattern painted on it.
      tint.copy(base).offsetHSL((patchRng.next() - 0.5) * 0.04, (patchRng.next() - 0.5) * 0.1, (patchRng.next() - 0.5) * 0.14);
      patches.setColorAt(i, tint);
    }
    patches.instanceMatrix.needsUpdate = true;
    if (patches.instanceColor) patches.instanceColor.needsUpdate = true;
    patches.frustumCulled = false;
    shell.add(patches);
  }

  if (description.enclosed) {
    const height = description.ceilingHeight ?? 14;
    const ceiling = new Mesh(new PlaneGeometry(description.size.x, description.size.z), mat('wood', ceilingColour));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    shell.add(ceiling);
    // Four walls, so a cave reads as a cave from inside rather than a floor in a void.
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const wall = new Mesh(
        new PlaneGeometry(sx ? description.size.z : description.size.x, height),
        mat(description.enclosed ? 'wood' : 'stone', shellColour)
      );
      wall.position.set((sx * description.size.x) / 2, height / 2, (sz * description.size.z) / 2);
      wall.rotation.y = sx ? -sx * Math.PI / 2 : sz > 0 ? Math.PI : 0;
      shell.add(wall);
    }

    // Rooms are carpentered; caves are not.
    if (!cave) {
      const frame = interiorFrame(description.size.x, description.size.z, height, detailLevel());
      if (frame) {
        const timber = new Mesh(frame, surface('wood', 0xffffff, { vertexColors: true }));
        timber.castShadow = castShadow;
        timber.receiveShadow = castShadow;
        shell.add(timber);
      }
    }
  }

  // --- paths
  for (const path of description.paths ?? []) {
    const [x1, z1] = path.from;
    const [x2, z2] = path.to;
    const length = Math.hypot(x2 - x1, z2 - z1);
    const strip = new Mesh(new PlaneGeometry(path.width ?? 4, length), mat('earth', path.color ?? PALETTE.path));
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
    strip.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2);
    strip.receiveShadow = castShadow;
    shell.add(strip);
  }

  // --- the skyline
  if (!description.enclosed) {
    const ridges = new Mesh(
      horizonGeometry(detailLevel()),
      surface('stone', 0xffffff, { vertexColors: true, roughness: 1, fog: false })
    );
    ridges.frustumCulled = false;
    shell.add(ridges);
  }

  // --- ground scatter: tufts and pebbles, one instanced mesh each for the whole area
  if (!description.enclosed) {
    const detail = detailLevel();
    const scatterRng = new Rng(hash(`${description.id}:scatter`));
    const onPath = (x: number, z: number): boolean =>
      (description.paths ?? []).some((path) => {
        const [ax, az] = path.from;
        const [bx, bz] = path.to;
        const dx = bx - ax;
        const dz = bz - az;
        const length2 = dx * dx + dz * dz || 1;
        // Distance from the point to the segment, so nothing sprouts through a road.
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
        return Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < (path.width ?? 4) * 0.62;
      });

    // Scattered across a disc around the middle rather than the whole area, and sized
    // for a density rather than a count. Four hundred tufts spread over a 180 metre
    // village is one every fifty-seven square metres, which is invisible — the first
    // attempt rendered twenty thousand triangles of grass that could not be seen.
    const reach = Math.min(46, Math.max(description.size.x, description.size.z) / 2);
    for (const [kind, geometry, perSquareMetre, cap, lift] of [
      ['grass', grassGeometry(), detail === 'low' ? 0.06 : 0.28, detail === 'low' ? 150 : 1900, 0],
      ['pebble', pebbleGeometry(), 0.02, detail === 'low' ? 24 : 150, 0.04]
    ] as const) {
      const count = Math.min(cap, Math.round(Math.PI * reach * reach * perSquareMetre));
      const places: { x: number; z: number }[] = [];
      // Twice as many attempts as places wanted: rejected ones fell on a path.
      for (let i = 0; i < count * 2 && places.length < count; i++) {
        // sqrt keeps the disc evenly covered instead of crowding the middle.
        const radius = Math.sqrt(scatterRng.next()) * reach;
        const angle = scatterRng.next() * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (!onPath(x, z)) places.push({ x, z });
      }
      if (!places.length) continue;
      const scatter = new InstancedMesh(
        geometry,
        surface(kind === 'grass' ? 'foliage' : 'stone', 0xffffff, { vertexColors: true }),
        places.length
      );
      scatter.receiveShadow = castShadow;
      const matrix = new Matrix4();
      for (const [i, place] of places.entries()) {
        const scale = 0.7 + scatterRng.next() * 0.75;
        matrix.makeRotationY(scatterRng.next() * Math.PI * 2);
        matrix.scale(new Vector3(scale, scale * (0.8 + scatterRng.next() * 0.5), scale));
        matrix.setPosition(place.x, lift, place.z);
        scatter.setMatrixAt(i, matrix);
      }
      scatter.instanceMatrix.needsUpdate = true;
      scatter.frustumCulled = false;
      shell.add(scatter);
    }
  }

  // --- water
  for (const pool of description.water ?? []) {
    const pond = new Mesh(new PlaneGeometry(pool.w, pool.d), mat('water', pool.color));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(pool.x, 0.05, pool.z);
    shell.add(pond);
  }

  // --- buildings: timber-framed houses on stakes, all of them merged into two meshes
  const houseBody: BufferGeometry[] = [];
  const houseRoof: BufferGeometry[] = [];
  for (const building of description.buildings ?? []) {
    const parts = houseParts(building, detailLevel());
    houseBody.push(...parts.body);
    houseRoof.push(...parts.roof);
    blockers.push({ x: building.x, z: building.z, w: building.w / 2 + 0.7, d: building.d / 2 + 0.7 });
  }
  for (const [parts, kind, hex] of [[houseBody, 'wood', 0xffffff], [houseRoof, 'thatch', 0xffffff]] as const) {
    if (!parts.length) continue;
    const merged = mergeGeometries(parts, false);
    if (!merged) continue;
    const mesh = new Mesh(merged, surface(kind, hex, { vertexColors: true }));
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    buildingGroup.add(mesh);
  }

  // --- instanced props, bucketed into chunks first
  //
  // An InstancedMesh sits at the origin however far its instances spread, so the
  // instances have to be split by position before the mesh is built. Chunking the
  // finished meshes instead collapses a whole area into one chunk, which then culls
  // as a single unit and draws nothing.
  const propChunks = new Map<string, Group>();
  // Tight per-chunk bounds computed from what actually lands in the chunk. A fixed
  // radius has to be generous enough for the worst case, which in a small area means
  // every sphere contains the camera and nothing is ever culled.
  const propBounds = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }>();
  const cols = Math.max(1, Math.ceil(description.size.x / CHUNK_SIZE));
  const rows = Math.max(1, Math.ceil(description.size.z / CHUNK_SIZE));
  const clamp = (value: number, max: number) => Math.min(max - 1, Math.max(0, value));
  const chunkKey = (x: number, z: number) =>
    `${clamp(Math.floor((x + description.size.x / 2) / CHUNK_SIZE), cols)}:` +
    `${clamp(Math.floor((z + description.size.z / 2) / CHUNK_SIZE), rows)}`;
  const growBounds = (key: string, x: number, z: number, top: number): void => {
    const bounds = propBounds.get(key);
    if (!bounds) {
      propBounds.set(key, { minX: x, maxX: x, minZ: z, maxZ: z, maxY: top });
      return;
    }
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
    bounds.maxY = Math.max(bounds.maxY, top);
  };

  const chunkGroup = (key: string): Group => {
    let group = propChunks.get(key);
    if (!group) {
      group = new Group();
      group.name = `chunk:${description.id}:${key}`;
      propChunks.set(key, group);
      root.add(group);
    }
    return group;
  };

  for (const group of description.props) {
    const places = group.places.slice(0, budget.instanceBudget);
    if (!places.length) continue;

    const buckets = new Map<string, PropPlacement[]>();
    for (const place of places) {
      const key = chunkKey(place.x, place.z);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(place);
      else buckets.set(key, [place]);
    }

    for (const [key, bucket] of buckets) {
      const { geometry, material, blocker } = propGeometry(group.kind);
      const instanced = new InstancedMesh(geometry, material, bucket.length);
      instanced.castShadow = castShadow && group.kind !== 'villager';
      instanced.receiveShadow = castShadow;
      const matrix = new Matrix4();
      const quaternion = new Quaternion();
      const scaleVector = new Vector3();
      const position = new Vector3();
      bucket.forEach((place, i) => {
        const scale = place.scale ?? 0.85 + rng.next() * 0.4;
        position.set(place.x, (place.y ?? 0) + heightOffset(group.kind) * scale, place.z);
        quaternion.setFromAxisAngle(UP, place.rotation ?? rng.next() * Math.PI * 2);
        scaleVector.set(scale, scale, scale);
        matrix.compose(position, quaternion, scaleVector);
        instanced.setMatrixAt(i, matrix);
        if (blocker) blockers.push({ x: place.x, z: place.z, w: blocker.w * scale, d: blocker.d * scale });
        if (group.kind === 'lantern') lanterns.push({ x: place.x, y: 2.9, z: place.z });
        growBounds(key, place.x, place.z, position.y + heightOffset(group.kind) * scale);
      });
      instanced.instanceMatrix.needsUpdate = true;
      // Instances are already in world space, so the mesh must not be culled by its
      // own (origin) bounds; the chunk's bounding sphere is what does the culling.
      instanced.frustumCulled = false;
      instanced.computeBoundingSphere();
      chunkGroup(key).add(instanced);
    }
  }

  if (description.dressing?.length) dressInterior(shell, description.dressing, castShadow);

  // --- assemble the chunk list
  const chunks: { group: Group; centre: Vector3; radius: number }[] = [];
  const diagonal = Math.hypot(description.size.x, description.size.z) / 2;
  // The shell is the area itself: ground, ceiling, walls, paths and water. It is
  // always submitted, because culling the floor you are standing on is never right.
  chunks.push({ group: shell, centre: new Vector3(0, 0, 0), radius: diagonal + 24 });
  if (buildingGroup.children.length) {
    chunks.push({ group: buildingGroup, centre: new Vector3(0, 4, 0), radius: diagonal + 8 });
  }
  for (const [key, group] of propChunks) {
    const bounds = propBounds.get(key);
    if (!bounds) continue;
    const centre = new Vector3(
      (bounds.minX + bounds.maxX) / 2,
      bounds.maxY / 2,
      (bounds.minZ + bounds.maxZ) / 2
    );
    const radius = Math.hypot(
      (bounds.maxX - bounds.minX) / 2,
      bounds.maxY / 2,
      (bounds.maxZ - bounds.minZ) / 2
    // A small margin so a chunk does not pop exactly at the screen edge.
    ) + 4;
    chunks.push({ group, centre, radius });
  }

  return { group: root, chunks, blockers, lanterns };
}

/** A glazed wine jar: swollen body, short neck, a lid. */
function jarGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const body = new SphereGeometry(0.42, 9, 7);
  body.scale(1, 1.18, 1);
  body.translate(0, 0.5, 0);
  parts.push(tinted(body, 0x5d6b62));
  const neck = new CylinderGeometry(0.17, 0.24, 0.26, 8);
  neck.translate(0, 1.02, 0);
  parts.push(tinted(neck, 0x4c584f));
  const lid = new CylinderGeometry(0.22, 0.2, 0.09, 8);
  lid.translate(0, 1.19, 0);
  parts.push(tinted(lid, 0x8a7a58));
  return mergeGeometries(parts, false) ?? parts[0]!;
}

/**
 * The timber frame of a room: rafters overhead, posts down the walls, a skirting board.
 *
 * Interiors were a box — four coloured planes and a floor — so the tavern, the Gu room
 * and the clan hall were the same empty carton in different browns while the outdoors
 * had grown houses, grass and a skyline. Overhead is the half of a room a phone player
 * sees most, because the camera sits low and the ceiling fills the top of the frame the
 * moment they look up, and there was nothing up there at all.
 *
 * All of it merges into one mesh, so a furnished room costs one draw call. A cave gets
 * none of it: rafters in a grotto would be somebody's carpentry.
 */
function interiorFrame(sizeX: number, sizeZ: number, height: number, detail: Detail): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, x: number, y: number, z: number, hex: number) => {
    geometry.translate(x, y, z);
    parts.push(tinted(geometry, hex));
  };
  const beam = 0x4a3524;
  const halfX = sizeX / 2;
  const halfZ = sizeZ / 2;

  // Rafters across the short axis, and a ridge beam down the long one.
  const across = sizeX <= sizeZ;
  const span = across ? sizeX : sizeZ;
  const run = across ? sizeZ : sizeX;
  const count = Math.max(3, Math.round(run / (detail === 'low' ? 6 : 3.2)));
  for (let i = 0; i < count; i++) {
    const at = (i / (count - 1) - 0.5) * (run - 1.4);
    const rafter = across
      ? new BoxGeometry(span - 0.4, 0.24, 0.3)
      : new BoxGeometry(0.3, 0.24, span - 0.4);
    add(rafter, across ? 0 : at, height - 0.42, across ? at : 0, beam);
  }
  add(
    across ? new BoxGeometry(0.34, 0.34, run - 0.6) : new BoxGeometry(run - 0.6, 0.34, 0.34),
    0, height - 0.15, 0, 0x3a2a1c
  );

  // Posts down each wall, and a skirting board where wall meets floor.
  if (detail !== 'low') {
    const posts = (length: number, along: 'x' | 'z', offset: number) => {
      const spacing = Math.max(2, length / Math.max(2, Math.round(length / 4.5)));
      for (let at = -length / 2 + spacing / 2; at < length / 2; at += spacing) {
        add(
          new BoxGeometry(0.26, height, 0.26),
          along === 'x' ? at : offset,
          height / 2,
          along === 'x' ? offset : at,
          beam
        );
      }
    };
    posts(sizeX, 'x', halfZ - 0.2);
    posts(sizeX, 'x', -halfZ + 0.2);
    posts(sizeZ, 'z', halfX - 0.2);
    posts(sizeZ, 'z', -halfX + 0.2);
  }
  for (const [along, length, offset] of [
    ['x', sizeX, halfZ - 0.12], ['x', sizeX, -halfZ + 0.12],
    ['z', sizeZ, halfX - 0.12], ['z', sizeZ, -halfX + 0.12]
  ] as const) {
    add(
      along === 'x' ? new BoxGeometry(length, 0.34, 0.18) : new BoxGeometry(0.18, 0.34, length),
      along === 'x' ? 0 : offset,
      0.17,
      along === 'x' ? offset : 0,
      0x3a2a1c
    );
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}

/**
 * The mountain the place is named after.
 *
 * Outdoor areas ended at a flat horizon where the ground plane met the sky, which on a
 * phone is a third of the frame whenever the player looks up from their feet. This is a
 * ring of ridges well outside the playable area: two bands, the far one paler and
 * taller, so the skyline has depth rather than a single cut-out row.
 *
 * They opt out of fog and carry their haze in their own colour instead. Fog would eat
 * them entirely — they stand far beyond any area's fog distance — and aerial
 * perspective painted into the vertex colours is both cheaper and easier to control.
 */
function horizonGeometry(detail: Detail): BufferGeometry {
  const parts: BufferGeometry[] = [];
  let seed = 9161;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Fixed distances, not multiples of the area.
  //
  // Scaled to the village they landed at about 130 units, which is just outside the
  // playable ground and well inside the fog — so a ridge stood unhazed next to trees
  // that had faded almost to nothing, and read as a tent pitched at the edge of town
  // rather than as a mountain. The ceiling is the camera's far plane, which on the low
  // tier is 170, so everything has to fit inside that and be tall instead of far.
  for (const [ring, count, minHeight, spread, minSpan, spanRange, hex] of [
    // The near band: darker, lower, and broken up.
    [128, detail === 'low' ? 10 : 18, 30, 20, 0.40, 0.22, 0x3a5854],
    // The far band: paler and taller, which is what reads as distance.
    [150, detail === 'low' ? 8 : 14, 58, 34, 0.32, 0.18, 0x74909d]
  ] as const) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.22;
      const distance = ring * (0.94 + rand() * 0.12);
      const height = minHeight + rand() * spread;
      // ConeGeometry's first argument is a radius, not a width. Treating it as a width
      // made a peak 192 units across standing 118 away, so the near band reached back
      // over the village and filled the screen with a pale wall. A ridge has to be
      // narrow enough that its base stays outside the ground it is meant to be behind.
      const peak = new ConeGeometry(height * (minSpan + rand() * spanRange), height, 5 + Math.floor(rand() * 3));
      peak.rotateY(rand() * Math.PI);
      // Squashed on one axis so a ridge is never a perfect cone from any angle.
      peak.scale(1, 1, 0.6 + rand() * 0.55);
      peak.translate(Math.cos(angle) * distance, height / 2 - 6, Math.sin(angle) * distance);
      const shade = new Color(hex).offsetHSL(0, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.07);
      parts.push(tinted(peak, shade.getHex()));
    }
  }
  return mergeGeometries(parts, false) ?? parts[0]!;
}

/**
 * A tuft of grass: three blades crossed so it reads from any angle.
 *
 * The ground was a bare coloured plane, which is most of what a phone player is looking
 * at — the camera sits low and close, so the nearest few metres of floor fill a third
 * of the screen. Scatter is the cheapest thing that fixes that: one instanced mesh for
 * the whole area, a few hundred tufts, and the ground stops being a painted surface.
 */
function grassGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const blade = new BoxGeometry(0.055, 0.5, 0.012);
    // Leaning, and tapering by scaling the top: a vertical rectangle reads as a fence
    // post at this size however small it is.
    blade.translate(0, 0.25, 0);
    blade.rotateZ((i - 1) * 0.34);
    blade.rotateY((i / 3) * Math.PI);
    parts.push(tinted(blade, i === 1 ? 0x5c8f4a : 0x4a7c3e));
  }
  return mergeGeometries(parts, false) ?? parts[0]!;
}

/** A pebble. Lumpy, flattened, and never the same twice thanks to per-instance scale. */
function pebbleGeometry(): BufferGeometry {
  const geometry = new SphereGeometry(0.17, 6, 4);
  const position = geometry.attributes['position'] as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const push = 1 + Math.sin(x * 9 + z * 5) * 0.22;
    position.setXYZ(i, x * push, y * 0.55, z * push);
  }
  geometry.computeVertexNormals();
  return tinted(geometry, 0x6d6a60);
}

/**
 * Colours a part's vertices without throwing away its UVs.
 *
 * `villagerGeometry` deletes `uv` before merging, which was fine when materials were
 * flat colours. The surfaces have grain and normal maps now, and a part with no UVs
 * samples one texel of them forever — so anything that wants to look like a material
 * has to keep them.
 */
function tinted(geometry: BufferGeometry, hex: number): BufferGeometry {
  const colour = new Color(hex);
  const count = geometry.attributes['position']!.count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  return geometry;
}

/**
 * A bamboo culm with nodes and a head of leaves.
 *
 * It was a bare tapered cylinder, and a grove of two hundred and forty of them read as
 * a field of green poles — no leaves anywhere in an area named after the grove. The
 * leaves are flat blades rather than modelled foliage, which is the whole trick: they
 * cost a dozen triangles each, they merge into the same geometry, and the grove is
 * still one instanced draw call.
 */
function bambooGeometry(detail: Detail): BufferGeometry {
  const parts: BufferGeometry[] = [tinted(new CylinderGeometry(0.11, 0.16, 9, 6), PALETTE.bamboo)];
  // Nodes: the rings a bamboo is segmented by, and the cue that reads as bamboo
  // rather than as a pole, even in silhouette.
  const nodes = detail === 'low' ? 3 : 5;
  for (let i = 0; i < nodes; i++) {
    const ring = new CylinderGeometry(0.155, 0.155, 0.12, 6);
    ring.translate(0, -4 + i * (7.6 / Math.max(1, nodes - 1)), 0);
    parts.push(tinted(ring, 0x2c5c3c));
  }
  // Blades, splayed around the top third and drooping. Smaller and more numerous than
  // the first attempt, which hung seven planks a metre and a half long off each culm
  // and read as green shelving from anywhere near the camera.
  const blades = detail === 'low' ? 4 : 10;
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2 + 0.4;
    const length = 0.72 + (i % 3) * 0.16;
    const blade = new BoxGeometry(length, 0.03, 0.1);
    blade.translate(length * 0.55, 0, 0);
    blade.rotateZ(-0.62 - (i % 4) * 0.14);
    blade.rotateY(angle);
    blade.translate(0, 2.7 + (i % 5) * 0.46, 0);
    parts.push(tinted(blade, i % 2 === 0 ? 0x4c8b52 : 0x3b7444));
  }
  return mergeGeometries(parts, false) ?? parts[0]!;
}

/**
 * A broadleaf tree: a trunk and three offset canopy tiers.
 *
 * One cone is a traffic cone. Three overlapping tiers at different radii, rotations
 * and greens read as a crown, and the trunk underneath is what makes it a tree rather
 * than a bush — the previous version had no trunk at all and floated on the grass.
 */
function treeGeometry(detail: Detail): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.34, 0.5, 3.2, 6);
  trunk.translate(0, -2.4, 0);
  parts.push(tinted(trunk, 0x4a3524));
  const tiers: [number, number, number, number][] = [
    [3.1, 2.9, -0.9, 0x2f6b45],
    [2.5, 2.6, 0.9, 0x35774b],
    [1.6, 2.2, 2.6, 0x3f8654]
  ];
  for (const [radius, height, y, hex] of detail === 'low' ? tiers.slice(0, 2) : tiers) {
    const tier = new ConeGeometry(radius, height, 7);
    tier.rotateY(y);
    tier.translate(0, y, 0);
    parts.push(tinted(tier, hex));
  }
  return mergeGeometries(parts, false) ?? parts[0]!;
}

/** The winter version: a bare trunk and four tight, dark tiers. */
function pineGeometry(detail: Detail): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.26, 0.38, 2.4, 6);
  trunk.translate(0, -2.6, 0);
  parts.push(tinted(trunk, 0x3a2b20));
  for (let i = 0; i < (detail === 'low' ? 2 : 4); i++) {
    const tier = new ConeGeometry(2.4 - i * 0.5, 2.4, 7);
    tier.rotateY(i * 0.8);
    tier.translate(0, -1.4 + i * 1.5, 0);
    parts.push(tinted(tier, i % 2 === 0 ? 0x1f3a30 : 0x244539));
  }
  return mergeGeometries(parts, false) ?? parts[0]!;
}

/**
 * A boulder rather than a cone.
 *
 * A six-sided cone reads as a tent. This is a low sphere with its vertices pushed
 * around by a fixed hash, so it is lumpy and asymmetric like a rock and identical on
 * every device and every run.
 */
function rockGeometry(): BufferGeometry {
  const geometry = new SphereGeometry(1.7, 7, 5);
  const position = geometry.attributes['position'] as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = Math.sin(x * 3.1 + 1.7) * Math.cos(z * 2.7 - 0.6) * Math.sin(y * 2.2 + 2.4);
    const push = 1 + n * 0.26;
    // Flattened: a boulder sits into the ground rather than balancing on it.
    position.setXYZ(i, x * push, y * push * 0.72 - 0.2, z * push);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A background person: robe, shoulders, head and hair, merged into one geometry.
 *
 * The parts carry their colour in a vertex attribute rather than in separate materials,
 * so the whole crowd is still a single instanced draw call however many of them there
 * are — the same budget a field of cones cost, for something that reads as people.
 */
function villagerGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, y: number, hex: number) => {
    geometry.translate(0, y, 0);
    const colour = new Color(hex);
    const count = geometry.attributes['position']!.count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
    geometry.setAttribute('color', new BufferAttribute(colours, 3));
    geometry.deleteAttribute('uv');
    parts.push(geometry);
  };
  add(new CylinderGeometry(0.17, 0.27, 1.18, 8), -0.36, PALETTE.cloth);
  add(new CylinderGeometry(0.15, 0.17, 0.4, 8), 0.43, PALETTE.cloth);
  add(new BoxGeometry(0.36, 0.08, 0.2), 0.6, 0x6d6a4e);
  add(new BoxGeometry(0.2, 0.22, 0.19), 0.76, 0xc9a887);
  add(new BoxGeometry(0.22, 0.1, 0.21), 0.86, 0x241c16);
  return mergeGeometries(parts, false) ?? parts[0]!;
}

/** Post plus paper lamp, merged so the pair is still one instanced draw call. */
function lanternGeometry(): BufferGeometry {
  const post = new CylinderGeometry(0.1, 0.13, 3.4, 6);
  post.translate(0, -1.7, 0);
  const lamp = new CylinderGeometry(0.42, 0.36, 0.95, 8);
  lamp.translate(0, 0.55, 0);
  const cap = new CylinderGeometry(0.5, 0.12, 0.3, 8);
  cap.translate(0, 1.18, 0);
  // The shade is near-white so the emissive reads on it; the post and cap are dark
  // enough that the same glow only warms them.
  return mergeGeometries(
    [tinted(post, 0x4a3524), tinted(lamp, 0xfff3d6), tinted(cap, 0x5a4630)],
    false
  ) ?? post;
}

function heightOffset(kind: PropKind): number {
  switch (kind) {
    case 'bamboo': return 4.5;
    case 'rock': return 1.7;
    case 'tree': return 3.6;
    // The figure is built around its own middle, so it only needs lifting to the waist.
    case 'villager': return 0.95;
    // The lamp sits at the top of its post, so the geometry is built around the lamp
    // and the offset is the post's full height rather than half of it.
    case 'lantern': return 3.1;
    case 'pillar': return 11;
    case 'crate': return 0.5;
    case 'orchid': return 0.3;
    case 'bed': return 0.42;
    case 'table': return 0.78;
    case 'stool': return 0.22;
    case 'chest': return 0.31;
    case 'shelf': return 1.55;
    case 'window': return 1.85;
    case 'pew': return 0.18;
    case 'dais': return 0.25;
    case 'desk': return 0.66;
    case 'banner': return 3.4;
    case 'furnace': return 1.3;
    case 'brazier': return 0.35;
    // Built standing on its own base, so it only needs lifting off the floor.
    case 'jar': return 0;
    case 'stall': return 0.52;
    case 'awning': return 2.3;
    case 'snowdrift': return 0.55;
    case 'icespike': return 3.25;
    case 'pine': return 3.25;
    case 'terrace': return 0.25;
    case 'reed': return 1.2;
    case 'raft': return 0.12;
  }
}

/**
 * A hipped roof with the concave sweep and upturned corners the architecture is known
 * for, built as a height field rather than as a cone.
 *
 * The old roof was `ConeGeometry(..., 4)` — a four-sided pyramid with dead straight
 * slopes, which is the one silhouette a Chinese roof never has. The profile here is
 * concave: steep at the ridge, flattening as it falls, then flicking up over the last
 * fifth so the eave lifts at the corners. It overhangs the walls, which is what casts
 * the deep shadow line under the eaves.
 */
function curvedRoofGeometry(width: number, depth: number, peak: number, overhang: number, n: number): BufferGeometry {
  const halfX = width / 2 + overhang;
  const halfZ = depth / 2 + overhang;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const heightAt = (u: number, v: number): number => {
    // Distance to the eave as a square ring, which is what makes it a hip roof.
    const t = Math.max(Math.abs(u), Math.abs(v));
    // Concave fall from the ridge.
    let y = peak * Math.pow(1 - t, 0.62);
    // The flying eave: the last stretch turns back upwards.
    if (t > 0.8) y += peak * 0.16 * Math.pow((t - 0.8) / 0.2, 2);
    return y;
  };

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const u = (i / n) * 2 - 1;
      const v = (j / n) * 2 - 1;
      positions.push(u * halfX, heightAt(u, v), v * halfZ);
      uvs.push(i / n, j / n);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A house, as geometry rather than as a scene graph.
 *
 * It used to be a box, four stakes and a cone — seven separate meshes per building and
 * seven draw calls, which in the village was 49 of the 137 the low tier allows. Nothing
 * could be added to it without paying another call per piece.
 *
 * Returning parts instead lets every building in an area merge into two meshes, one for
 * the timber and one for the tiles. The whole village costs two draw calls now, so the
 * posts, the plinth, the balcony spindles, the door, the shutters and the hip ridges
 * are all free — a house has about forty pieces in it and still draws as half a house.
 */
function houseParts(b: {
  x: number; z: number; w: number; d: number; h: number; stilts?: boolean; floors?: number;
}, detail: Detail): { body: BufferGeometry[]; roof: BufferGeometry[] } {
  // The low tier gets the shape of the building and none of the joinery. Gating the
  // shading by tier and leaving the geometry alone was half a job: a device slow enough
  // to need Lambert is slow enough that forty pieces a house matters, and at desktop
  // width on a software rasteriser it took `page.evaluate` past thirty seconds — the
  // page could not get a turn at all.
  const fine = detail !== 'low';
  const body: BufferGeometry[] = [];
  const roof: BufferGeometry[] = [];
  const at = (geometry: BufferGeometry, x: number, y: number, z: number, hex: number, target = body) => {
    geometry.translate(b.x + x, y, b.z + z);
    target.push(tinted(geometry, hex));
  };

  const base = b.stilts === false ? 0 : 2.2;
  const floors = b.floors ?? 1;
  const top = base + b.h * floors;

  // A stone plinth. Even a stilted house sits on something.
  at(new BoxGeometry(b.w + 0.7, 0.5, b.d + 0.7), 0, 0.25, 0, 0x6a6a63);

  if (base > 0) {
    for (const sx of [-b.w / 2 + 0.5, b.w / 2 - 0.5]) {
      for (const sz of [-b.d / 2 + 0.5, b.d / 2 - 0.5]) {
        at(new CylinderGeometry(0.24, 0.3, base, 8), sx, base / 2, sz, 0x4a3524);
      }
    }
    // Cross-bracing between the stilts, which is what stops them reading as stilts on
    // a model and starts them reading as a house standing over wet ground.
    if (fine) {
      at(new BoxGeometry(b.w - 0.6, 0.16, 0.16), 0, base * 0.55, -b.d / 2 + 0.5, 0x4a3524);
      at(new BoxGeometry(b.w - 0.6, 0.16, 0.16), 0, base * 0.55, b.d / 2 - 0.5, 0x4a3524);
    }
  }

  for (let floor = 0; floor < floors; floor++) {
    const y = base + floor * b.h;
    // Walls, inset so the corner posts stand proud of them.
    at(new BoxGeometry(b.w - 0.3, b.h, b.d - 0.3), 0, y + b.h / 2, 0, PALETTE.wall);
    // Exposed timber frame: four corner posts and a beam at each floor line.
    for (const sx of [-b.w / 2, b.w / 2]) {
      for (const sz of [-b.d / 2, b.d / 2]) {
        at(new BoxGeometry(0.28, b.h, 0.28), sx, y + b.h / 2, sz, 0x4a3524);
      }
    }
    at(new BoxGeometry(b.w + 0.2, 0.26, b.d + 0.2), 0, y + b.h, 0, 0x53381f);

    // Shutters: a recessed dark panel with a lattice over it, two to a face.
    for (const sx of fine ? [-b.w * 0.26, b.w * 0.26] : []) {
      const face = b.d / 2 - 0.14;
      at(new BoxGeometry(1.25, 1.05, 0.1), sx, y + b.h * 0.62, face, 0x2b2118);
      for (let k = -1; k <= 1; k++) {
        at(new BoxGeometry(0.07, 1.05, 0.06), sx + k * 0.36, y + b.h * 0.62, face + 0.06, 0x6b4c2c);
      }
      at(new BoxGeometry(1.25, 0.07, 0.06), sx, y + b.h * 0.62, face + 0.06, 0x6b4c2c);
    }
  }

  // A door on the front, with its frame and a step.
  at(new BoxGeometry(1.5, 2.05, 0.12), 0, base + 1.02, b.d / 2 - 0.1, 0x33251a);
  at(new BoxGeometry(1.75, 0.16, 0.2), 0, base + 2.1, b.d / 2 - 0.08, 0x6b4c2c);
  at(new BoxGeometry(1.9, 0.18, 0.7), 0, base + 0.09, b.d / 2 + 0.3, 0x6a6a63);

  // Balcony railing around the upper floor.
  if (floors > 1) {
    const y = base + b.h;
    const rail = (length: number, x: number, z: number, along: 'x' | 'z') => {
      const geometry = along === 'x' ? new BoxGeometry(length, 0.12, 0.14) : new BoxGeometry(0.14, 0.12, length);
      at(geometry, x, y + 0.95, z, 0x6b4c2c);
      const count = fine ? Math.max(3, Math.round(length / 0.75)) : 0;
      for (let k = 0; k < count; k++) {
        const along01 = (k / (count - 1) - 0.5) * length;
        at(
          new BoxGeometry(0.08, 0.85, 0.08),
          along === 'x' ? x + along01 : x,
          y + 0.52,
          along === 'z' ? z + along01 : z,
          0x6b4c2c
        );
      }
    };
    rail(b.w + 0.2, 0, b.d / 2 + 0.1, 'x');
    rail(b.w + 0.2, 0, -b.d / 2 - 0.1, 'x');
    rail(b.d + 0.2, b.w / 2 + 0.1, 0, 'z');
    rail(b.d + 0.2, -b.w / 2 - 0.1, 0, 'z');
  }

  // The roof, and the ridges that run from the apex down to each corner.
  const peak = 2.1 + Math.max(b.w, b.d) * 0.16;
  at(curvedRoofGeometry(b.w, b.d, peak, 1.15, fine ? 12 : 5), 0, top, 0, PALETTE.roof, roof);
  at(new BoxGeometry(0.42, 0.42, 0.42), 0, top + peak + 0.1, 0, 0x1d3536, roof);
  const halfX = b.w / 2 + 1.15;
  const halfZ = b.d / 2 + 1.15;
  for (const [sx, sz] of fine ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const : []) {
    const ridge = new BoxGeometry(Math.hypot(halfX, halfZ) * 1.02, 0.17, 0.22);
    ridge.rotateZ(-Math.atan2(peak, Math.hypot(halfX, halfZ)) * sx * (sz > 0 ? 1 : 1));
    ridge.rotateY(-Math.atan2(sz * halfZ, sx * halfX));
    at(ridge, (sx * halfX) / 2, top + peak / 2 + 0.12, (sz * halfZ) / 2, 0x1d3536, roof);
  }
  return { body, roof };
}


function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = (Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0);
  return h || 1;
}

/**
 * Adds the small touches that make an interior read as lived in: a blanket on the bed,
 * mullions across a window, a bag of stones on the floor beside it. Called by the area
 * builder after the instanced props are placed.
 */
export function dressInterior(root: Group, dressing: InteriorDressing[], castShadow: boolean): void {
  for (const item of dressing) {
    switch (item.kind) {
      case 'blanket': {
        const blanket = new Mesh(new BoxGeometry(1.8, 0.1, 1.9), mat('cloth', 0x8f9a86));
        blanket.position.set(item.x, 0.48, item.z);
        blanket.castShadow = castShadow;
        root.add(blanket);
        const pillow = new Mesh(new BoxGeometry(0.9, 0.16, 0.42), mat('cloth', 0xb3b6a0));
        pillow.position.set(item.x, 0.52, item.z - 1.2);
        root.add(pillow);
        break;
      }
      case 'mullion': {
        for (const offset of [-0.55, 0, 0.55]) {
          const bar = new Mesh(new BoxGeometry(0.07, 1.5, 0.16), mat('wood', PALETTE.wood));
          bar.position.set(item.x + offset, 1.85, item.z);
          root.add(bar);
        }
        const sill = new Mesh(new BoxGeometry(1.95, 0.12, 0.3), mat('wood', PALETTE.wood));
        sill.position.set(item.x, 1.05, item.z);
        root.add(sill);
        break;
      }
      case 'stone-bag': {
        const bag = new Mesh(new CylinderGeometry(0.22, 0.28, 0.3, 8), mat('cloth', 0x6e6a52));
        bag.position.set(item.x, 0.15, item.z);
        bag.castShadow = castShadow;
        root.add(bag);
        // A few stones spilled beside it, because twelve is a number you can count.
        for (let i = 0; i < 4; i++) {
          const stone = new Mesh(new ConeGeometry(0.08, 0.12, 5), mat('stone', 0x7fa89a));
          stone.position.set(item.x + 0.32 + (i % 2) * 0.16, 0.06, item.z + 0.1 + Math.floor(i / 2) * 0.16);
          root.add(stone);
        }
        break;
      }
    }
  }
}

export interface InteriorDressing {
  kind: 'blanket' | 'mullion' | 'stone-bag';
  x: number;
  z: number;
}

/**
 * A flat ring marking an objective. A ring rather than a filled disc: a solid circle at
 * the scale needed outdoors reads as an orange blob across the floor of a small room.
 */
export function marker(x: number, z: number, scale = 1, color = PALETTE.gold): Mesh {
  const ring = new Mesh(
    new RingGeometry(0.78 * scale, 1.05 * scale, 24),
    new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.72, side: DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.06, z);
  return ring;
}
