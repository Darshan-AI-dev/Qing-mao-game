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
  BoxGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry, Group,
  InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, PlaneGeometry, Quaternion,
  Vector3, type BufferGeometry, type Material
} from 'three';
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

export type PropKind = 'bamboo' | 'rock' | 'tree' | 'villager' | 'lantern' | 'pillar' | 'crate' | 'orchid';

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
  paths?: { from: [number, number]; to: [number, number]; width?: number }[];
  water?: { x: number; z: number; w: number; d: number; color: number }[];
  /** Ceilings can be raised locally, e.g. the stone forest's vault. */
  ceilingHeight?: number;
  blockers?: Blocker[];
}

export interface BuiltArea {
  group: Group;
  chunks: { group: Group; centre: Vector3; radius: number }[];
  blockers: Blocker[];
  lanterns: { x: number; y: number; z: number }[];
}

const CHUNK_SIZE = 48;

const mat = (hex: number) => new MeshLambertMaterial({ color: new Color(hex) });

const PALETTE = {
  grass: 0x314f43, path: 0x6f6b50, wood: 0x49331f, roof: 0x27494a, wall: 0x8f8d64,
  rock: 0x3e5457, bamboo: 0x38744c, leaf: 0x265f45, stone: 0x4a5458, water: 0x2f6f86,
  cloth: 0xa6a383, orchid: 0xbcc8ee, ceiling: 0x1b2326, gold: 0xf0b047
};

function propGeometry(kind: PropKind): { geometry: BufferGeometry; material: Material; blocker?: Blocker } {
  switch (kind) {
    // Qing Mao's bamboo is straight with a spear-sharp tip, per the source text.
    case 'bamboo': return { geometry: new CylinderGeometry(0.12, 0.16, 9, 6), material: mat(PALETTE.bamboo), blocker: { x: 0, z: 0, w: 0.3, d: 0.3 } };
    case 'rock': return { geometry: new ConeGeometry(1.9, 3.4, 6), material: mat(PALETTE.rock), blocker: { x: 0, z: 0, w: 1.4, d: 1.4 } };
    case 'tree': return { geometry: new ConeGeometry(3.1, 7.2, 7), material: mat(PALETTE.leaf), blocker: { x: 0, z: 0, w: 1, d: 1 } };
    case 'villager': return { geometry: new ConeGeometry(0.52, 1.9, 7), material: mat(PALETTE.cloth) };
    case 'lantern': return { geometry: new CylinderGeometry(0.16, 0.16, 3.4, 6), material: mat(PALETTE.wood) };
    case 'pillar': return { geometry: new CylinderGeometry(1.5, 2.1, 22, 7), material: mat(PALETTE.stone), blocker: { x: 0, z: 0, w: 1.8, d: 1.8 } };
    case 'crate': return { geometry: new BoxGeometry(1.2, 1, 1.2), material: mat(PALETTE.wood), blocker: { x: 0, z: 0, w: 0.7, d: 0.7 } };
    case 'orchid': return { geometry: new ConeGeometry(0.22, 0.6, 5), material: mat(PALETTE.orchid) };
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
  const ground = new Mesh(new PlaneGeometry(description.size.x, description.size.z), mat(description.enclosed ? PALETTE.stone : PALETTE.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = castShadow;
  shell.add(ground);

  if (description.enclosed) {
    const height = description.ceilingHeight ?? 14;
    const ceiling = new Mesh(new PlaneGeometry(description.size.x, description.size.z), mat(PALETTE.ceiling));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    shell.add(ceiling);
    // Four walls, so a cave reads as a cave from inside rather than a floor in a void.
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const wall = new Mesh(
        new PlaneGeometry(sx ? description.size.z : description.size.x, height),
        mat(PALETTE.ceiling)
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
    const strip = new Mesh(new PlaneGeometry(path.width ?? 4, length), mat(PALETTE.path));
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
    strip.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2);
    strip.receiveShadow = castShadow;
    shell.add(strip);
  }

  // --- water
  for (const pool of description.water ?? []) {
    const surface = new Mesh(new PlaneGeometry(pool.w, pool.d), mat(pool.color));
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(pool.x, 0.05, pool.z);
    shell.add(surface);
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

function heightOffset(kind: PropKind): number {
  switch (kind) {
    case 'bamboo': return 4.5;
    case 'rock': return 1.7;
    case 'tree': return 3.6;
    case 'villager': return 0.95;
    case 'lantern': return 1.7;
    case 'pillar': return 11;
    case 'crate': return 0.5;
    case 'orchid': return 0.3;
  }
}

function buildHouse(b: { x: number; z: number; w: number; d: number; h: number; stilts?: boolean; floors?: number }, castShadow: boolean): Group {
  const house = new Group();
  const base = b.stilts === false ? 0 : 2.2;
  if (base > 0) {
    for (const sx of [-b.w / 2 + 0.5, b.w / 2 - 0.5]) {
      for (const sz of [-b.d / 2 + 0.5, b.d / 2 - 0.5]) {
        const stake = new Mesh(new CylinderGeometry(0.26, 0.3, base, 8), mat(PALETTE.wood));
        stake.position.set(b.x + sx, base / 2, b.z + sz);
        stake.castShadow = castShadow;
        house.add(stake);
      }
    }
  }
  const floors = b.floors ?? 1;
  for (let floor = 0; floor < floors; floor++) {
    const storey = new Mesh(new BoxGeometry(b.w, b.h, b.d), mat(PALETTE.wall));
    storey.position.set(b.x, base + b.h / 2 + floor * b.h, b.z);
    storey.castShadow = castShadow;
    storey.receiveShadow = castShadow;
    house.add(storey);
  }
  const roof = new Mesh(new ConeGeometry(Math.max(b.w, b.d) * 0.78, 2.6, 4), mat(PALETTE.roof));
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

/** A flat marker disc for objectives and interaction points. */
export function marker(x: number, z: number, color = PALETTE.gold): Mesh {
  const disc = new Mesh(new CircleGeometry(1.1, 16), mat(color));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, 0.08, z);
  return disc;
}
