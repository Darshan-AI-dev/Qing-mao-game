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

export function buildArea(description: AreaDescription, budget: { instanceBudget: number; shadows: string }): BuiltArea {
  const root = new Group();
  root.name = `area:${description.id}`;
  const blockers: Blocker[] = [...(description.blockers ?? [])];
  const lanterns: { x: number; y: number; z: number }[] = [];
  const castShadow = budget.shadows !== 'blob';
  const rng = new Rng(hash(description.id));

  // --- ground and ceiling
  const ground = new Mesh(new PlaneGeometry(description.size.x, description.size.z), mat(description.enclosed ? PALETTE.stone : PALETTE.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = castShadow;
  root.add(ground);

  if (description.enclosed) {
    const height = description.ceilingHeight ?? 14;
    const ceiling = new Mesh(new PlaneGeometry(description.size.x, description.size.z), mat(PALETTE.ceiling));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    root.add(ceiling);
    // Four walls, so a cave reads as a cave from inside rather than a floor in a void.
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const wall = new Mesh(
        new PlaneGeometry(sx ? description.size.z : description.size.x, height),
        mat(PALETTE.ceiling)
      );
      wall.position.set((sx * description.size.x) / 2, height / 2, (sz * description.size.z) / 2);
      wall.rotation.y = sx ? -sx * Math.PI / 2 : sz > 0 ? Math.PI : 0;
      root.add(wall);
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
    root.add(strip);
  }

  // --- water
  for (const pool of description.water ?? []) {
    const surface = new Mesh(new PlaneGeometry(pool.w, pool.d), mat(pool.color));
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(pool.x, 0.05, pool.z);
    root.add(surface);
  }

  // --- buildings: pale-green two-storey bamboo on wooden stakes over uneven ground
  for (const building of description.buildings ?? []) {
    root.add(buildHouse(building, castShadow));
    blockers.push({ x: building.x, z: building.z, w: building.w / 2 + 0.7, d: building.d / 2 + 0.7 });
  }

  // --- instanced props
  for (const group of description.props) {
    const places = group.places.slice(0, budget.instanceBudget);
    if (!places.length) continue;
    const { geometry, material, blocker } = propGeometry(group.kind);
    const instanced = new InstancedMesh(geometry, material, places.length);
    instanced.castShadow = castShadow && group.kind !== 'villager';
    instanced.receiveShadow = castShadow;
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const scaleVector = new Vector3();
    const position = new Vector3();
    places.forEach((place, i) => {
      const scale = place.scale ?? 0.85 + rng.next() * 0.4;
      position.set(place.x, (place.y ?? 0) + heightOffset(group.kind) * scale, place.z);
      quaternion.setFromAxisAngle(new Vector3(0, 1, 0), place.rotation ?? rng.next() * Math.PI * 2);
      scaleVector.set(scale, scale, scale);
      matrix.compose(position, quaternion, scaleVector);
      instanced.setMatrixAt(i, matrix);
      if (blocker) blockers.push({ x: place.x, z: place.z, w: blocker.w * scale, d: blocker.d * scale });
      if (group.kind === 'lantern') lanterns.push({ x: place.x, y: 2.9, z: place.z });
    });
    instanced.instanceMatrix.needsUpdate = true;
    root.add(instanced);
  }

  // --- split into chunks so the frustum test can skip whole blocks of the area
  const chunks = chunkify(root, description);
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

function chunkify(root: Group, description: AreaDescription) {
  const chunks: { group: Group; centre: Vector3; radius: number }[] = [];
  const cols = Math.max(1, Math.ceil(description.size.x / CHUNK_SIZE));
  const rows = Math.max(1, Math.ceil(description.size.z / CHUNK_SIZE));
  const grid = new Map<string, Group>();

  for (const child of [...root.children]) {
    const box = new Vector3();
    child.getWorldPosition(box);
    const cx = Math.floor((box.x + description.size.x / 2) / CHUNK_SIZE);
    const cz = Math.floor((box.z + description.size.z / 2) / CHUNK_SIZE);
    const key = `${Math.min(cols - 1, Math.max(0, cx))}:${Math.min(rows - 1, Math.max(0, cz))}`;
    let group = grid.get(key);
    if (!group) {
      group = new Group();
      group.name = `chunk:${description.id}:${key}`;
      grid.set(key, group);
    }
    group.add(child);
  }

  for (const [key, group] of grid) {
    const [cx, cz] = key.split(':').map(Number) as [number, number];
    const centre = new Vector3(
      (cx + 0.5) * CHUNK_SIZE - description.size.x / 2,
      6,
      (cz + 0.5) * CHUNK_SIZE - description.size.z / 2
    );
    chunks.push({ group, centre, radius: CHUNK_SIZE * 0.95 });
  }
  return chunks;
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
