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
  PlaneGeometry, Quaternion, RingGeometry, Vector3, type BufferGeometry, type Material
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
  | 'pew' | 'dais' | 'stall' | 'awning' | 'furnace' | 'brazier' | 'desk'
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
    case 'lantern': return { geometry: lanternGeometry(), material: mat('paper', PALETTE.cloth), blocker: { x: 0, z: 0, w: 0.2, d: 0.2 } };
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
    case 'furnace': return { geometry: new CylinderGeometry(1.25, 1.5, 2.6, 8), material: mat('stone', 0x3a2b22), blocker: { x: 0, z: 0, w: 1.4, d: 1.4 } };
    case 'brazier': return { geometry: new CylinderGeometry(0.5, 0.34, 0.7, 8), material: mat('metal', 0x6b3a22, { emissive: 0x4a2008, emissiveIntensity: 1 }) };
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

  // --- water
  for (const pool of description.water ?? []) {
    const pond = new Mesh(new PlaneGeometry(pool.w, pool.d), mat('stone', pool.color, { roughness: 0.06, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(pool.x, 0.05, pool.z);
    shell.add(pond);
  }

  // --- buildings: pale-green two-storey bamboo on wooden stakes over uneven ground
  for (const building of description.buildings ?? []) {
    buildingGroup.add(buildHouse(building, castShadow));
    blockers.push({ x: building.x, z: building.z, w: building.w / 2 + 0.7, d: building.d / 2 + 0.7 });
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
  return mergeGeometries([post, lamp, cap], false) ?? post;
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

function buildHouse(b: { x: number; z: number; w: number; d: number; h: number; stilts?: boolean; floors?: number }, castShadow: boolean): Group {
  const house = new Group();
  const base = b.stilts === false ? 0 : 2.2;
  if (base > 0) {
    for (const sx of [-b.w / 2 + 0.5, b.w / 2 - 0.5]) {
      for (const sz of [-b.d / 2 + 0.5, b.d / 2 - 0.5]) {
        const stake = new Mesh(new CylinderGeometry(0.26, 0.3, base, 8), mat('wood', PALETTE.wood));
        stake.position.set(b.x + sx, base / 2, b.z + sz);
        stake.castShadow = castShadow;
        house.add(stake);
      }
    }
  }
  const floors = b.floors ?? 1;
  for (let floor = 0; floor < floors; floor++) {
    const storey = new Mesh(new BoxGeometry(b.w, b.h, b.d), mat('stone', PALETTE.wall));
    storey.position.set(b.x, base + b.h / 2 + floor * b.h, b.z);
    storey.castShadow = castShadow;
    storey.receiveShadow = castShadow;
    house.add(storey);
  }
  const roof = new Mesh(new ConeGeometry(Math.max(b.w, b.d) * 0.78, 2.6, 4), mat('thatch', PALETTE.roof));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(b.x, base + b.h * floors + 1.3, b.z);
  roof.castShadow = castShadow;
  house.add(roof);
  return house;
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
