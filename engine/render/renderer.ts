/**
 * The three.js renderer.
 *
 * three.js is vendored under /vendor/three, so the shipped build carries no CDN
 * reference and the offline ZIP keeps working from file://. Current three releases
 * need WebGL2, which is available in every browser in the support matrix.
 *
 * What this buys over the previous hand-written renderer: skinned glTF characters,
 * shadows, instancing, compressed textures and a very large base of cross-browser
 * testing. What it costs is the port of the world builder and the actors, which is
 * why the story data and the systems were split out first.
 */
import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, Fog, Frustum,
  Group, HemisphereLight, Matrix4, Object3D, PCFSoftShadowMap, PerspectiveCamera,
  PointLight, Scene, Sphere, Vector3, WebGLRenderer
} from 'three';
import { Sky } from './sky';
import { setSurfaceTier } from './surfaces';
import { AdaptiveQuality, BUDGETS, type TierName } from './quality';

export interface Chunk {
  /** Everything in the chunk, added to the scene once and shown or hidden per frame. */
  group: Group;
  centre: Vector3;
  radius: number;
}

export interface RendererStats {
  drawCalls: number;
  triangles: number;
  chunksVisible: number;
  chunksTotal: number;
  fps: number;
  renderScale: number;
  tier: TierName;
}

/** Vertical field of view in landscape, and the aspect it is chosen for. */
const BASE_FOV = 52;
const LANDSCAPE_ASPECT = 16 / 9;

export class Renderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly quality: AdaptiveQuality;

  private chunks: Chunk[] = [];
  private frustum = new Frustum();
  private frustumMatrix = new Matrix4();
  private sphere = new Sphere();
  private hemi: HemisphereLight;
  private sun: DirectionalLight;
  private ambient: AmbientLight;
  private lanterns: PointLight[] = [];
  /** Follows the player through dark areas. See `setCarriedLight`. */
  private carried: PointLight | null = null;
  private sky: Sky;
  private lastFrame = performance.now();
  private fps = 60;
  private chunksVisible = 0;

  constructor(canvas: HTMLCanvasElement, tier: TierName, renderScale: number) {
    const context = canvas.getContext('webgl2', { antialias: tier !== 'low', alpha: false });
    if (!context) throw new Error('WebGL2 is unavailable.');

    this.renderer = new WebGLRenderer({ canvas, context, antialias: tier !== 'low' });
    this.renderer.setClearColor(new Color(0x184048));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // ACES pulls the midtones down hard, and this palette lives in the midtones: at
    // 1.05 the outdoor ground came back at about a fifth of its own brightness and a
    // forest floor was indistinguishable from the fog behind it.
    // Raised again for physically based materials. Lambert did not divide its diffuse
    // by pi and standard materials do, so the same palette under the same lights came
    // back about a third darker the moment the surfaces became physical.
    this.renderer.toneMappingExposure = 1.55;
    this.quality = new AdaptiveQuality(tier, renderScale);
    // Materials size their generated maps to the tier, so it has to be set before the
    // first area is built.
    setSurfaceTier(tier);
    this.sky = new Sky(this.renderer);

    const budget = BUDGETS[tier];
    this.renderer.shadowMap.enabled = budget.shadows !== 'blob';
    if (budget.shadows === 'soft') this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.camera = new PerspectiveCamera(BASE_FOV, 1, 0.2, budget.viewDistance + 60);
    this.camera.position.set(0, 12, 18);

    // Sky-and-ground light plus one directional sun. Cheap, and it suits cel shading.
    this.hemi = new HemisphereLight(0xbcd8e4, 0x2a3a2c, 0.85);
    this.sun = new DirectionalLight(0xfff1d8, 1.15);
    this.sun.position.set(-24, 40, 18);
    this.sun.castShadow = budget.shadows !== 'blob';
    if (this.sun.shadow) {
      const size = budget.shadows === 'soft' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 160;
      this.sun.shadow.camera.left = -60;
      this.sun.shadow.camera.right = 60;
      this.sun.shadow.camera.top = 60;
      this.sun.shadow.camera.bottom = -60;
      this.sun.shadow.bias = -0.0008;
    }
    this.ambient = new AmbientLight(0xffffff, 0.18);
    this.scene.add(this.hemi, this.sun, this.ambient);
    this.scene.fog = new Fog(0x184048, budget.viewDistance * 0.35, budget.viewDistance);

    this.resize();
  }

  /** Areas register their geometry as chunks so the frustum test can skip whole blocks. */
  addChunk(group: Group, centre: Vector3, radius: number): Chunk {
    const chunk: Chunk = { group, centre, radius };
    this.chunks.push(chunk);
    this.scene.add(group);
    return chunk;
  }

  clearChunks(): void {
    for (const chunk of this.chunks) {
      this.scene.remove(chunk.group);
      disposeTree(chunk.group);
    }
    this.chunks = [];
    for (const lantern of this.lanterns) this.scene.remove(lantern);
    this.lanterns = [];
    // The carried light belongs to the player, not to the area, so it survives.
  }

  /**
   * The light the player carries underground.
   *
   * The design calls for caves that are genuinely dark with the player carrying the
   * light. Only the first half of that was built, so the inheritance, the stone forest
   * and the blood lake rendered as black voids you could not navigate.
   */
  setCarriedLight(on: boolean): void {
    if (on && !this.carried) {
      // Reach matters more than brightness here: at a 30-unit range with a 1.25 decay
      // the lit circle was about four paces wide, which is a torch in a black box
      // rather than a cave. Wider and slower, so the walls and the floor between them
      // are readable while the far end of the chamber still is not.
      this.carried = new PointLight(0xffc98a, 44, 52, 1.1);
      this.carried.castShadow = false;
      this.scene.add(this.carried);
    } else if (!on && this.carried) {
      this.scene.remove(this.carried);
      this.carried.dispose();
      this.carried = null;
    }
  }

  moveCarriedLight(x: number, y: number, z: number): void {
    this.carried?.position.set(x, y, z);
  }

  get hasCarriedLight(): boolean {
    return !!this.carried;
  }

  /** A soft overhead fill for an interior, on top of its lanterns. */
  addFill(x: number, y: number, z: number, intensity = 16, colour = 0xffdcb0, distance = 34): void {
    const light = new PointLight(colour, intensity, distance, 1);
    light.position.set(x, y, z);
    this.lanterns.push(light);
    this.scene.add(light);
  }

  addLantern(x: number, y: number, z: number): void {
    if (this.lanterns.length >= this.quality.budget.lanterns) return;
    const light = new PointLight(0xffb15c, 9, 20, 1);
    light.position.set(x, y, z);
    this.lanterns.push(light);
    this.scene.add(light);
  }

  /** Time of day tints the hemisphere and sun; underground areas go genuinely dark. */
  setLighting(options: {
    timeOfDay: number;
    underground: boolean;
    /** Enclosed but not underground: a room with a roof, lit by its own lamps and window. */
    indoor?: boolean;
    fogColor: number;
    fogNear: number;
    fogFar: number;
    /** What is behind everything. Defaults to the fog colour. */
    skyColor?: number;
  }): void {
    const { timeOfDay, underground, indoor, fogColor, fogNear, fogFar } = options;
    if (indoor && !underground) {
      // A roof blocks the sun, so an interior lit only by the outdoor rig renders
      // almost black. Rooms get their own balance: a soft sky fill, strong ambient,
      // and a weak directional for shape.
      this.hemi.intensity = 0.55;
      this.hemi.color.setHex(0xc3d6dd);
      this.hemi.groundColor.setHex(0x4a4030);
      this.sun.intensity = 0.25;
      this.sun.color.setHex(0xffe6c4);
      this.ambient.intensity = 0.42;
    } else if (underground) {
      this.hemi.intensity = 0.17;
      this.hemi.color.setHex(0x2a3440);
      this.hemi.groundColor.setHex(0x10161a);
      this.sun.intensity = 0;
      // Enough to silhouette the stone against the fog, and no more: underground is
      // meant to be dark, but a shape you cannot see at all is not atmosphere.
      this.ambient.intensity = 0.09;
    } else {
      // Dawn and dusk warm and dim; noon is flat and bright.
      const noon = 1 - Math.abs(timeOfDay - 0.5) * 2;
      this.hemi.intensity = 0.35 + noon * 0.6;
      this.hemi.color.setHex(noon > 0.5 ? 0xbcd8e4 : 0xe0b49a);
      this.hemi.groundColor.setHex(0x2a3a2c);
      this.sun.intensity = 0.35 + noon * 0.95;
      this.sun.color.setHex(noon > 0.6 ? 0xfff1d8 : 0xffd2a1);
      this.ambient.intensity = 0.12 + noon * 0.1;
    }
    if (this.scene.fog instanceof Fog) {
      this.scene.fog.color.setHex(fogColor);
      this.scene.fog.near = fogNear;
      this.scene.fog.far = fogFar;
      // Distance fades to the fog colour; the empty sky above it is its own. Clearing
      // to the fog colour made every outdoor area's `sky` field dead data.
      this.renderer.setClearColor(new Color(options.skyColor ?? fogColor));
    }

    // A gradient dome rather than a flat clear colour, and the same image blurred into
    // the environment every material reflects. Built from colours the area already
    // declares, so the sky and the lighting cannot drift apart.
    const zenith = options.skyColor ?? fogColor;
    const { background, environment } = this.sky.update({
      zenith,
      // Not the fog colour raw. Fog is a dark teal chosen to swallow distance, and
      // painting the horizon band with it turned the whole dome grey — darker than the
      // flat clear colour it replaced. A real horizon is the *lighter* part of the sky,
      // so this is the fog hazed most of the way back towards the sky's own colour.
      horizon: new Color(fogColor).lerp(new Color(zenith), 0.62).getHex(),
      // Bounce from whatever is underfoot, dimmed: it fills undersides without
      // lifting the whole scene the way raising ambient light does.
      ground: new Color(fogColor).lerp(new Color(0x000000), underground ? 0.55 : 0.3).getHex(),
      timeOfDay,
      enclosed: !!indoor || underground
    });
    // Indoors the room's own walls are the backdrop; a sky behind them would show
    // through the doorway of a cave. The environment still applies: it is what gives
    // lamplit metal and lacquer their sheen.
    this.scene.background = indoor || underground ? null : background;
    this.scene.environment = environment;
    // Interiors reflect their own dim surroundings, not a bright outdoor dome.
    this.scene.environmentIntensity = underground ? 0.25 : indoor ? 0.5 : 1;
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const cap = this.quality.tier === 'high' ? 2 : 1.6;
    const dpr = Math.min(window.devicePixelRatio || 1, cap) * this.quality.renderScale;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    // Widen the lens in portrait.
    //
    // A fixed 52-degree vertical field of view is about 55 across on a laptop and only
    // 25 across on a phone held upright, which is why every interior on a phone was the
    // back of Fang Yuan's head and very little room. Opening the vertical angle as the
    // frame narrows gives back most of the width; the cap keeps it short of the
    // fish-eye a truly constant horizontal field would need at this aspect.
    this.camera.fov = Math.min(74, BASE_FOV * Math.sqrt(Math.max(1, LANDSCAPE_ASPECT / aspect)));
    this.camera.updateProjectionMatrix();
  }

  render(now: number): void {
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    this.fps = this.fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1;

    const rescaled = this.quality.sample(dt, now);
    if (rescaled !== null) this.resize();

    // Frustum culling per chunk. The previous build drew everything every frame.
    // `matrixWorldInverse` is only refreshed inside render(), so it has to be brought
    // up to date here or the frustum lags a frame behind the camera — and is simply
    // wrong on the first one.
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    const maxDistance = this.quality.budget.viewDistance;
    this.chunksVisible = 0;
    for (const chunk of this.chunks) {
      this.sphere.set(chunk.centre, chunk.radius);
      const tooFar = chunk.centre.distanceTo(this.camera.position) - chunk.radius > maxDistance;
      const visible = !tooFar && this.frustum.intersectsSphere(this.sphere);
      chunk.group.visible = visible;
      if (visible) this.chunksVisible++;
    }

    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }

  stats(): RendererStats {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      chunksVisible: this.chunksVisible,
      chunksTotal: this.chunks.length,
      fps: Math.round(this.fps),
      renderScale: this.quality.renderScale,
      tier: this.quality.tier
    };
  }

  /** Projects a world point to CSS pixels, for NPC name labels and target markers. */
  project(point: Vector3): { x: number; y: number; visible: boolean } {
    const projected = point.clone().project(this.camera);
    const canvas = this.renderer.domElement;
    return {
      x: (projected.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight,
      visible: projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1
    };
  }

  dispose(): void {
    this.clearChunks();
    this.renderer.dispose();
  }
}

function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Object3D & { geometry?: { dispose(): void }; material?: unknown };
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) for (const m of material) (m as { dispose?: () => void }).dispose?.();
    else (material as { dispose?: () => void } | undefined)?.dispose?.();
  });
}
