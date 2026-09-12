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
  CylinderGeometry, Group, Mesh, MeshBasicMaterial,
  Object3D, SkinnedMesh, Vector3, type AnimationClip
} from 'three';
import { surface } from './surfaces';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { charactersById, type CanonCharacter } from '../../canon/index';

/**
 * Actors face **+z** in local space.
 *
 * `setFacing(Math.atan2(dx, dz))` points the model's local +z along the direction of
 * travel, so the front of the model has to be +z or the character moon-walks. The
 * first version built the face at -z and the hair at +z, which is precisely that bug.
 * Every face-side detail below is at positive z and every back-side detail at negative.
 */
export const FACING_AXIS = '+z';

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

  /**
   * Local z of the face and of the hair behind it. The face must be in front (+z) and
   * the hair behind (-z), or `setFacing` will point the model's back down the path.
   */
  facingProbe(): { faceZ: number; backZ: number; rotationY: number } {
    let faceZ = 0;
    let backZ = 0;
    this.root.traverse((node) => {
      if (node.name === 'face') faceZ = node.position.z;
      if (node.name === 'hair-back') backZ = node.position.z;
    });
    return { faceZ, backZ, rotationY: this.root.rotation.y };
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
    this.procedural.head.position.y = 1.9 + breath;
    const gesturing = this.gesture !== null && now < this.gestureUntil;
    if (!gesturing) this.gesture = null;
    this.procedural.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      const swing = this.walking ? Math.sin(this.phase) * side * 0.18 : 0;
      const raise = gesturing && side === 1 ? 0.32 : 0;
      arm.position.set(side * 0.34, 1.6 + breath + raise * 0.5, swing - raise * 0.5);
      arm.rotation.x = swing * 1.4;
      arm.rotation.z = side * (gesturing ? 0.5 : 0.05);
    });
    this.procedural.legs.forEach((leg, i) => {
      const side = i === 0 ? -1 : 1;
      const swing = this.walking ? Math.sin(this.phase) * side * 0.18 : 0;
      leg.position.set(side * 0.13, 0.05 + Math.max(0, swing * 0.25), swing * 0.9);
    });
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.clear();
  }
}

function buildStandIn(character: CanonCharacter, options: ActorOptions, root: Group) {
  const { robe, trim, hair, skin } = character.palette;
  // Cloth for the robe, cloth with a tighter weave for the trim, and skin that takes
  // almost no grain — a face is the closest thing to the camera in every scene, and
  // stone-sized noise on it reads as damage rather than as detail.
  const robeMat = surface('cloth', rgb(robe));
  const trimMat = surface('cloth', rgb(trim), { roughness: 0.55, repeat: 3.2 });
  const hairMat = surface('cloth', rgb(hair), { roughness: 0.42, repeat: 4 });
  const skinMat = surface('skin', rgb(skin));

  const broad = character.rig?.includes('broad') ? 1.18 : character.rig?.includes('female') ? 0.92 : 1;
  const oneArm = options.variant
    ? character.variants?.find((v) => v.id === options.variant)?.oneArm ?? false
    : false;

  // Proportions, in world units, with the head at roughly 2.05:
  //   robe skirt 0.00-1.15, torso 1.15-1.68, head 1.72-2.10.
  // The first version put a 0.3-radius cone on top of the skull and left a gap between
  // the head and the body, which read as a cone wearing a hat rather than a person.
  const torso = new Group();

  // Closed, and less flared than it was. Open-ended, the skirt had no bottom and its
  // inner wall was back-face culled, so from a low camera you looked straight through
  // the front of the robe at the lit inside of the back of it: on a phone, where the
  // camera sits close and low in a room, Fang Yuan read as a pale lampshade.
  const skirt = new Mesh(new CylinderGeometry(0.3 * broad, 0.4 * broad, 1.15, 12, 1, false), robeMat);
  skirt.position.y = 0.575;
  const chest = new Mesh(new CylinderGeometry(0.26 * broad, 0.3 * broad, 0.54, 12), robeMat);
  chest.position.y = 1.42;
  // Cross-collar, the detail that makes the silhouette read as a robe.
  const collar = new Mesh(new BoxGeometry(0.42 * broad, 0.2, 0.3), trimMat);
  collar.position.set(0, 1.62, 0.08);
  collar.rotation.z = 0.24;
  const sash = new Mesh(new BoxGeometry(0.64 * broad, 0.12, 0.4), trimMat);
  sash.position.y = 1.16;
  // Rounded shoulders. A flat box across the top read as a plank laid on a tube, and
  // the shoulder line is most of what tells you a figure's build at phone distance.
  const shoulders = new Mesh(new CapsuleGeometry(0.15, 0.4 * broad, 4, 10), robeMat);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 1.63;
  // A band at the hem, so the robe ends in something rather than being cut off.
  const hem = new Mesh(new CylinderGeometry(0.305 * broad, 0.405 * broad, 0.11, 12), trimMat);
  hem.position.y = 0.055;
  // Sash ties hanging at the front. Small, and the only part of him that reads as
  // cloth rather than as carpentry.
  const ties: Mesh[] = [];
  for (const side of [-1, 1]) {
    const tie = new Mesh(new BoxGeometry(0.06, 0.44, 0.04), trimMat);
    tie.position.set(side * 0.09, 0.94, 0.19 * broad);
    tie.rotation.z = side * 0.06;
    ties.push(tie);
  }
  torso.add(skirt, chest, collar, sash, shoulders, hem, ...ties);

  const head = new Group();
  const skull = new Mesh(new CapsuleGeometry(0.165, 0.1, 4, 12), skinMat);
  const neck = new Mesh(new CylinderGeometry(0.075, 0.09, 0.12, 8), skinMat);
  neck.position.y = -0.2;
  head.add(skull, neck);
  head.position.y = 1.9;

  // Hair follows the canon bible rather than being one shape for everyone. Fang Yuan
  // wears his long and black: loose in the bamboo room, gathered back after that.
  const hairSpec = character.hair ?? { length: 'short', style: 'loose' };
  const cap = new Mesh(new CapsuleGeometry(0.175, 0.06, 4, 12), hairMat);
  cap.position.y = 0.055;
  cap.scale.set(1, 0.78, 1);
  head.add(cap);
  // The face is cut out of the cap so it does not read as a helmet.
  const face = new Mesh(new BoxGeometry(0.2, 0.14, 0.06), skinMat);
  face.name = 'face';
  face.position.set(0, 0.01, 0.14);
  head.add(face);

  if (hairSpec.length === 'long') {
    const fall = new Mesh(new BoxGeometry(0.3, 0.62, 0.14), hairMat);
    fall.name = 'hair-back';
    fall.position.set(0, -0.26, -0.14);
    head.add(fall);
    for (const side of [-1, 1]) {
      const strand = new Mesh(new BoxGeometry(0.08, 0.34, 0.15), hairMat);
      strand.position.set(side * 0.15, -0.08, -0.02);
      head.add(strand);
    }
    if (hairSpec.style === 'tied') {
      const cord = new Mesh(new BoxGeometry(0.2, 0.05, 0.16), trimMat);
      cord.position.set(0, -0.02, -0.16);
      head.add(cord);
      const tail = new Mesh(new BoxGeometry(0.13, 0.5, 0.11), hairMat);
      tail.position.set(0, -0.6, -0.17);
      head.add(tail);
    }
    if (hairSpec.style === 'topknot') {
      const knot = new Mesh(new CylinderGeometry(0.075, 0.09, 0.14, 8), hairMat);
      knot.position.set(0, 0.2, 0);
      head.add(knot);
      const pin = new Mesh(new BoxGeometry(0.22, 0.025, 0.025), trimMat);
      pin.position.set(0, 0.21, 0);
      head.add(pin);
    }
  }

  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    if (oneArm && side === -1) continue;
    const arm = new Group();
    // A wide hanging cuff is the silhouette of this robe, and the arm was a broom
    // handle: a thin cylinder the same width top to bottom, which from behind — where
    // the camera spends the whole game — read as a stick taped to each shoulder.
    const upper = new Mesh(new CylinderGeometry(0.1, 0.155, 0.34, 8), robeMat);
    upper.position.y = -0.17;
    const cuff = new Mesh(new CylinderGeometry(0.155, 0.25, 0.3, 10), robeMat);
    cuff.position.y = -0.48;
    const cuffBand = new Mesh(new CylinderGeometry(0.25, 0.25, 0.05, 10), trimMat);
    cuffBand.position.y = -0.635;
    const hand = new Mesh(new CapsuleGeometry(0.055, 0.04, 3, 6), skinMat);
    hand.position.y = -0.7;
    arm.add(upper, cuff, cuffBand, hand);
    arm.position.set(side * 0.34 * broad, 1.6, 0);
    arms.push(arm);
    root.add(arm);
  }

  const legs: Object3D[] = [];
  for (const side of [-1, 1]) {
    // Only the feet show below the robe; the legs drive the walk.
    const leg = new Mesh(new BoxGeometry(0.15, 0.1, 0.28), surface('cloth', rgb(trim)));
    leg.position.set(side * 0.13, 0.05, 0);
    legs.push(leg);
    root.add(leg);
  }

  let blob: Object3D | null = null;
  if (!options.shadows) {
    // Low tier: one flat dark disc under the actor instead of a shadow map.
    blob = new Mesh(new CircleGeometry(0.5, 12), new MeshBasicMaterial({ color: 0x0a1418, transparent: true, opacity: 0.3 }));
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
