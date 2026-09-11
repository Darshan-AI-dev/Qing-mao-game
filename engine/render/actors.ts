/**
 * Actors.
 *
 * The shipping plan is glTF characters with skinned animation, loaded from the act
 * packs. Until a rig lands for a given character, the same actor API builds a
 * faceted stand-in from the canon bible's palette — so scenes, gestures and camera
 * work can all be authored and reviewed before any art exists, and swapping a real
 * model in later changes nothing above this file.
 *
 * The shared animation set every rig must provide is listed in `ANIMATIONS`. The
 * content lint checks that a glTF claiming to be a character rig exposes all of them.
 */
import {
  AnimationMixer, Bone, BoxGeometry, CapsuleGeometry, CircleGeometry, Color,
  ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D,
  SkinnedMesh, Vector3, type AnimationClip
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { charactersById, type CanonCharacter } from '../../canon/index';

export const ANIMATIONS = [
  'idle', 'walk', 'run',
  'cultivate',
  'cast', 'strike', 'guard', 'dodge', 'hit', 'fall',
  'talk-point', 'talk-bow', 'talk-cross-arms', 'talk-dismiss'
] as const;
export type AnimationName = (typeof ANIMATIONS)[number];

export interface ActorOptions {
  /** Canon character ID. */
  id: string;
  /** Appearance variant, e.g. Bai's one-arm model before chapter 199. */
  variant?: string | null;
  /** Shadows are off on the Low tier, where a blob shadow is drawn instead. */
  shadows: boolean;
}

const rgb = (c: [number, number, number]) => new Color(c[0], c[1], c[2]);

export class Actor {
  readonly root = new Group();
  readonly id: string;
  private mixer: AnimationMixer | null = null;
  private clips = new Map<string, AnimationClip>();
  private current: AnimationName = 'idle';
  private procedural: { torso: Object3D; head: Object3D; arms: Object3D[]; legs: Object3D[]; blob: Object3D | null } | null = null;
  private phase = Math.random() * Math.PI * 2;
  private walking = false;
  private gesture: AnimationName | null = null;
  private gestureUntil = 0;

  constructor(options: ActorOptions) {
    this.id = options.id;
    const character = charactersById.get(options.id);
    if (!character) throw new Error(`Unknown character: ${options.id}`);
    this.procedural = buildStandIn(character, options, this.root);
    this.root.name = `actor:${options.id}`;
  }

  /** Replaces the stand-in with a real rig. Nothing above this call needs to change. */
  async loadRig(url: string): Promise<boolean> {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      if (this.procedural) {
        this.root.clear();
        this.procedural = null;
      }
      this.root.add(gltf.scene);
      gltf.scene.traverse((node) => {
        if (node instanceof SkinnedMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          node.frustumCulled = false;
        }
      });
      this.mixer = new AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) this.clips.set(clip.name, clip);
      this.play('idle');
      return true;
    } catch {
      // A missing rig is never fatal: the stand-in stays and the scene still plays.
      return false;
    }
  }

  missingAnimations(): AnimationName[] {
    if (!this.mixer) return [];
    return ANIMATIONS.filter((name) => !this.clips.has(name));
  }

  play(name: AnimationName, once = false): void {
    if (this.mixer) {
      const clip = this.clips.get(name);
      if (clip) {
        const action = this.mixer.clipAction(clip);
        this.mixer.stopAllAction();
        action.reset();
        action.setLoop(once ? 2200 : 2201, once ? 1 : Infinity); // LoopOnce : LoopRepeat
        action.clampWhenFinished = once;
        action.play();
      }
    }
    this.current = name;
    this.walking = name === 'walk' || name === 'run';
    if (once) {
      this.gesture = name;
      this.gestureUntil = performance.now() + 900;
    }
  }

  get playing(): AnimationName {
    return this.current;
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  get position(): Vector3 {
    return this.root.position;
  }

  setFacing(radians: number): void {
    this.root.rotation.y = radians;
  }

  /** Used by the `face` timeline command. */
  faceTowards(target: Vector3): void {
    const dx = target.x - this.root.position.x;
    const dz = target.z - this.root.position.z;
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  update(dtSeconds: number, now: number): void {
    if (this.mixer) {
      this.mixer.update(dtSeconds);
      return;
    }
    if (!this.procedural) return;
    // Stand-in animation: breathing, a walk swing, and a held gesture.
    this.phase += dtSeconds * (this.walking ? 7 : 1.5);
    const breath = Math.sin(this.phase) * 0.018;
    this.procedural.torso.position.y = breath;
    this.procedural.head.position.y = 2.2 + breath;
    const gesturing = this.gesture !== null && now < this.gestureUntil;
    if (!gesturing) this.gesture = null;
    this.procedural.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      const swing = this.walking ? Math.sin(this.phase) * side * 0.18 : 0;
      const raise = gesturing && side === 1 ? 0.32 : 0;
      arm.position.set(side * 0.48, 1.94 + breath + raise, swing - raise * 0.8);
      arm.rotation.z = side * (gesturing ? 0.3 : 0.06);
    });
    this.procedural.legs.forEach((leg, i) => {
      const side = i === 0 ? -1 : 1;
      const swing = this.walking ? Math.sin(this.phase) * side * 0.18 : 0;
      leg.position.set(side * 0.19, Math.max(0, swing * 0.4), -swing);
    });
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.clear();
  }
}

function buildStandIn(character: CanonCharacter, options: ActorOptions, root: Group) {
  const { robe, trim, hair, skin } = character.palette;
  const robeMat = new MeshLambertMaterial({ color: rgb(robe) });
  const trimMat = new MeshLambertMaterial({ color: rgb(trim) });
  const hairMat = new MeshLambertMaterial({ color: rgb(hair) });
  const skinMat = new MeshLambertMaterial({ color: rgb(skin) });

  const broad = character.rig?.includes('broad') ? 1.2 : 1;
  const oneArm = options.variant ? character.variants?.find((v) => v.id === options.variant)?.oneArm ?? false : false;

  const torso = new Group();
  const gown = new Mesh(new ConeGeometry(0.56 * broad, 1.7, 16, 1, true), robeMat);
  gown.position.y = 1.05;
  const sash = new Mesh(new BoxGeometry(0.8 * broad, 0.16, 0.66), trimMat);
  sash.position.y = 1.25;
  torso.add(gown, sash);

  const head = new Group();
  const skull = new Mesh(new CapsuleGeometry(0.24, 0.16, 4, 10), skinMat);
  const crown = new Mesh(new ConeGeometry(0.3, 0.2, 14), hairMat);
  crown.position.y = 0.28;
  head.add(skull, crown);
  head.position.y = 2.2;

  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    if (oneArm && side === -1) continue;
    const arm = new Mesh(new CapsuleGeometry(0.11, 0.62, 3, 7), robeMat);
    arm.position.set(side * 0.48, 1.94, 0);
    arms.push(arm);
    root.add(arm);
  }

  const legs: Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new Mesh(new BoxGeometry(0.2, 0.6, 0.24), robeMat);
    leg.position.set(side * 0.19, 0.3, 0);
    legs.push(leg);
    root.add(leg);
  }

  let blob: Object3D | null = null;
  if (!options.shadows) {
    // Low tier: one flat dark disc under the actor instead of a shadow map.
    blob = new Mesh(new CircleGeometry(0.62, 12), new MeshBasicMaterial({ color: 0x0a1418, transparent: true, opacity: 0.32 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    root.add(blob);
  }

  root.add(torso, head);
  if (options.shadows) {
    root.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
  }
  // A single root bone so a later rig swap has something to align to.
  const rootBone = new Bone();
  rootBone.name = 'root';
  root.add(rootBone);
  return { torso, head, arms, legs, blob };
}
