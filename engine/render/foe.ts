/**
 * Bodies for the things that fight back.
 *
 * Human opponents use the ordinary `Actor`, because they are people in the canon with
 * appearance notes to honour. Beasts do not: a boar king, a stone monkey and a
 * lightning wolf need silhouettes that read as different animals at a glance, from
 * behind, at the play camera's distance, on a phone.
 *
 * Each is one merged geometry with its colours in a vertex attribute, so a foe costs a
 * single draw call — the same trick the crowd uses.
 */
import {
  BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, Group, Mesh,
  SphereGeometry, type BufferGeometry
} from 'three';
import { surface } from './surfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type FoeKind = 'boar' | 'monkey' | 'wolf' | 'shade';

interface Part {
  geometry: BufferGeometry;
  at: [number, number, number];
  colour: number;
}

function build(parts: Part[]): BufferGeometry {
  const merged: BufferGeometry[] = [];
  for (const part of parts) {
    const geometry = part.geometry;
    geometry.translate(...part.at);
    const colour = new Color(part.colour);
    const count = geometry.attributes['position']!.count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([colour.r, colour.g, colour.b], i * 3);
    geometry.setAttribute('color', new BufferAttribute(colours, 3));
    geometry.deleteAttribute('uv');
    merged.push(geometry);
  }
  return mergeGeometries(merged, false) ?? merged[0]!;
}

/**
 * Heavy, low and front-loaded: all the mass over the shoulders, head down, tusks out.
 * A charge it commits to completely should look like a thing that cannot turn.
 */
function boar(): BufferGeometry {
  return build([
    { geometry: new SphereGeometry(1.5, 10, 7), at: [0, 1.5, -0.4], colour: 0x4a3b2c },
    { geometry: new SphereGeometry(1.05, 10, 7), at: [0, 1.25, 1.5], colour: 0x3d3024 },
    { geometry: new ConeGeometry(0.55, 1.2, 7), at: [0, 1.0, 2.5], colour: 0x33291f },
    { geometry: new ConeGeometry(0.13, 0.8, 5), at: [-0.42, 1.05, 2.7], colour: 0xd8d2bc },
    { geometry: new ConeGeometry(0.13, 0.8, 5), at: [0.42, 1.05, 2.7], colour: 0xd8d2bc },
    ...[-0.72, 0.72].flatMap((x) =>
      [-1.1, 1.0].map((z) => ({
        geometry: new CylinderGeometry(0.22, 0.17, 1.1, 6), at: [x, 0.55, z] as [number, number, number], colour: 0x2b2219
      }))
    )
  ]);
}

/** Long-limbed, upright, and stone: it conceals against pillars, so it is pillar-coloured. */
function monkey(): BufferGeometry {
  return build([
    { geometry: new CylinderGeometry(0.62, 0.78, 1.7, 8), at: [0, 1.5, 0], colour: 0x4a5458 },
    { geometry: new SphereGeometry(0.5, 9, 7), at: [0, 2.6, 0.1], colour: 0x525d61 },
    { geometry: new SphereGeometry(0.14, 6, 5), at: [-0.2, 2.7, 0.45], colour: 0x86c98f },
    { geometry: new SphereGeometry(0.14, 6, 5), at: [0.2, 2.7, 0.45], colour: 0x86c98f },
    ...[-0.85, 0.85].map((x) => ({
      geometry: new CylinderGeometry(0.19, 0.22, 1.9, 6), at: [x, 1.6, 0.1] as [number, number, number], colour: 0x414b4f
    })),
    ...[-0.35, 0.35].map((x) => ({
      geometry: new CylinderGeometry(0.24, 0.2, 1.2, 6), at: [x, 0.6, 0] as [number, number, number], colour: 0x3a4347
    }))
  ]);
}

/** Low, level back, long muzzle, and a pale crown over the skull. */
function wolf(): BufferGeometry {
  return build([
    { geometry: new CylinderGeometry(0.62, 0.5, 2.5, 8), at: [0, 1.15, 0], colour: 0x30363b },
    { geometry: new SphereGeometry(0.48, 9, 7), at: [0, 1.35, 1.45], colour: 0x373e43 },
    { geometry: new ConeGeometry(0.3, 0.95, 6), at: [0, 1.2, 2.1], colour: 0x2a3034 },
    { geometry: new ConeGeometry(0.3, 0.55, 5), at: [0, 1.85, 1.35], colour: 0xbfe2f2 },
    ...[-0.2, 0.2].map((x) => ({
      geometry: new ConeGeometry(0.13, 0.4, 4), at: [x, 1.7, 1.3] as [number, number, number], colour: 0x252a2e
    })),
    ...[-0.45, 0.45].flatMap((x) =>
      [-0.9, 0.85].map((z) => ({
        geometry: new CylinderGeometry(0.15, 0.12, 1.2, 5), at: [x, 0.6, z] as [number, number, number], colour: 0x22272b
      }))
    ),
    { geometry: new CylinderGeometry(0.14, 0.07, 1.3, 5), at: [0, 1.5, -1.5], colour: 0x2a3034 }
  ]);
}

/**
 * The prologue's eight. Not people any more — they are what a man being hunted at the
 * end of five hundred years sees standing at the edge of the light.
 */
function shade(): BufferGeometry {
  return build([
    { geometry: new CylinderGeometry(0.32, 0.58, 1.9, 7), at: [0, 0.95, 0], colour: 0x241d2b },
    { geometry: new SphereGeometry(0.26, 8, 6), at: [0, 2.05, 0.04], colour: 0x1a141f },
    { geometry: new BoxGeometry(0.8, 0.12, 0.26), at: [0, 1.62, 0], colour: 0x2f2638 },
    ...[-0.44, 0.44].map((x) => ({
      geometry: new CylinderGeometry(0.1, 0.13, 1.0, 5), at: [x, 1.35, 0.1] as [number, number, number], colour: 0x241d2b
    }))
  ]);
}

const BODIES: Record<FoeKind, () => BufferGeometry> = { boar, monkey, wolf, shade };

/** Which body a boss wears. Humans are not here; they use the ordinary Actor. */
export const FOE_BODIES: Record<string, { kind: FoeKind; scale: number }> = {
  'boar-king': { kind: 'boar', scale: 1.5 },
  'monkey-king': { kind: 'monkey', scale: 1.3 },
  'thunder-crown-wolf': { kind: 'wolf', scale: 1.45 },
  'prologue-eight': { kind: 'shade', scale: 1.75 }
};

export class Foe {
  readonly root = new Group();
  private mesh: Mesh;
  // Hide and hair rather than cloth: a boar or a wolf should not read as upholstery.
  private material = surface('foliage', 0xffffff, { vertexColors: true, roughness: 0.88 });

  constructor(kind: FoeKind, scale = 1, shadows = true) {
    this.mesh = new Mesh(BODIES[kind](), this.material);
    this.mesh.castShadow = shadows;
    this.root.add(this.mesh);
    this.root.scale.setScalar(scale);
    this.root.name = `foe:${kind}`;
  }

  setPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  setFacing(radians: number): void {
    this.root.rotation.y = radians;
  }

  /**
   * Leaning into a wind-up and settling back afterwards, so the telegraph is on the
   * body as well as on the overlay. A player watching the foe should not have to watch
   * the HUD to know a hit is coming.
   */
  setPose(state: 'approaching' | 'winding' | 'striking' | 'open' | 'won' | 'lost', t: number): void {
    const lean =
      state === 'winding' ? -0.28 : state === 'striking' ? 0.42 : state === 'open' ? 0.16 : 0;
    this.mesh.rotation.x += (lean - this.mesh.rotation.x) * 0.25;
    const bob = state === 'approaching' ? Math.sin(t * 0.009) * 0.06 : 0;
    this.mesh.position.y = bob;
    if (state === 'lost') this.mesh.rotation.z = 1.4;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
