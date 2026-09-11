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
  private lastFrame = performance.now();
  private fps = 60;
  private chunksVisible = 0;

  constructor(canvas: HTMLCanvasElement, tier: TierName, renderScale: number) {
    const context = canvas.getContext('webgl2', { antialias: tier !== 'low', alpha: false });
    if (!context) throw new Error('WebGL2 is unavailable.');

    this.renderer = new WebGLRenderer({ canvas, context, antialias: tier !== 'low' });
    this.renderer.setClearColor(new Color(0x184048));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.quality = new AdaptiveQuality(tier, renderScale);

    const budget = BUDGETS[tier];
    this.renderer.shadowMap.enabled = budget.shadows !== 'blob';
    if (budget.shadows === 'soft') this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.camera = new PerspectiveCamera(52, 1, 0.2, budget.viewDistance + 60);
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
  }

  addLantern(x: number, y: number, z: number): void {
    if (this.lanterns.length >= this.quality.budget.lanterns) return;
    const light = new PointLight(0xffb15c, 1.6, 16, 2);
    light.position.set(x, y, z);
    this.lanterns.push(light);
    this.scene.add(light);
  }

  /** Time of day tints the hemisphere and sun; underground areas go genuinely dark. */
  setLighting(options: { timeOfDay: number; underground: boolean; fogColor: number; fogNear: number; fogFar: number }): void {
    const { timeOfDay, underground, fogColor, fogNear, fogFar } = options;
    if (underground) {
      this.hemi.intensity = 0.1;
      this.hemi.color.setHex(0x2a3440);
      this.hemi.groundColor.setHex(0x10161a);
      this.sun.intensity = 0;
      this.ambient.intensity = 0.05;
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
      this.renderer.setClearColor(new Color(fogColor));
    }
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const cap = this.quality.tier === 'high' ? 2 : 1.6;
    const dpr = Math.min(window.devicePixelRatio || 1, cap) * this.quality.renderScale;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
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
