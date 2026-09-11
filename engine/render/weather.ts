/**
 * Rain, snow and mist as particle systems, driven by the calendar and by scene
 * scripts. Counts come from the active quality tier's particle budget.
 *
 * Everything here listens on the event bus rather than being called directly, which
 * is the same seam a later sound pack will use for `weather.rain`.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial, type Scene } from 'three';
import { bus } from '../core/bus';

type Kind = 'rain' | 'snow' | 'mist' | 'none';

export class Weather {
  private points: Points | null = null;
  private velocities = new Float32Array(0);
  private kind: Kind = 'none';
  private intensity = 0;
  private unsubscribes: (() => void)[] = [];

  constructor(private scene: Scene, private budget: number, private reducedMotion: boolean) {
    this.unsubscribes.push(
      bus.on('weather.rain', ({ intensity }) => this.set('rain', intensity)),
      bus.on('weather.snow', ({ intensity }) => this.set('snow', intensity)),
      bus.on('weather.mist', ({ intensity }) => this.set('mist', intensity)),
      bus.on('weather.storm', ({ intensity }) => this.set('rain', Math.min(1, intensity + 0.3))),
      bus.on('weather.clear', () => this.set('none', 0))
    );
  }

  set(kind: Kind, intensity: number): void {
    this.kind = kind;
    this.intensity = intensity;
    this.rebuild();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.rebuild();
  }

  private rebuild(): void {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as PointsMaterial).dispose();
      this.points = null;
    }
    if (this.kind === 'none' || this.intensity <= 0) return;

    // prefers-reduced-motion keeps the atmosphere and drops most of the movement.
    const scale = this.reducedMotion ? 0.3 : 1;
    const count = Math.floor(this.budget * this.intensity * scale);
    if (count <= 0) return;

    const positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 42;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
      this.velocities[i] = this.kind === 'rain' ? 24 + Math.random() * 14 : this.kind === 'snow' ? 2.4 + Math.random() * 1.8 : 0.25;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: this.kind === 'rain' ? 0x9fc4d4 : this.kind === 'snow' ? 0xf0f6fa : 0xc9d8dd,
      size: this.kind === 'rain' ? 0.12 : this.kind === 'snow' ? 0.26 : 0.9,
      transparent: true,
      opacity: this.kind === 'mist' ? 0.17 : 0.65,
      depthWrite: false,
      blending: this.kind === 'mist' ? AdditiveBlending : undefined
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(dtSeconds: number, centreX: number, centreZ: number): void {
    if (!this.points) return;
    const attribute = this.points.geometry.getAttribute('position') as BufferAttribute;
    const array = attribute.array as Float32Array;
    const drift = this.kind === 'snow' ? Math.sin(performance.now() / 1400) * 1.2 : 0;
    for (let i = 0; i < this.velocities.length; i++) {
      const y = i * 3 + 1;
      array[y] = (array[y] ?? 0) - (this.velocities[i] ?? 0) * dtSeconds;
      if (this.kind === 'snow') array[i * 3] = (array[i * 3] ?? 0) + drift * dtSeconds;
      if ((array[y] ?? 0) < 0) {
        array[i * 3] = centreX + (Math.random() - 0.5) * 120;
        array[y] = 42;
        array[i * 3 + 2] = centreZ + (Math.random() - 0.5) * 120;
      }
    }
    attribute.needsUpdate = true;
    this.points.position.set(0, 0, 0);
  }

  dispose(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    this.set('none', 0);
  }
}
