/**
 * The sky, and the light it throws back.
 *
 * The background used to be `setClearColor` — one flat colour behind everything, with
 * no horizon and no gradient, so an outdoor area was a coloured void with objects in
 * front of it. Worse for the new materials: physically based shading reflects its
 * surroundings, and with nothing to reflect, every rough surface loses its sheen and
 * anything metallic renders black.
 *
 * So this draws a small equirectangular gradient — zenith, horizon haze, ground bounce,
 * and a soft sun where the sun actually is — and hands it to three twice: once as the
 * scene background, and once through `PMREMGenerator` as the environment every material
 * reflects. Both come from the same few colours the area already declares, so the light
 * in the world and the sky behind it can never disagree.
 *
 * It is drawn into a 128 x 64 canvas. That is tiny, and deliberately so: it is a smooth
 * gradient, it will be blurred into irradiance anyway, and it costs no download.
 */
import {
  Color, CanvasTexture, EquirectangularReflectionMapping, PMREMGenerator, SRGBColorSpace,
  type Texture, type WebGLRenderer
} from 'three';

export interface SkyDescription {
  /** Straight up. */
  zenith: number;
  /** The band around the horizon, usually the area's own fog colour. */
  horizon: number;
  /** Bounce from below, which keeps undersides from going flat black. */
  ground: number;
  /** 0 dawn, 0.5 noon, 1 dusk. Places the sun and warms it. */
  timeOfDay: number;
  /** Interiors and caves get no sun disc and a much tighter range. */
  enclosed: boolean;
}

// Small, but no longer tiny: the gradient needed almost no resolution, cloud banding
// does. It is still a fraction of a kilobyte of canvas and costs nothing to download.
const WIDTH = 512;
const HEIGHT = 256;

function draw(sky: SkyDescription): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const zenith = new Color(sky.zenith);
  const horizon = new Color(sky.horizon);
  const ground = new Color(sky.ground);
  const scratch = new Color();

  for (let y = 0; y < HEIGHT; y++) {
    // 0 at the top of the sphere, 1 at the bottom.
    const t = y / (HEIGHT - 1);
    if (t < 0.5) {
      // Above the horizon. Squared so the haze hugs the horizon instead of washing
      // the whole dome out, which is what makes a gradient read as depth.
      // A gentle curve. At 2.2 the haze climbed most of the way to the zenith and the
      // sky read as one flat murky band instead of a gradient.
      const k = Math.pow(t / 0.5, 1.35);
      scratch.copy(zenith).lerp(horizon, k);
    } else {
      const k = Math.min(1, ((t - 0.5) / 0.5) * 1.6);
      scratch.copy(horizon).lerp(ground, k);
    }
    ctx.fillStyle = `#${scratch.getHexString()}`;
    ctx.fillRect(0, y, WIDTH, 1);
  }

  if (!sky.enclosed) {
    // Cloud banding: soft horizontal streaks thickening towards the horizon, drawn from
    // a fixed hash so the sky is the same sky on every device and every run. Clouds are
    // the cheapest depth cue there is — the dome was a clean gradient, which reads as a
    // painted backdrop the moment a player looks up, and on a phone they look up a lot.
    let seed = 20260912;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const overcast = 0.35 + (1 - Math.abs(sky.timeOfDay - 0.5) * 2) * 0.25;
    ctx.save();
    for (let i = 0; i < 46; i++) {
      // Above the horizon only, and squashed flat: a cloud seen from below is a long
      // shallow smear, not a puff.
      const y = HEIGHT * (0.06 + Math.pow(rand(), 0.55) * 0.4);
      const x = rand() * WIDTH;
      const width = WIDTH * (0.06 + rand() * 0.16);
      const height = Math.max(3, width * (0.1 + rand() * 0.13));
      const band = ctx.createRadialGradient(x, y, 0, x, y, width);
      const lift = 0.1 + rand() * overcast;
      band.addColorStop(0, `rgba(255,255,255,${lift.toFixed(3)})`);
      band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, height / width);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y, width, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  if (!sky.enclosed) {
    // A soft warm disc where the sun is, low at dawn and dusk and high at noon. It is
    // never a hard edge: this texture is the light source for every reflection, and a
    // hard disc at this resolution produces a visible square in the specular.
    const noon = 1 - Math.abs(sky.timeOfDay - 0.5) * 2;
    const sunY = HEIGHT * (0.46 - noon * 0.26);
    const sunX = WIDTH * (0.18 + sky.timeOfDay * 0.64);
    const radius = HEIGHT * 0.42;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius);
    const warmth = noon > 0.6 ? '255,242,214' : '255,198,150';
    glow.addColorStop(0, `rgba(${warmth},${0.55 + noon * 0.35})`);
    glow.addColorStop(0.35, `rgba(${warmth},0.20)`);
    glow.addColorStop(1, `rgba(${warmth},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  return canvas;
}

/**
 * Holds the current sky and its blurred environment, and rebuilds both only when the
 * description actually changes — area entry, not every frame.
 */
export class Sky {
  private pmrem: PMREMGenerator;
  private key = '';
  private background: Texture | null = null;
  private environment: Texture | null = null;

  constructor(renderer: WebGLRenderer) {
    this.pmrem = new PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
  }

  /** Returns the background and environment textures for this sky, cached. */
  update(sky: SkyDescription): { background: Texture | null; environment: Texture | null } {
    const key = `${sky.zenith}|${sky.horizon}|${sky.ground}|${sky.timeOfDay.toFixed(2)}|${sky.enclosed}`;
    if (key === this.key) return { background: this.background, environment: this.environment };

    const canvas = draw(sky);
    if (!canvas) return { background: null, environment: null };

    this.background?.dispose();
    this.environment?.dispose();

    const texture = new CanvasTexture(canvas);
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = SRGBColorSpace;
    this.background = texture;
    this.environment = this.pmrem.fromEquirectangular(texture).texture;
    this.key = key;
    return { background: this.background, environment: this.environment };
  }

  dispose(): void {
    this.background?.dispose();
    this.environment?.dispose();
    this.pmrem.dispose();
  }
}
