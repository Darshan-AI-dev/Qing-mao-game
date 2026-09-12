/**
 * The single event bus every system publishes through.
 *
 * This exists so a sound pack can be added later without touching gameplay code:
 * it subscribes to the events below and reads the `sfx` / `music` fields that
 * scene data already carries. Nothing in the engine is allowed to reach into
 * another system directly for a notification.
 */

export interface GameEvents {
  // --- lifecycle
  'game.ready': { tier: string };
  'game.paused': { paused: boolean };
  'game.newLife': { newGamePlus: boolean };

  // --- beats and chapters
  'beat.enter': { beat: string; chapters: [number, number]; coverage: string };
  'beat.complete': { beat: string; chapters: [number, number] };
  'chapter.title': { chapter: number; act: string; title: string };
  'act.enter': { act: string; name: string };

  // --- scenes and dialogue
  'scene.start': { script: string; beat: string };
  'scene.line': { speaker: string; text: string; kind: 'spoken' | 'thought' | 'narration'; sfx: string | null };
  'scene.choice': { id: string; options: string[] };
  'scene.chose': { id: string; option: string };
  'scene.end': { script: string };
  'scene.skipped': { script: string };

  // --- Gu and combat
  'gu.activate': { gu: string; essence: number };
  'gu.refused': { gu: string; reason: 'essence' | 'cooldown' | 'sluggish' };
  'gu.feed': { gu: string; paidWith: 'item' | 'stones'; cost: number };
  'gu.sluggish': { gu: string; days: number };
  'gu.refine': { gu: string; outcome: 'success' | 'delay' | 'failure'; days: number; stones: number };
  'hit.player': { amount: number; source: string };
  'hit.enemy': { amount: number; target: string; telegraph: string | null };
  // Fights. The audio seam wants these named for a sound pack: a wind-up, an impact,
  // a phase turn and a win are four different cues.
  'fight.start': { boss: string; name: string; phases: number };
  'fight.phase': { boss: string; phase: number; defence: string };
  'fight.open': { boss: string; seconds: number };
  'fight.miss': { boss: string; reason: string };
  /** The player worked a phase out without calling the memory up. */
  'fight.read': { boss: string; phase: number; hint: string };
  'gu.carry': { gu: string; carried: boolean };
  'forage.gather': { item: string; count: number; area: string };
  'fight.end': { boss: string; won: boolean };
  'enemy.telegraph': { target: string; shape: string; pattern: string; seconds: number };
  'enemy.phase': { target: string; phase: number; of: number };
  'enemy.down': { target: string };
  'player.vitality': { value: number; max: number };
  'player.essence': { value: number; max: number };
  'player.down': { beat: string };

  // --- economy, calendar, cultivation
  'stones.change': { delta: number; balance: number; reason: string };
  'day.advance': { day: number; season: string; weather: string };
  'weather.rain': { intensity: number };
  'weather.snow': { intensity: number };
  'weather.mist': { intensity: number };
  'weather.clear': Record<string, never>;
  'weather.storm': { intensity: number };
  'cultivate.tick': { essence: number; stones: number };
  'breakthrough.begin': { rank: string; stage: string };
  'breakthrough.done': { rank: string; stage: string };

  // --- memory, exposure, reader layer
  'recollection.offer': { beat: string };
  'recollection.view': { beat: string };
  'foresight.recognise': { beat: string; total: number };
  'evidence.add': { id: string; secret: string };
  'evidence.clear': { id: string; cost: number; paidIn: 'stones' | 'days' | 'essence' };
  'exposure.change': { investigator: string; value: number };
  'lens.toggle': { on: boolean; veteran: boolean };
  'codex.unlock': { entry: string };

  // --- saves and the sequel bridge
  'save.write': { slot: string; bytes: number };
  'save.load': { slot: string; version: number };
  'save.migrated': { from: number; to: number };
  'legacy.export': { bytes: number };

  // --- presentation
  'camera.shake': { strength: number };
  'haptic': { pattern: number[] };
  'toast': { text: string };
  'errata.report': { scene: string; chapter: number; note: string };
}

export type EventName = keyof GameEvents;
export type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

type AnyHandler = (payload: never) => void;

export class EventBus {
  private handlers = new Map<EventName, Set<AnyHandler>>();
  private anyHandlers = new Set<(name: EventName, payload: unknown) => void>();
  /** Kept for the dev overlay and for the Playwright assertions. */
  private log: { name: EventName; at: number }[] = [];
  private logLimit = 400;

  on<K extends EventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as AnyHandler);
    return () => set?.delete(handler as AnyHandler);
  }

  once<K extends EventName>(name: K, handler: Handler<K>): () => void {
    const off = this.on(name, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /** A sound pack uses this: one subscription, every event. */
  onAny(handler: (name: EventName, payload: unknown) => void): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    this.log.push({ name, at: performance.now() });
    if (this.log.length > this.logLimit) this.log.shift();
    const set = this.handlers.get(name);
    if (set) for (const handler of [...set]) (handler as Handler<K>)(payload);
    for (const handler of [...this.anyHandlers]) handler(name, payload);
  }

  recent(count = 20): readonly { name: EventName; at: number }[] {
    return this.log.slice(-count);
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
    this.log = [];
  }
}

export const bus = new EventBus();
