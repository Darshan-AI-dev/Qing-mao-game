/**
 * The postprocessing chain. High tier only.
 *
 * One effect, chosen because it is the one this game is actually about: bloom. Almost
 * every light source in Qing Mao is a small warm thing in a dark place — paper lanterns
 * on posts, a brazier in a forge, the aperture opening at the awakening river, a Gu
 * going off in a fight. Without bloom those are just brighter pixels; with it they
 * throw light into the air around them, which is most of the difference between a lit
 * scene and a scene with lamps drawn on it.
 *
 * It is deliberately restrained: a high threshold so only genuinely bright things
 * bloom, and a small radius. Bloom applied generously turns every pale surface into fog
 * and is the single easiest way to make a game look cheap.
 *
 * Tone mapping needs no special handling, which is worth writing down because the
 * obvious guess is wrong: three already skips it while drawing into a render target,
 * and `OutputPass` applies the renderer's own setting at the end of the chain. Turning
 * the renderer's tone mapping off here — the fix for a double-map that never happens —
 * turns it off for everyone.
 */
import { Vector2, type Scene, type Camera, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Post {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    // strength, radius, threshold. The threshold is the important one: at 0.85 only a
    // lantern flame or an ability's flash clears it, not a pale wall in sunlight.
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.42, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Bloom strength, so a scene can push it for an ability or an awakening. */
  setStrength(strength: number): void {
    this.bloom.strength = strength;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
