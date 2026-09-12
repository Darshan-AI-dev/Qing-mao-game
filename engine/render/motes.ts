/**
 * Motes: the dust, pollen and ash that is always in the air.
 *
 * Weather is an event — rain when a scene calls for rain — and between those events the
 * air was completely empty. Nothing moved in a scene unless a person walked through it,
 * which is most of why a still frame of the village looked like a diorama rather than a
 * place. A few hundred slow specks drifting through a shaft of light fixes that for
 * almost nothing: one draw call, one buffer, and no lighting work at all.
 *
 * They live in a box that follows the camera and wrap when they leave it, so the player
 * can walk for an hour and never leave the weather. Additive blending and a small size
 * keep them as suggestions rather than as snow — this is the effect that looks cheapest
 * when it is overdone.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, PointsMaterial, type Scene
} from 'three';

export interface MoteStyle {
  /** How many, before the tier budget and reduced motion take their cut. */
  density: number;
  colour: number;
  /** Half-width of the box they live in, in metres. */
  reach: number;
  /** How high above the ground they drift. */
  ceiling: number;
  /** Metres per second upward. Indoor dust rises; outdoor pollen mostly hangs. */
  rise: number;
}

export class Motes {
  private points: Points | null = null;
  private drift = new Float32Array(0);
  private style: MoteStyle | null = null;

  constructor(private scene: Scene, private budget: number, private reducedMotion: boolean) {}

  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    if (this.style) this.configure(this.style);
  }

  configure(style: MoteStyle): void {
    this.style = style;
    this.clear();
    // Reduced motion keeps a few so the air is not dead, and slows them right down.
    const scale = this.reducedMotion ? 0.25 : 1;
    const count = Math.floor(Math.min(this.budget * 0.35, style.density) * scale);
    if (count <= 0) return;

    const positions = new Float32Array(count * 3);
    this.drift = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * style.reach * 2;
      positions[i * 3 + 1] = Math.random() * style.ceiling;
      positions[i * 3 + 2] = (Math.random() - 0.5) * style.reach * 2;
      // Each speck keeps its own lazy heading, so they never move as a sheet.
      this.drift[i * 3] = (Math.random() - 0.5) * 0.5;
      this.drift[i * 3 + 1] = style.rise * (0.4 + Math.random());
      this.drift[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: new Color(style.colour),
        size: 0.17,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: AdditiveBlending
      })
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.scene.add(this.points);
  }

  update(dtSeconds: number, centreX: number, centreZ: number): void {
    if (!this.points || !this.style) return;
    const { reach, ceiling } = this.style;
    const attribute = this.points.geometry.getAttribute('position') as BufferAttribute;
    const array = attribute.array as Float32Array;
    const slow = this.reducedMotion ? 0.3 : 1;
    // One shared sway so they all breathe together, plus each speck's own heading.
    const sway = Math.sin(performance.now() / 2600) * 0.35;
    for (let i = 0; i < array.length; i += 3) {
      array[i] = (array[i] ?? 0) + ((this.drift[i] ?? 0) + sway) * dtSeconds * slow;
      array[i + 1] = (array[i + 1] ?? 0) + (this.drift[i + 1] ?? 0) * dtSeconds * slow;
      array[i + 2] = (array[i + 2] ?? 0) + (this.drift[i + 2] ?? 0) * dtSeconds * slow;
      if ((array[i + 1] ?? 0) > ceiling) array[i + 1] = 0;
      // Wrap around the camera rather than respawning at an edge, which would show up
      // as a line of specks appearing whenever the player turns.
      const dx = (array[i] ?? 0) - centreX;
      const dz = (array[i + 2] ?? 0) - centreZ;
      if (dx > reach) array[i] = (array[i] ?? 0) - reach * 2;
      else if (dx < -reach) array[i] = (array[i] ?? 0) + reach * 2;
      if (dz > reach) array[i + 2] = (array[i + 2] ?? 0) - reach * 2;
      else if (dz < -reach) array[i + 2] = (array[i + 2] ?? 0) + reach * 2;
    }
    attribute.needsUpdate = true;
  }

  private clear(): void {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
    this.points = null;
  }

  dispose(): void {
    this.clear();
    this.style = null;
  }
}
