/**
 * The cutscene timeline runner.
 *
 * Scenes are data, not code: a list of commands the runner executes against the
 * actors and the camera that are already in the world. Scenes are staged in the
 * world rather than shown as a text box over a frozen frame, and every one of them
 * is skippable and replayable from Memories.
 *
 * Dialogue lines carry a `kind`, which is how the inner voice gets its own visual
 * channel: `thought` renders as italics in a separate band and can sit on top of a
 * spoken line. All inner-voice writing is original, in his register, and is never
 * transcribed from any translation.
 *
 * Every line also carries `sfx` and `music` fields, left null until a sound pack
 * exists. The runner emits them on the bus regardless, so adding audio later means
 * subscribing rather than editing scenes.
 */
import { Vector3 } from 'three';
import { bus } from '../core/bus';
import type { Actor, AnimationName } from '../render/actors';

export type SceneCommand =
  | { op: 'move'; actor: string; to: [number, number]; seconds?: number; run?: boolean }
  | { op: 'place'; actor: string; at: [number, number]; facing?: number }
  /**
   * Takes an actor off the stage.
   *
   * Scenes that cover more than one chapter re-stage between them, and whoever was in
   * the first shot used to stay standing through the second: the Gu room elder was
   * still in frame in the tavern, shoulder to shoulder with the keeper.
   */
  | { op: 'exit'; actor: string }
  | { op: 'face'; actor: string; target: string }
  | { op: 'gesture'; actor: string; gesture: AnimationName }
  | { op: 'camera'; to: [number, number, number]; look: [number, number, number]; seconds?: number }
  | { op: 'cut'; to: [number, number, number]; look: [number, number, number] }
  | { op: 'line'; actor: string; text: string; kind?: 'spoken' | 'thought' | 'narration'; sfx?: string | null }
  | { op: 'choice'; id: string; prompt: string; method?: string; options: { id: string; label: string; sets?: string; method?: string }[] }
  | { op: 'wait'; seconds: number }
  | { op: 'fade'; to: 'black' | 'clear'; seconds?: number }
  | { op: 'letterbox'; on: boolean }
  | { op: 'weather'; kind: 'rain' | 'snow' | 'mist' | 'clear' | 'storm'; intensity?: number }
  | { op: 'timeOfDay'; value: number }
  | { op: 'flag'; set: string }
  | { op: 'evidence'; add?: string; clear?: string }
  | { op: 'title'; chapter: number; text: string }
  | { op: 'art'; id: string | null };

export interface SceneScript {
  id: string;
  beat: string;
  chapters: [number, number];
  /** Left null until a sound pack lands. */
  sfx: string | null;
  music: string | null;
  /** Chapter anchor and adaptation note, shown when the Reader's Lens is on. */
  lens?: { anchor: string; adaptation: string; irony?: string };
  /** Short nods to later arcs. Off by default, opt-in separately from the lens. */
  veteran?: string[];
  commands: SceneCommand[];
}

export interface TimelineHost {
  actor(id: string): Actor | undefined;
  spawn(id: string, variant?: string | null): Actor;
  despawn(id: string): void;
  camera: { to(position: Vector3, look: Vector3, seconds: number): Promise<void>; cut(position: Vector3, look: Vector3): void };
  showLine(actor: string, text: string, kind: 'spoken' | 'thought' | 'narration'): Promise<void>;
  askChoice(id: string, prompt: string, options: { id: string; label: string }[]): Promise<string>;
  fade(to: 'black' | 'clear', seconds: number): Promise<void>;
  letterbox(on: boolean): void;
  setWeather(kind: string, intensity: number): void;
  setTimeOfDay(value: number): void;
  setFlag(flag: string): void;
  addEvidence(id: string): void;
  clearEvidence(id: string): void;
  showTitle(chapter: number, text: string): Promise<void>;
  showArt(id: string | null): void;
  recordMethod(choiceId: string, optionId: string): void;
  /** True once the player has asked to skip; every command then resolves immediately. */
  skipping(): boolean;
}

/** Commands that change the world rather than present it. A skip still runs these. */
const STATEFUL_OPS = new Set<SceneCommand['op']>(['flag', 'evidence', 'weather', 'timeOfDay']);

export class Timeline {
  private aborted = false;

  constructor(private host: TimelineHost) {}

  abort(): void {
    this.aborted = true;
  }

  async run(script: SceneScript): Promise<void> {
    this.aborted = false;
    bus.emit('scene.start', { script: script.id, beat: script.beat });
    for (const command of script.commands) {
      if (this.aborted) {
        // Skipping is a presentation choice, never a state change. Run the rest of
        // the commands that alter the world — flags, evidence, weather, the time of
        // day — and drop only the staging, the camera work and the lines.
        if (STATEFUL_OPS.has(command.op)) await this.step(command);
        continue;
      }
      await this.step(command);
    }
    if (this.aborted) bus.emit('scene.skipped', { script: script.id });
    this.host.letterbox(false);
    bus.emit('scene.end', { script: script.id });
  }

  private async step(command: SceneCommand): Promise<void> {
    const fast = this.host.skipping();
    switch (command.op) {
      case 'place': {
        const actor = this.host.actor(command.actor) ?? this.host.spawn(command.actor);
        actor.setPosition(command.at[0], 0, command.at[1]);
        if (command.facing !== undefined) actor.setFacing(command.facing);
        actor.play('idle');
        return;
      }
      case 'exit': {
        this.host.despawn(command.actor);
        return;
      }
      case 'move': {
        const actor = this.host.actor(command.actor) ?? this.host.spawn(command.actor);
        const target = new Vector3(command.to[0], 0, command.to[1]);
        actor.faceTowards(target);
        actor.play(command.run ? 'run' : 'walk');
        await this.tween(command.seconds ?? 1.6, (t) => {
          actor.position.lerp(target, t === 1 ? 1 : 0.12);
        }, fast);
        actor.setPosition(target.x, 0, target.z);
        actor.play('idle');
        return;
      }
      case 'face': {
        const actor = this.host.actor(command.actor);
        const target = this.host.actor(command.target);
        if (actor && target) actor.faceTowards(target.position);
        return;
      }
      case 'gesture': {
        this.host.actor(command.actor)?.play(command.gesture, true);
        if (!fast) await this.delay(0.5);
        return;
      }
      case 'camera': {
        await this.host.camera.to(
          new Vector3(...command.to),
          new Vector3(...command.look),
          fast ? 0 : command.seconds ?? 2
        );
        return;
      }
      case 'cut':
        this.host.camera.cut(new Vector3(...command.to), new Vector3(...command.look));
        return;
      case 'line': {
        const kind = command.kind ?? 'spoken';
        bus.emit('scene.line', { speaker: command.actor, text: command.text, kind, sfx: command.sfx ?? null });
        await this.host.showLine(command.actor, command.text, kind);
        return;
      }
      case 'choice': {
        bus.emit('scene.choice', { id: command.id, options: command.options.map((o) => o.id) });
        // A skipped scene still has to resolve its choices, or the method it records
        // and any flag it sets go missing. The first option is the stated default.
        const chosen = this.aborted
          ? command.options[0]!.id
          : await this.host.askChoice(command.id, command.prompt, command.options);
        const option = command.options.find((o) => o.id === chosen) ?? command.options[0]!;
        bus.emit('scene.chose', { id: command.id, option: option.id });
        if (option.sets) this.host.setFlag(option.sets);
        // Method choices are exported in the Legacy file so the sequel can colour dialogue.
        this.host.recordMethod(command.method ?? command.id, option.method ?? option.id);
        return;
      }
      case 'wait':
        if (!fast) await this.delay(command.seconds);
        return;
      case 'fade':
        await this.host.fade(command.to, fast ? 0 : command.seconds ?? 0.6);
        return;
      case 'letterbox':
        this.host.letterbox(command.on);
        return;
      case 'weather':
        this.host.setWeather(command.kind, command.intensity ?? 0.6);
        return;
      case 'timeOfDay':
        this.host.setTimeOfDay(command.value);
        return;
      case 'flag':
        this.host.setFlag(command.set);
        return;
      case 'evidence':
        if (command.add) this.host.addEvidence(command.add);
        if (command.clear) this.host.clearEvidence(command.clear);
        return;
      case 'title':
        await this.host.showTitle(command.chapter, command.text);
        return;
      case 'art':
        this.host.showArt(command.id);
        return;
    }
  }

  private delay(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  private tween(seconds: number, apply: (t: number) => void, fast: boolean): Promise<void> {
    if (fast || seconds <= 0) {
      apply(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / (seconds * 1000));
        apply(t);
        if (t < 1 && !this.aborted) requestAnimationFrame(frame);
        else {
          apply(1);
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }
}
