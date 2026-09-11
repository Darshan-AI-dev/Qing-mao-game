/**
 * Silent-first feedback.
 *
 * There is no sound in this version, so everything that would have been a cue has
 * a visual one: camera shake, hit flashes, telegraph animation, essence-drain pulses
 * on the HUD, and an edge vignette when vitality is low. Camera shake and the
 * heavier animations respect the reduced-motion setting and the OS preference.
 *
 * Haptics go through the Vibration API where it exists. iOS Safari does not support
 * it, which is why haptics are an enhancement and never the only signal.
 */
import { bus } from '../core/bus';

export class Feedback {
  private shake = 0;
  private flash: HTMLElement;
  private vignette: HTMLElement;
  private offs: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, private reducedMotion: () => boolean, private hapticsOn: () => boolean) {
    this.flash = document.createElement('div');
    this.flash.className = 'hitFlash';
    this.vignette = document.createElement('div');
    this.vignette.className = 'lowVitality';
    document.body.append(this.flash, this.vignette);

    this.offs.push(
      bus.on('camera.shake', ({ strength }) => {
        if (!this.reducedMotion()) this.shake = Math.min(1, this.shake + strength);
      }),
      bus.on('hit.player', () => {
        this.flash.classList.remove('on');
        // Reflow so the animation restarts on consecutive hits.
        void this.flash.offsetWidth;
        this.flash.classList.add('on');
      }),
      bus.on('player.vitality', ({ value, max }) => {
        const ratio = max > 0 ? value / max : 1;
        this.vignette.style.opacity = ratio < 0.35 ? String(Math.min(0.85, (0.35 - ratio) * 2.6)) : '0';
      }),
      bus.on('haptic', ({ pattern }) => {
        if (!this.hapticsOn()) return;
        // Absent on iOS Safari; the optional chain is the whole fallback.
        navigator.vibrate?.(pattern);
      })
    );
  }

  /** Applied to the canvas transform so it never disturbs layout. */
  update(dtSeconds: number): void {
    if (this.shake <= 0.001) {
      if (this.canvas.style.transform) this.canvas.style.transform = '';
      return;
    }
    const amount = this.shake * 7;
    const x = (Math.random() - 0.5) * amount;
    const y = (Math.random() - 0.5) * amount;
    this.canvas.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    this.shake = Math.max(0, this.shake - dtSeconds * 3.2);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.flash.remove();
    this.vignette.remove();
  }
}

/** Colour-blind-safe telegraph: shape and pattern carry the meaning, colour repeats it. */
export function telegraphSvg(shape: string, pattern: string, seconds: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', `telegraph shape-${shape} pattern-${pattern}`);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.style.setProperty('--telegraph-seconds', `${seconds}s`);

  const dash: Record<string, string> = { solid: '', dashed: '8 6', dotted: '2 6', chevron: '14 4 4 4', hatched: '3 3' };
  const path = document.createElementNS(ns, 'path');
  const shapes: Record<string, string> = {
    ring: 'M50 8 A42 42 0 1 1 49.9 8 Z',
    cone: 'M50 92 L12 22 A42 42 0 0 1 88 22 Z',
    line: 'M38 96 L38 6 L62 6 L62 96 Z',
    slam: 'M50 6 L94 50 L50 94 L6 50 Z',
    arc: 'M10 78 A50 50 0 0 1 90 78'
  };
  path.setAttribute('d', shapes[shape] ?? shapes.ring!);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '5');
  if (dash[pattern]) path.setAttribute('stroke-dasharray', dash[pattern]!);
  svg.append(path);
  return svg;
}
