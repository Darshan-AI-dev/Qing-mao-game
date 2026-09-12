/**
 * Procedural surfaces.
 *
 * Every material in the game was `MeshLambertMaterial` with one flat colour and no
 * texture of any kind. Lambert has no specular term at all, so nothing could catch a
 * highlight: wet stone, lacquered wood, silk and packed earth all rendered as the same
 * matte paper in different colours, and a wall was a single unbroken field of it.
 *
 * These are standard (physically based) materials instead, each with a grain map and a
 * normal map derived from the same height field. Nothing is downloaded: the maps are
 * drawn into canvases at startup from a small tiling value-noise function, so the whole
 * system costs bytes of source and no bytes of transfer, which is what the offline
 * build and the download budget require.
 *
 * The grain is deliberately restrained. The target is elevated stylisation, not
 * photographic detail on top of boxes and cones — the job of these maps is to break up
 * flat fields and give light something to sit on, not to pretend to be photographs.
 */
import {
  CanvasTexture, Color, MeshLambertMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace,
  type Texture
} from 'three';
import type { TierName } from './quality';

export type Surface =
  | 'stone' | 'wood' | 'cloth' | 'foliage' | 'thatch' | 'earth' | 'metal' | 'skin' | 'paper'
  | 'water';

interface Recipe {
  /** How rough the surface is, 0 mirror to 1 chalk. */
  roughness: number;
  metalness: number;
  /** Strength of the grain in the colour map, 0 to 1. */
  grain: number;
  /** Height relief for the derived normal map. */
  relief: number;
  /** Feature size, in texels of the generated map. Small is fine, large is blotchy. */
  scale: number;
  /** Stretch along x, for wood grain and thatch. */
  stretch: number;
  /** How many times the map repeats across a metre. */
  repeat: number;
}

const RECIPES: Record<Surface, Recipe> = {
  // Worked stone and rock: blotchy, matte, and the strongest relief in the set.
  stone:   { roughness: 0.92, metalness: 0.0, grain: 0.20, relief: 1.10, scale: 7,  stretch: 1,  repeat: 0.45 },
  // Timber: fine lines along the length of the board.
  wood:    { roughness: 0.72, metalness: 0.0, grain: 0.17, relief: 0.75, scale: 22, stretch: 9,  repeat: 0.8 },
  // Hemp and silk. Low relief, tight weave, and enough sheen to read as fabric.
  cloth:   { roughness: 0.68, metalness: 0.0, grain: 0.11, relief: 0.40, scale: 34, stretch: 1,  repeat: 2.2 },
  // Leaves and bamboo: clumped, matte, and busy enough to hide the low polygon count.
  foliage: { roughness: 0.85, metalness: 0.0, grain: 0.24, relief: 0.55, scale: 12, stretch: 1,  repeat: 1.1 },
  // Straw roofs: strong directional streaks.
  thatch:  { roughness: 0.95, metalness: 0.0, grain: 0.26, relief: 1.00, scale: 26, stretch: 7,  repeat: 1.4 },
  // Ground. Coarse speckle, seen at a distance, so it repeats often.
  earth:   { roughness: 0.97, metalness: 0.0, grain: 0.16, relief: 0.60, scale: 9,  stretch: 1,  repeat: 0.22 },
  // Iron and bronze: the one surface that reflects its surroundings.
  metal:   { roughness: 0.38, metalness: 0.75, grain: 0.08, relief: 0.30, scale: 16, stretch: 1,  repeat: 1.0 },
  // Skin needs almost nothing: a little roughness variation, no visible grain.
  skin:    { roughness: 0.62, metalness: 0.0, grain: 0.05, relief: 0.12, scale: 28, stretch: 1,  repeat: 1.6 },
  // Lanterns, screens, scrolls. Slightly translucent-looking, very smooth.
  paper:   { roughness: 0.55, metalness: 0.0, grain: 0.09, relief: 0.20, scale: 20, stretch: 3,  repeat: 1.3 },
  // Water. Almost mirror-smooth, and its normal map is the ripple — the relief is
  // doing the visible work here, not the grain, so the grain is nearly nothing.
  water:   { roughness: 0.08, metalness: 0.1, grain: 0.04, relief: 0.55, scale: 14, stretch: 2.4, repeat: 0.16 }
};

let tier: TierName = 'medium';
/** Low-end devices get smaller maps and no normal maps at all. */
function mapSize(): number {
  return tier === 'high' ? 256 : tier === 'medium' ? 192 : 128;
}
function wantsNormals(): boolean {
  return tier !== 'low';
}

/**
 * Whether this device gets physically based shading at all.
 *
 * Standard materials are far more expensive per pixel than Lambert, and the low tier
 * is the tier for machines that cannot afford it — a phone, or anything falling back
 * to software rasterisation. Measured on the software rasteriser these tests run on,
 * turning the whole game standard took a three-project run from 16.6 minutes to 38.2
 * and timed twenty tests out at laptop and desktop width. That is a real cost on a
 * real class of device, not a quirk of the harness.
 *
 * Low still gets the grain map, which is most of what broke up the flat fields; it
 * loses the normal map, the specular response and the environment.
 */
function wantsPhysical(): boolean {
  return tier !== 'low';
}

/** How much geometry detail the foliage builders should produce. */
export type Detail = 'low' | 'full';
export function detailLevel(): Detail {
  return tier === 'low' ? 'low' : 'full';
}

/** Read by the renderer: whether to build and apply an environment map at all. */
export function usesEnvironment(): boolean {
  return wantsPhysical();
}

export function setSurfaceTier(next: TierName): void {
  if (next === tier) return;
  tier = next;
  disposeSurfaces();
}

// ---------------------------------------------------------------------- noise

/** Deterministic hash in [0, 1). Same input, same grain, every run and every device. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Value noise that wraps at `period`, so the map tiles without a visible seam.
 * A non-tiling map on a repeating surface produces a grid of identical squares with
 * hard edges, which reads far worse than no texture at all.
 */
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const wrap = (n: number) => ((n % period) + period) % period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash(wrap(x0), wrap(y0), seed);
  const b = hash(wrap(x0 + 1), wrap(y0), seed);
  const c = hash(wrap(x0), wrap(y0 + 1), seed);
  const d = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Four octaves of it. Enough structure to look like a material, cheap enough to build. */
function fbm(x: number, y: number, period: number, seed: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < 4; octave++) {
    sum += tileNoise(x * frequency, y * frequency, period * frequency, seed + octave * 101) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/** The height field a surface's colour and normal maps are both built from. */
function heightField(recipe: Recipe, seed: number): { data: Float32Array; size: number } {
  const size = mapSize();
  const data = new Float32Array(size * size);
  const period = Math.max(2, Math.round(size / recipe.scale));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      // Stretching one axis turns blotches into grain: boards and straw run lengthwise.
      data[y * size + x] = fbm(u / recipe.stretch, v, period, seed);
    }
  }
  return { data, size };
}

function canvas2d(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

/** Greyscale grain, multiplied over the material's own colour by three. */
function grainTexture(recipe: Recipe, field: { data: Float32Array; size: number }): Texture | null {
  const made = canvas2d(field.size);
  if (!made) return null;
  const { canvas, ctx } = made;
  const image = ctx.createImageData(field.size, field.size);
  for (let i = 0; i < field.data.length; i++) {
    // Centred on white so the map darkens and lightens the base colour rather than
    // dragging every surface towards grey.
    const shade = 1 + (field.data[i]! - 0.5) * 2 * recipe.grain;
    const value = Math.max(0, Math.min(255, Math.round(shade * 255)));
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Sobel slopes of the same field, packed as a tangent-space normal map. */
function normalTexture(field: { data: Float32Array; size: number }): Texture | null {
  const made = canvas2d(field.size);
  if (!made) return null;
  const { canvas, ctx } = made;
  const { data, size } = field;
  const at = (x: number, y: number): number => data[((y + size) % size) * size + ((x + size) % size)]!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      // Normalise (dx, dy, 1/relief) into the 0..255 range the map is read from.
      // The kernel's taps sum to eight, so divide by that to get a slope rather than
      // an accumulator. Leaving it raw let a slope reach four against a z of one and
      // tilted whole patches of ground away from the sun — the village foreground
      // rendered black. Relief belongs in `normalScale`, not in the map, so the map
      // itself stays a physically sensible unit normal.
      const slope = 0.125;
      const nx = -dx * slope;
      const ny = -dy * slope;
      const length = Math.hypot(nx, ny, 1) || 1;
      const i = (y * size + x) * 4;
      image.data[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      image.data[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      image.data[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

// ------------------------------------------------------------------ materials

interface Maps { grain: Texture | null; normal: Texture | null }
const MAPS = new Map<Surface, Maps>();
const MATERIALS = new Map<string, MeshStandardMaterial | MeshLambertMaterial>();

function mapsFor(kind: Surface): Maps {
  const cached = MAPS.get(kind);
  if (cached) return cached;
  const recipe = RECIPES[kind];
  // One height field feeds both maps, so the bumps and the shading agree.
  const field = heightField(recipe, [...kind].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  const maps: Maps = {
    grain: grainTexture(recipe, field),
    normal: wantsNormals() ? normalTexture(field) : null
  };
  MAPS.set(kind, maps);
  return maps;
}

export interface SurfaceOptions {
  /** Overrides the recipe, for one-off surfaces like still water or a lantern shade. */
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  /** Instanced meshes colour themselves per instance. */
  vertexColors?: boolean;
  /** Lanterns and Gu light: colour that survives being in shadow. */
  emissive?: number;
  emissiveIntensity?: number;
  /** Texture repeats per world metre, overriding the recipe. */
  repeat?: number;
  /** Distant scenery opts out of fog: it is painted already hazed. */
  fog?: boolean;
  side?: number;
}

/**
 * A cached material for one surface and colour. Cached because a village builds
 * hundreds of props from a handful of distinct surfaces, and an uncached factory here
 * would put a separate shader program behind every crate.
 */
export function surface(
  kind: Surface,
  color: number | Color,
  options: SurfaceOptions = {}
): MeshStandardMaterial | MeshLambertMaterial {
  const tint = color instanceof Color ? color : new Color(color);
  const key = [
    kind, tint.getHexString(), options.roughness ?? '', options.metalness ?? '',
    options.transparent ? 't' : '', options.opacity ?? '', options.vertexColors ? 'v' : '',
    options.emissive ?? '', options.emissiveIntensity ?? '', options.repeat ?? '', options.side ?? '',
    options.fog === false ? 'nofog' : ''
  ].join('|');
  const cached = MATERIALS.get(key);
  if (cached) return cached;

  const recipe = RECIPES[kind];
  const maps = mapsFor(kind);
  const shared = {
    color: tint,
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1
  };
  const material = wantsPhysical()
    ? new MeshStandardMaterial({
        ...shared,
        roughness: options.roughness ?? recipe.roughness,
        metalness: options.metalness ?? recipe.metalness
      })
    : new MeshLambertMaterial(shared);
  if (options.side !== undefined) material.side = options.side as MeshStandardMaterial['side'];
  if (options.fog === false) material.fog = false;
  if (options.emissive !== undefined) {
    material.emissive = new Color(options.emissive);
    material.emissiveIntensity = options.emissiveIntensity ?? 1;
  }
  // Each material gets its own view of the shared image. Setting `repeat` on the
  // cached texture itself meant the last material built silently re-tiled every other
  // material that shared the surface.
  const repeat = options.repeat ?? recipe.repeat;
  if (maps.grain) {
    const map = maps.grain.clone();
    map.needsUpdate = true;
    map.repeat.set(repeat, repeat);
    material.map = map;
  }
  if (maps.normal && material instanceof MeshStandardMaterial) {
    const map = maps.normal.clone();
    map.needsUpdate = true;
    map.repeat.set(repeat, repeat);
    material.normalMap = map;
    // Relief lives here, where it can be turned down without regenerating anything.
    material.normalScale.set(recipe.relief, recipe.relief);
  }
  MATERIALS.set(key, material);
  if (kind === 'water' && material instanceof MeshStandardMaterial) WATER.push(material);
  return material;
}

/**
 * Water surfaces, kept so their ripple can be scrolled.
 *
 * A pond was a flat plane with a low roughness: a mirror, which is exactly what still
 * water is and exactly what makes it read as a sheet of glass laid on the ground. The
 * awakening river is where the aperture opens and it looked like lino. Scrolling the
 * normal map is the cheapest thing that makes a surface look wet, and because the map
 * is a clone per material, moving it disturbs nothing else.
 */
const WATER: MeshStandardMaterial[] = [];

export function advanceWater(seconds: number): void {
  for (const material of WATER) {
    if (!material.normalMap) continue;
    // Two axes at different rates, so the ripple never repeats visibly.
    material.normalMap.offset.x = (material.normalMap.offset.x + seconds * 0.014) % 1;
    material.normalMap.offset.y = (material.normalMap.offset.y + seconds * 0.021) % 1;
  }
}

/** Frees every generated map and material. Called when the quality tier changes. */
export function disposeSurfaces(): void {
  for (const material of MATERIALS.values()) {
    material.map?.dispose();
    if (material instanceof MeshStandardMaterial) material.normalMap?.dispose();
    material.dispose();
  }
  MATERIALS.clear();
  WATER.length = 0;
  for (const maps of MAPS.values()) {
    maps.grain?.dispose();
    maps.normal?.dispose();
  }
  MAPS.clear();
}

/** Read by the tests: how much this costs and that it is actually producing maps. */
export function surfaceStats(): {
  materials: number; maps: number; size: number; normals: boolean; physical: boolean;
} {
  return {
    materials: MATERIALS.size, maps: MAPS.size, size: mapSize(),
    normals: wantsNormals(), physical: wantsPhysical()
  };
}
