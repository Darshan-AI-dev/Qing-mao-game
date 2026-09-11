/**
 * Quality tiers and the performance budgets from the design review.
 *
 * Measured in the previous build (headless Chromium, start of the village):
 * ~120 draw calls and ~326,000 vertices every frame with no culling, ~16 MB of
 * geometry uploaded. Tolerable on a desktop GPU, risky on a low-end phone.
 *
 * The tier is picked from a short benchmark on first launch and can always be
 * overridden by hand — a recent flagship phone should not be pinned to Low just
 * because it is a phone.
 */
export type TierName = 'low' | 'medium' | 'high';

export interface Budget {
  targetFps: number;
  drawCalls: number;
  triangles: number;
  shadows: 'blob' | 'single-cascade' | 'soft';
  renderScale: [number, number];
  /** Distance beyond which chunks are not submitted at all. */
  viewDistance: number;
  instanceBudget: number;
  lanterns: number;
  particles: number;
}

export const BUDGETS: Record<TierName, Budget> = {
  low:    { targetFps: 30, drawCalls: 150, triangles: 250_000, shadows: 'blob',            renderScale: [0.75, 1.0], viewDistance: 110, instanceBudget: 700,  lanterns: 4,  particles: 300 },
  medium: { targetFps: 60, drawCalls: 300, triangles: 600_000, shadows: 'single-cascade',  renderScale: [1.0, 1.0],  viewDistance: 170, instanceBudget: 2000, lanterns: 10, particles: 900 },
  high:   { targetFps: 60, drawCalls: 600, triangles: 1_500_000, shadows: 'soft',          renderScale: [1.0, 2.0],  viewDistance: 260, instanceBudget: 5000, lanterns: 24, particles: 2200 }
};

export interface BenchmarkResult {
  tier: TierName;
  score: number;
  reason: string;
}

/**
 * A short benchmark: time a fixed amount of work, then sanity-check it against the
 * GPU renderer string and the device's memory hint. Deliberately cheap — it runs
 * once, before the title screen.
 */
export function benchmark(gl: WebGL2RenderingContext | null): BenchmarkResult {
  const start = performance.now();
  // A fixed arithmetic load. Slower devices take longer; that is the whole signal.
  let acc = 0;
  for (let i = 0; i < 2_000_000; i++) acc += Math.sqrt(i % 997);
  const cpuMs = performance.now() - start;
  void acc;

  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = debugInfo ? String(gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '') : '';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  const cores = navigator.hardwareConcurrency ?? 2;

  // Software rasterisers always land on Low regardless of how fast the CPU is.
  if (/swiftshader|software|basic render/i.test(renderer)) {
    return { tier: 'low', score: 0, reason: 'Software rendering detected.' };
  }

  const score = (cpuMs > 0 ? 400 / cpuMs : 1) * Math.min(2, cores / 4 + 0.5) + (memory >= 6 ? 0.5 : 0);
  if (score >= 2.2) return { tier: 'high', score, reason: `Benchmark ${score.toFixed(2)} on ${cores} cores.` };
  if (score >= 1.1) return { tier: 'medium', score, reason: `Benchmark ${score.toFixed(2)} on ${cores} cores.` };
  return { tier: 'low', score, reason: `Benchmark ${score.toFixed(2)} on ${cores} cores.` };
}

export interface FrameStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  renderScale: number;
}

/**
 * Watches the frame rate and nudges the render scale inside the tier's range before
 * it gives up and drops a tier. Keeps a recent phone at its chosen quality instead
 * of demoting it on one bad second.
 */
export class AdaptiveQuality {
  private samples: number[] = [];
  private lastChange = 0;

  constructor(public tier: TierName, public renderScale: number) {}

  get budget(): Budget {
    return BUDGETS[this.tier];
  }

  /** Returns a new render scale when one is warranted, otherwise null. */
  sample(dtMs: number, now: number): number | null {
    this.samples.push(1000 / Math.max(1, dtMs));
    if (this.samples.length < 60) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 60;
    this.samples = [];
    if (now - this.lastChange < 3000) return null;

    const [min, max] = this.budget.renderScale;
    const target = this.budget.targetFps;
    if (median < target * 0.85 && this.renderScale > min) {
      this.lastChange = now;
      this.renderScale = Math.max(min, Math.round((this.renderScale - 0.1) * 100) / 100);
      return this.renderScale;
    }
    if (median > target * 1.05 && this.renderScale < max) {
      this.lastChange = now;
      this.renderScale = Math.min(max, Math.round((this.renderScale + 0.1) * 100) / 100);
      return this.renderScale;
    }
    return null;
  }
}

/** The message shown when WebGL2 is missing, rather than a blank canvas. */
export const NO_WEBGL2_MESSAGE =
  'This game needs WebGL2, which your browser does not provide. WebGL2 ships in ' +
  'current Chrome, Edge, Firefox and Safari 15 and later. Updating your browser, or ' +
  'turning hardware acceleration back on, should be enough.';

export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

export function hasDialogSupport(): boolean {
  return typeof HTMLDialogElement !== 'undefined' && 'showModal' in HTMLDialogElement.prototype;
}
