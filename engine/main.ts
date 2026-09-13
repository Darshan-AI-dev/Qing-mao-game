/**
 * Game entry point. Wires the engine to whichever content package is imported.
 *
 * The division of labour is the one from the architecture plan: `/engine` knows
 * about beats, systems, rendering and UI but nothing about Qing Mao; `/content`
 * supplies the beat graph, the scenes and the areas; `/canon` is shared with the
 * sequel. Swapping the content import is the whole of what game 2 has to do here.
 */
import { Vector3, type Mesh, type Object3D } from 'three';
import { areasById, charactersById, actForChapter } from '../canon/index';
import { activeNarrativeId, applyNarrative, graph, illustrationsById, loadScript, narrativeSets, t } from '../content/qingmao/index';
import { AREAS, areaDescription } from '../content/qingmao/world/areas';
import { bus } from './core/bus';
import { Rng } from './core/rng';
import { orbitCamera, worldMove } from './core/movement';
import type { Beat } from './core/beats';
import { Renderer } from './render/renderer';
import { Weather } from './render/weather';
import { Actor } from './render/actors';
import { buildArea, marker, type Blocker } from './render/world';
import { benchmark, BUDGETS, hasDialogSupport, hasWebGL2, NO_WEBGL2_MESSAGE, type TierName } from './render/quality';
import { Timeline, type SceneScript, type TimelineHost } from './scene/timeline';
import { Economy } from './systems/economy';
import { Upkeep } from './systems/upkeep';
import { Calendar } from './systems/calendar';
import { Cultivation } from './systems/cultivation';
import { Exposure } from './systems/exposure';
import { Refinement, type RefinementOutcome } from './systems/refinement';
import { lineAt, nearestFolk, folkIn, SPEAK_RANGE, type Folk } from './systems/folk';
import { FOLK } from '../content/qingmao/world/folk';
import { Memory } from './systems/memory';
import { ABILITIES, BOSSES, Combat, type Ability } from './systems/combat';
import { freshSave, type SaveGameV5 } from './save/schema';
import { buildLegacy, defaultLegacy, validateLegacy } from './save/legacy';
import { migrate } from './save/migrate';
import * as store from './save/store';
import { Input, type Intent } from './input/input';
import { Dialogue, showChapterTitle } from './ui/dialogue';
import { Hud, attachToasts } from './ui/hud';
import { Panels } from './ui/panels';
import { Feedback } from './ui/feedback';
import { Encounter, type EncounterView } from './systems/encounter';
import { Forage, GATHER_RANGE, nodesFor, type ForageNode } from './systems/forage';
import { Foe, FOE_BODIES } from './render/foe';
import { DevOverlay } from './dev/overlay';
import { byId, closeDialog, el, maybe, openDialog } from './ui/dom';

const AUTOSAVE_MS = 20_000;
/** No beat may start further than this from what it stages. */
export const MAX_SPAWN_DISTANCE = 24;
/** How close you have to be to start the beat waiting for you. */
const OBJECTIVE_RANGE = 6;

class Game implements TimelineHost {
  save: SaveGameV5;
  private renderer: Renderer;
  private weather: Weather;
  private input: Input;
  private dialogue = new Dialogue();
  private hud: Hud;
  private panels: Panels;
  private feedback: Feedback;
  private dev: DevOverlay;
  private timeline: Timeline;
  private rng: Rng;

  private economy: Economy;
  private upkeep: Upkeep;
  private calendar: Calendar;
  private cultivation: Cultivation;
  private exposure: Exposure;
  private refinement: Refinement;
  private memory: Memory;
  private combat: Combat;
  private forage: Forage;

  private encounter: Encounter | null = null;
  private foe: Foe | null = null;
  private foeActor: Actor | null = null;
  private actors = new Map<string, Actor>();
  private blockers: Blocker[] = [];
  private player = { x: 0, z: 44, facing: 0 };
  private cameraYaw = 0;
  private cameraPitch = 0.42;
  private cameraDistance = 16;
  private freeCamera = false;
  private cameraDistanceOverride: number | null = null;
  private inScene = false;
  /** A one-line exchange with somebody in the world; not a scene. */
  private talking = false;
  private folkSyncedAt = 0;
  /** Where people are standing. Kept apart from `blockers`; see `enterArea`. */
  private folkBlockers: Blocker[] = [];
  private skipRequested = false;
  private lastTick = performance.now();
  private lastAutosave = performance.now();
  private currentArea = '';
  /** The beat waiting to be started, if the player is between beats. */
  private awaiting: Beat | null = null;
  private objective: Object3D | null = null;
  private gatherMarker: Mesh | null = null;
  private lastMove = { x: 0, z: 0 };
  private lastHeld: ReadonlySet<Intent> = new Set();
  private fadeNode: HTMLElement;
  private letterboxNode: HTMLElement;

  constructor(save: SaveGameV5, tier: TierName) {
    this.save = save;
    this.rng = new Rng(save.seed);

    const canvas = byId<HTMLCanvasElement>('world');
    this.renderer = new Renderer(canvas, tier, Math.max(...BUDGETS[tier].renderScale.slice(0, 1), save.settings.renderScale));
    this.weather = new Weather(this.renderer.scene, BUDGETS[tier].particles, save.settings.reducedMotion);
    this.input = new Input(save.settings, canvas, byId('joystick'));

    this.economy = new Economy(save);
    this.upkeep = new Upkeep(save, this.economy);
    this.calendar = new Calendar(save, this.upkeep, this.rng);
    this.cultivation = new Cultivation(save, this.economy, this.calendar, this.upkeep);
    this.exposure = new Exposure(save);
    this.refinement = new Refinement(save, this.economy, this.calendar, this.upkeep, this.rng);
    this.memory = new Memory(save, graph);
    this.combat = new Combat(save, this.cultivation, this.upkeep);
    this.forage = new Forage(save, this.economy);

    this.hud = new Hud(this.input);
    this.feedback = new Feedback(canvas, () => this.save.settings.reducedMotion, () => this.save.settings.haptics);
    this.timeline = new Timeline(this);
    this.panels = new Panels({
      save,
      graph,
      economy: this.economy,
      upkeep: this.upkeep,
      refinement: this.refinement,
      attemptRefinement: (recipeId) => this.attemptRefinement(recipeId),
      replay: (beatId) => void this.replayScene(beatId),
      travel: (areaId) => this.enterArea(areaId),
      unlockedAreas: () => this.unlockedAreas(),
      applySettings: () => this.settingsFromDom(),
      settingsToDom: () => this.settingsToDom()
    });
    this.dev = new DevOverlay({
      save,
      graph,
      renderer: this.renderer,
      jumpTo: (beatId) => this.jumpTo(beatId),
      playScene: (beatId) => void this.playScene(beatId),
      toggleFreeCamera: () => (this.freeCamera = !this.freeCamera)
    });

    this.fadeNode = byId('fade');
    this.letterboxNode = byId('letterbox');
    attachToasts();
    this.settingsToDom();
    this.applySettings();
    this.wireChrome();

    window.addEventListener('resize', () => this.renderer.resize());
    bus.emit('game.ready', { tier });
  }

  // ------------------------------------------------------------------ lifecycle
  async start(): Promise<void> {
    const beat = this.currentBeat();
    this.enterArea(beat?.area ?? 'mountain.village');
    // Write immediately: a migration result or the first minute of play should not
    // depend on surviving until the first autosave tick.
    await this.write('auto');
    // Start the render loop before anything is awaited. The first beat's scene takes
    // tens of seconds to play; waiting for it left the whole prologue on a black
    // screen with no frames drawn at all.
    requestAnimationFrame(() => this.frame());

    const previously = this.panels.previouslyCard();
    if (previously.length && this.save.completed.length) await this.showPreviously(previously);
    // The prologue starts immediately because it is the opening scene; everything
    // after it is offered and waits for the player.
    if (beat && !this.save.completed.length) await this.enterBeat(beat);
    else if (beat) this.offerBeat(beat);
  }

  private currentBeat(): Beat | undefined {
    if (this.save.current) return graph.get(this.save.current);
    return graph.next(new Set(this.save.completed));
  }

  /**
   * Puts a beat into the world as something to walk to, and hands control back.
   *
   * Beats are never chained automatically. The player explores between them, and a
   * beat starts when they choose to start it — which is the whole of "fixed
   * destination, free route". An earlier version ran `enterBeat` straight out of
   * `completeBeat`, which turned all 68 beats into one unbroken slideshow the player
   * could not move during.
   */
  private offerBeat(beat: Beat): void {
    this.save.current = beat.id;
    this.awaiting = beat;
    if (beat.area !== this.currentArea) this.enterArea(beat.area);
    this.calendar.setWeather(beat.weather);
    this.placeObjective(beat);
    if (beat.recollection) this.memory.offer(beat.id);
    // Repaint before the toast, not on the next frame. The HUD is otherwise only drawn
    // by the render loop, so on a device where frames are slow — or under a throttled
    // requestAnimationFrame — the quest strip went on showing the previous beat's title
    // and objective after control had already come back for the next one.
    this.renderHud();
    bus.emit('toast', { text: `${beat.title} — go to the marker.` });
  }

  /** Starts the beat the player is standing at. */
  private async enterBeat(beat: Beat): Promise<void> {
    this.awaiting = null;
    this.clearObjective();
    this.save.current = beat.id;
    bus.emit('beat.enter', { beat: beat.id, chapters: beat.chapters, coverage: beat.coverage });
    const act = actForChapter(beat.chapters[0]);
    if (act) bus.emit('act.enter', { act: act.id, name: act.name });
    if (beat.area !== this.currentArea) this.enterArea(beat.area);
    this.calendar.setWeather(beat.weather);
    this.renderHud();
    await this.playScene(beat.id);
    this.completeBeat(beat);
    this.inScene = false;
  }

  private completeBeat(beat: Beat): void {
    if (!this.save.completed.includes(beat.id)) this.save.completed.push(beat.id);
    for (const flag of beat.sets) this.setFlag(flag);
    bus.emit('beat.complete', { beat: beat.id, chapters: beat.chapters });
    const next = graph.next(new Set(this.save.completed));
    void this.write('auto');
    // Control returns to the player here. The next beat waits for them.
    if (next) this.offerBeat(next);
    else {
      this.save.current = null;
      bus.emit('toast', { text: 'Qing Mao is finished. The Journal has the threads.' });
    }
  }

  /** A gold disc at the area origin, where every scene stages itself. */
  private placeObjective(beat: Beat): void {
    this.clearObjective();
    const description = areaDescription(this.currentArea);
    // Scaled to the area: a disc sized for open ground fills a bedroom.
    const scale = Math.max(0.35, Math.min(1, Math.min(description.size.x, description.size.z) / 60));
    const ring = marker(0, 0, scale);
    ring.name = `objective:${beat.id}`;
    this.objective = ring;
    this.renderer.scene.add(ring);
  }

  /**
   * A small ring on the nearest thing worth picking, when it is close enough to see.
   *
   * One mesh that moves, rather than a marker per node: there can be sixty orchids in
   * an area and only one of them matters, which is the one you are walking towards.
   * Jade rather than the objective's gold, so it never reads as "the story is here".
   */
  private updateGatherMarker(): void {
    const found =
      this.inScene || this.encounter
        ? null
        : this.forage.nearest(
            this.currentArea,
            areaDescription(this.currentArea),
            this.save.calendar.day,
            this.player
          );
    const show = found && found.distance <= 13;
    if (!show) {
      if (this.gatherMarker) this.gatherMarker.visible = false;
      return;
    }
    if (!this.gatherMarker) {
      this.gatherMarker = marker(0, 0, 0.8, 0x63b794);
      this.gatherMarker.name = 'gather';
      this.renderer.scene.add(this.gatherMarker);
    }
    this.gatherMarker.visible = true;
    this.gatherMarker.position.set(found.node.x, 0.06, found.node.z);
    // Taught once, the first time he stands near something he can pick. After that
    // the ring and the context button are enough.
    if (!this.save.reader.codex.includes('codex.gathering') && found.distance <= GATHER_RANGE * 1.6) {
      this.save.reader.codex.push('codex.gathering');
      bus.emit('toast', { text: 'Moon orchids grow here. The Moonlight Gu eats the petals.' });
    }
  }

  private clearObjective(): void {
    if (!this.objective) return;
    this.renderer.scene.remove(this.objective);
    this.objective = null;
  }

  /** Paces from the player to the beat they have been offered. */
  private distanceToObjective(): number | null {
    return this.awaiting ? Math.hypot(this.player.x, this.player.z) : null;
  }

  private jumpTo(beatId: string): void {
    const beat = graph.get(beatId);
    if (!beat) return;
    // Dev only: mark every earlier beat complete so the graph stays consistent.
    const complete = new Set<string>();
    for (const candidate of graph.beats) {
      if (graph.indexOf(candidate.id) < graph.indexOf(beatId)) complete.add(candidate.id);
    }
    this.save.completed = [...complete];
    this.save.calendar.day = beat.day;
    void this.enterBeat(beat);
  }

  /** Revisiting a scene from the Journal: play it, then hand control straight back. */
  private async replayScene(beatId: string): Promise<void> {
    await this.playScene(beatId);
    this.inScene = false;
  }

  private async playScene(beatId: string): Promise<void> {
    const beat = graph.get(beatId);
    if (!beat) return;
    const script = await loadScript(beat);
    if (!script) return;
    this.inScene = true;
    this.skipRequested = false;
    this.dialogue.setInstant(false);
    byId('skipScene').hidden = false;
    this.showLensNotes(script);
    await showChapterTitle(beat.chapters[0], beat.title, actForChapter(beat.chapters[0])?.name ?? '', this.save.settings.reducedMotion);
    await this.timeline.run(script);
    byId('skipScene').hidden = true;
    this.dialogue.hide();
    // A skip applies to the scene being skipped, not to everything afterwards. Instant
    // mode was left on once a scene had been skipped, so the next line anybody spoke
    // outside a scene — a villager answering you — appeared and vanished in the same
    // frame, with no way to read it.
    this.dialogue.setInstant(false);
    this.restorePresentation();
    // Control is released by the caller, once the next beat has been set up. Clearing
    // it here left a window where the player could act while the previous area, its
    // camera framing and its objective marker were all still in place.
  }

  /**
   * A scene must not leak presentation state into exploration.
   *
   * The prologue ends on `fade: black`, and the fade back to clear lives at the top of
   * the *next* script. That was invisible while beats chained straight into one
   * another; once control returns to the player between beats, it left them looking at
   * a black screen with a working game behind it. So the end of every scene restores
   * the screen regardless of what the script happened to leave set.
   */
  private restorePresentation(): void {
    this.fadeNode.style.transitionDuration = '0.4s';
    this.fadeNode.classList.remove('on');
    this.letterbox(false);
    byId('sceneArt').hidden = true;
    byId('lensPanel').hidden = true;
    byId('recollectionPanel').hidden = true;
    // The scene's shot is finished with; the orbit camera takes over from here.
    this.sceneAim = null;
  }

  private showLensNotes(script: SceneScript): void {
    const node = byId('lensPanel');
    node.hidden = !this.save.reader.lens || !script.lens;
    if (node.hidden) return;
    node.replaceChildren(
      el('small', { text: script.lens!.anchor }),
      el('p', { text: script.lens!.adaptation }),
      ...(script.lens!.irony ? [el('p', { class: 'irony', text: script.lens!.irony })] : []),
      // Veteran notes are a separate opt-in and are always marked as looking ahead.
      ...(this.save.reader.veteran && script.veteran
        ? script.veteran.map((line) => el('p', { class: 'veteran', text: `Looking ahead · ${line}` }))
        : [])
    );
  }

  // ------------------------------------------------------------------- areas
  private enterArea(areaId: string): void {
    if (!AREAS.has(areaId)) return;
    const description = areaDescription(areaId);
    const canon = areasById.get(areaId);
    this.renderer.clearChunks();
    // Take them out of the scene as well as disposing them. `dispose()` empties an
    // actor's group but leaves the group itself parented, so every area change left
    // another abandoned node behind — three `actor:fang-yuan` groups were in the scene
    // after two moves, and a full playthrough crosses thirty-six areas.
    for (const actor of this.actors.values()) {
      this.renderer.scene.remove(actor.root);
      actor.dispose();
    }
    this.actors.clear();

    const built = buildArea(description, {
      instanceBudget: this.renderer.quality.budget.instanceBudget,
      shadows: this.renderer.quality.budget.shadows
    });
    for (const chunk of built.chunks) this.renderer.addChunk(chunk.group, chunk.centre, chunk.radius);
    for (const lantern of built.lanterns) this.renderer.addLantern(lantern.x, lantern.y, lantern.z);
    this.blockers = built.blockers;
    this.currentArea = areaId;
    // People take up room, but they are not architecture.
    //
    // Pushing them into `this.blockers` stranded a whole area: that list is what picks
    // the spawn point and what checks the lane to the objective, and `blocked()` pads
    // every entry by half a pace on each side, so three people in a 28 x 26 room walled
    // the marker off entirely. They get their own list, consulted only when the player
    // is walking, so the geometry the rest of the game reasons about is unchanged.
    this.folkBlockers = folkIn(FOLK.get(areaId) ?? [], new Set(this.save.completed))
      .map((person) => ({ x: person.x, z: person.z, w: 0.1, d: 0.1 }));
    this.save.area = areaId;

    // Genuinely dark means underground: caves, the stone forest, the blood lake. A
    // bedroom with a roof is "indoor", which is a different lighting problem — lit by
    // its own window and lamp rather than by the sun it cannot see.
    const dark = canon?.dark ?? description.dark ?? false;
    const enclosed = description.enclosed;
    const span = Math.max(description.size.x, description.size.z);
    // An interior's own walls sit well inside outdoor fog distances, so they fog to
    // near-black and the room reads as a void. Push it past the far wall.
    const lit = enclosed && !dark;
    this.renderer.setLighting({
      timeOfDay: description.timeOfDay,
      underground: enclosed && dark,
      indoor: lit,
      fogColor: lit ? 0x2c3a3f : description.fog.color,
      fogNear: lit ? span * 1.1 : description.fog.near,
      fogFar: lit ? span * 2.6 : description.fog.far,
      // Indoors there is no sky to see; the walls are the horizon.
      skyColor: enclosed ? undefined : description.sky
    });
    if (enclosed && !dark) {
      // One overhead fill, hung just under the ceiling.
      this.renderer.addFill(0, (description.ceilingHeight ?? 6) - 1.1, 0, 1.25);
    }
    // Underground, the player carries the light — which is the whole texture of the
    // cave and the stone forest, and was the missing half of "genuinely dark".
    this.renderer.setCarriedLight(enclosed && dark);

    const player = this.spawn('fang-yuan');
    // Spawn within sight of what the beat stages at the area's origin. The previous
    // build's chapter-101 preset dropped the player 192 paces from their objective.
    const spawn = this.chooseSpawn(Math.min(description.size.z / 2 - 6, MAX_SPAWN_DISTANCE));
    const towardsObjective = Math.atan2(-spawn.x, -spawn.z);
    this.player = { x: spawn.x, z: spawn.z, facing: towardsObjective };
    player.setPosition(spawn.x, 0, spawn.z);
    player.setFacing(towardsObjective);
    // Put the camera behind the player, looking the way he is.
    //
    // The orbit puts the camera at `player - (sin yaw, cos yaw) * distance`, and the
    // yaw was left wherever the last area had it — so a beat routinely opened with the
    // camera standing between the player and the objective, looking back up the road he
    // had just come down. Walking to the marker meant walking into the lens, which is
    // the other half of "the character is walking backward".
    this.cameraYaw = towardsObjective;
    this.placeCamera();
    byId('regionName').textContent = canon?.name ?? areaId;
  }

  /**
   * A standing place with a clear walk to the objective.
   *
   * Spawning at a fixed point on the +z axis put the player face-first into a boulder
   * at the underground river: the approach was blocked, and a play sweep that walks the
   * way a player walks simply never arrived. Rather than move the scenery, look for an
   * angle whose line to the origin is open, and step in if none of them is.
   */
  private chooseSpawn(radius: number): { x: number; z: number } {
    // The lane to the objective must be clear, and so must the stretch behind the
    // player, because that is where the camera stands. A lamp post four paces back
    // fills the whole frame, which is how three areas opened on a giant lantern.
    const camera = this.effectiveCameraDistance();
    const clear = (x: number, z: number): boolean => {
      if (!this.laneIsClear(x, z)) return false;
      const distance = Math.hypot(x, z);
      if (distance < 0.001) return true;
      const steps = Math.ceil(camera);
      for (let i = 1; i <= steps; i++) {
        const out = 1 + (i / steps) * (camera / distance);
        if (this.blocked(x * out, z * out)) return false;
      }
      return true;
    };
    const walkable = clear;
    // Never further out than asked for: a small room's spawn radius is already most of
    // the way to its wall, and pushing past it put the player inside one.
    // Never inside the objective's own range. A crowded room — the forge, with a
    // furnace, benches, shelves and chests in it — pushed the search inward until the
    // player spawned four paces from the marker, which makes the context button read
    // "Begin" from the first frame and puts everything else in that room out of reach.
    const floor = OBJECTIVE_RANGE + 1.5;
    for (let ring = 0; ring < 5; ring++) {
      const distance = radius - ring * Math.max(1, radius / 6);
      if (distance < floor) break;
      // Straight back first, then alternating to either side in fifteen-degree steps,
      // so the usual case keeps the framing the scenes were laid out for.
      for (let i = 0; i < 24; i++) {
        const angle = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12);
        const x = Math.sin(angle) * distance;
        const z = Math.cos(angle) * distance;
        if (!this.blocked(x, z) && walkable(x, z)) return { x, z };
      }
    }
    // No clear lane anywhere — a dense forest, usually. Settle for somewhere the walk
    // can get out of, rather than dropping the player into the one spot it cannot.
    for (let ring = 0; ring < 5; ring++) {
      const distance = radius - ring * Math.max(1, radius / 6);
      if (distance < floor) break;
      for (let i = 0; i < 24; i++) {
        const angle = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12);
        const x = Math.sin(angle) * distance;
        const z = Math.cos(angle) * distance;
        if (!this.blocked(x, z) && this.objectiveReachable(x, z)) return { x, z };
      }
    }
    // Small rooms never reached either search above.
    //
    // The spawn radius is `size.z / 2 - 6`, and the floor is `OBJECTIVE_RANGE + 1.5`.
    // A 26-unit room gives 7 against a floor of 7.5, so both loops break before testing
    // a single candidate and the blind fallback below was the only thing that ever ran
    // — unchecked. In the Gu room that put the player at (0, 7.5), which is inside the
    // blocker of the lantern at (0, 8), with the post standing between him and the
    // camera and filling the frame. The chapter 7 room, entered that way every time.
    //
    // So: sweep for somewhere unblocked at whatever distance the room actually has. The
    // floor is there to stop the player spawning already inside the objective's range;
    // in a room too small to honour it, being near the wall beats being inside a post.
    // Whether a prop stands in the stretch the camera occupies behind the player.
    //
    // `clear` cannot answer this in a small room: it uses `blocked`, which also reports
    // the area bounds, and in a 26-unit room the camera necessarily sits beyond them —
    // so `clear` is false everywhere and the strict pass below found nothing at all.
    // The camera is allowed to be near a wall. It is not allowed to have a lantern post
    // in front of it. Sampled at twice the density, because a post is about a metre
    // wide and one sample per metre can step straight over it.
    const propInTheWay = (px: number, pz: number): boolean =>
      this.blockers.some(
        (b) => Math.abs(px - b.x) < b.w + 0.5 && Math.abs(pz - b.z) < b.d + 0.5
      );
    const cameraLaneClear = (x: number, z: number): boolean => {
      const distance = Math.hypot(x, z);
      if (distance < 0.001) return true;
      const steps = Math.max(6, Math.ceil(camera * 2));
      for (let i = 1; i <= steps; i++) {
        const out = 1 + (i / steps) * (camera / distance);
        if (propInTheWay(x * out, z * out)) return false;
      }
      return true;
    };

    // Two passes: somewhere with a clear view first, then merely somewhere solid.
    // Standing clear of the post is not enough on its own — at (0, 7) the player is
    // outside the Gu room lantern's blocker and the lantern is still at (0, 8), which
    // is between him and a camera at 11.8. `clear` is what tests the stretch the camera
    // occupies, and it is the check the small-room path was missing.
    for (const strict of [true, false]) {
      for (const distance of [radius, radius * 0.85, radius * 0.7]) {
        if (distance < 2) break;
        for (let i = 0; i < 24; i++) {
          const angle = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 12);
          const x = Math.sin(angle) * distance;
          const z = Math.cos(angle) * distance;
          if (this.blocked(x, z)) continue;
          if (!strict || cameraLaneClear(x, z)) return { x, z };
        }
      }
    }
    return { x: 0, z: Math.max(floor, radius) };
  }

  /** Is the straight line from here to the objective free of scenery? */
  private laneIsClear(x: number, z: number): boolean {
    const steps = Math.ceil(Math.hypot(x, z));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked(x * (1 - t), z * (1 - t))) return false;
    }
    return true;
  }

  /**
   * Can the objective be walked to from here, steering around what is in the way?
   *
   * A clear straight lane is the nicer spawn and is what `chooseSpawn` looks for first,
   * but a forest is not supposed to have one: the wolf forest, the hunter's rest and
   * the academy all have scenery across every straight line out of the area's edge, and
   * a player simply walks around it. This is the guarantee that actually matters — that
   * the beat can be reached at all — and it is what the spawn test asserts.
   */
  private objectiveReachable(startX: number, startZ: number): boolean {
    let x = startX;
    let z = startZ;
    for (let step = 0; step < 900; step++) {
      const distance = Math.hypot(x, z);
      if (distance <= OBJECTIVE_RANGE * 0.8) return true;
      const towards = Math.atan2(-x, -z);
      let moved = false;
      for (let turn = 0; turn < 9 && !moved; turn++) {
        const angle = towards + (turn % 2 === 0 ? 1 : -1) * Math.ceil(turn / 2) * (Math.PI / 9);
        const nextX = x + Math.sin(angle) * 0.9;
        const nextZ = z + Math.cos(angle) * 0.9;
        if (this.blocked(nextX, nextZ)) continue;
        x = nextX;
        z = nextZ;
        moved = true;
      }
      if (!moved) return false;
    }
    return false;
  }

  /**
   * Where this area spawns the player, and whether they can walk from there to the
   * objective without going around anything. A false here is a player standing in a
   * boulder, which is how the underground river used to open.
   */
  spawnClearance(areaId: string): { x: number; z: number; lane: boolean; reachable: boolean } {
    this.visitArea(areaId);
    return {
      x: this.player.x,
      z: this.player.z,
      lane: this.laneIsClear(this.player.x, this.player.z),
      reachable: this.objectiveReachable(this.player.x, this.player.z)
    };
  }

  /** The beat the HUD is currently describing, for tests that check what it prints. */
  currentBeatFacts(): { id: string; title: string; objective: string; designNote: string } | null {
    const beat = this.currentBeat();
    if (!beat) return null;
    return {
      id: beat.id,
      title: beat.title,
      objective: beat.objective ?? '',
      designNote: beat.designNote ?? ''
    };
  }

  private unlockedAreas(): { id: string; name: string }[] {
    const reached = new Set<string>();
    for (const id of this.save.completed) {
      const beat = graph.get(id);
      if (beat) reached.add(beat.area);
    }
    const current = this.currentBeat();
    if (current) reached.add(current.area);
    return [...reached]
      .map((id) => ({ id, name: areasById.get(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ------------------------------------------------- TimelineHost implementation
  actor(id: string): Actor | undefined {
    return this.actors.get(id);
  }

  spawn(id: string, variant?: string | null): Actor {
    const existing = this.actors.get(id);
    if (existing) return existing;
    const chapter = this.currentBeat()?.chapters[1] ?? 1;
    const actor = new Actor({
      id,
      variant: variant ?? null,
      shadows: this.renderer.quality.budget.shadows !== 'blob'
    });
    void chapter;
    this.actors.set(id, actor);
    this.renderer.scene.add(actor.root);
    return actor;
  }

  /**
   * Runs a fight and resolves when it is over.
   *
   * Control goes back to the player for the duration — `inScene` drops, so the stick
   * and the abilities work — and the scene picks up again afterwards whichever way it
   * went. Losing is a beat the text answers, not a game over: the story of this
   * character is not one you can fail out of.
   */
  async fight(bossId: string, resolveAtOnce: boolean): Promise<void> {
    const boss = Combat.bossFor(bossId) ?? BOSSES.find((b) => b.id === bossId);
    if (!boss) return;
    if (resolveAtOnce) {
      // A skipped scene still records that the fight happened.
      this.setFlag(`fight.${boss.id}.won`);
      return;
    }
    const encounter = new Encounter(boss, this.save, this.combat, this.cultivation, {
      playerPosition: () => ({ x: this.player.x, z: this.player.z }),
      moveFoe: (x, z, facing) => this.placeFoe(x, z, facing),
      recalled: () => (this.save.settings.fightHints ?? false) || this.memory.viewed(boss.beat),
      concealed: (now) => this.combat.concealed(now),
      guarding: (now) => this.combat.guarding(now)
    });
    this.encounter = encounter;
    this.spawnFoeBody(boss.id);

    // Hand the world back to the player properly.
    //
    // A scripted `place` moves the actor's model but not the player's logical
    // position, so the orbit camera — which follows the logical position — was looking
    // at the patch of floor where the player had been standing before the scene staged
    // itself. Both combatants were off screen for the whole fight. Sync the logical
    // position to where the model actually is, point the camera down the line between
    // the two of them, and drop the scene's framing and letterbox: a fight is not a
    // cutscene, and the bars only cost it room.
    const body = this.actors.get('fang-yuan');
    if (body) this.player = { x: body.position.x, z: body.position.z, facing: this.player.facing };
    // Close enough to read the wind-up on its body from the first frame.
    const stand = 11;
    const facing = this.player.facing;
    encounter.placeFoeAt(this.player.x + Math.sin(facing) * stand, this.player.z + Math.cos(facing) * stand);
    this.cameraYaw = facing;
    this.sceneAim = null;
    const barsWereDown = this.letterboxNode.classList.contains('on');
    this.letterbox(false);
    this.inScene = false;
    this.dialogue.hide();
    this.placeCamera();

    await new Promise<void>((resolve) => {
      const tick = (): void => {
        if (encounter.finished) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    this.inScene = true;
    // Put the bars back only if the scene had them. Turning them on unconditionally
    // added a letterbox to every scene that had chosen not to have one, and left the
    // vitals panel sitting under the bottom bar for the rest of it.
    this.letterbox(barsWereDown);
    if (encounter.won) this.setFlag(`fight.${boss.id}.won`);
    this.clearFoeBody();
    this.encounter = null;
    bus.emit('toast', {
      text: encounter.won ? `${boss.name}: down.` : `${boss.name} put you down. The story goes on.`
    });
    // A loss leaves him standing but spent, rather than dead.
    if (!encounter.won) this.save.vitality = Math.max(1, Math.round(this.save.vitalityMax * 0.25));
  }

  /** Human opponents get their canon model; beasts get a body from foe.ts. */
  private spawnFoeBody(bossId: string): void {
    const body = FOE_BODIES[bossId];
    if (body) {
      this.foe = new Foe(body.kind, body.scale, this.renderer.quality.budget.shadows !== 'blob');
      this.renderer.scene.add(this.foe.root);
      return;
    }
    const human = bossId === 'fang-zheng' ? 'fang-zheng' : bossId === 'bai-ning-bing' ? 'bai-ning-bing' : null;
    if (human) this.foeActor = this.spawn(human);
  }

  private placeFoe(x: number, z: number, facing: number): void {
    this.foe?.setPosition(x, z);
    this.foe?.setFacing(facing);
    this.foeActor?.setPosition(x, 0, z);
    this.foeActor?.setFacing(facing);
  }

  private clearFoeBody(): void {
    if (this.foe) {
      this.renderer.scene.remove(this.foe.root);
      this.foe.dispose();
      this.foe = null;
    }
    this.foeActor = null;
  }

  // ------------------------------------------------------------------ people
  /**
   * Puts the area's people where they stand, and keeps them there.
   *
   * Run from the frame loop rather than only on entry, because a scene may spawn the
   * same character, walk them across the room and leave them there — Fang Zheng is in
   * the household scene and also someone you can talk to afterwards. Re-seating them
   * while exploring costs a distance check each and repairs that for free.
   */
  private syncFolk(now: number): void {
    if (now - this.folkSyncedAt < 400) return;
    this.folkSyncedAt = now;
    for (const person of this.peopleHere()) {
      const actor = this.actors.get(person.id) ?? this.spawn(person.id);
      const at = actor.root.position;
      if (Math.hypot(at.x - person.x, at.z - person.z) > 0.2) {
        actor.setPosition(person.x, 0, person.z);
        actor.setFacing(person.facing ?? 0);
      }
    }
  }

  /** The people standing in the current area right now. */
  private peopleHere(): readonly Folk[] {
    return folkIn(FOLK.get(this.currentArea) ?? [], new Set(this.save.completed));
  }

  /** Whoever is within speaking distance, or null. */
  private folkInReach(): Folk | null {
    if (this.encounter) return null;
    return nearestFolk(FOLK.get(this.currentArea) ?? [], new Set(this.save.completed), this.player)?.person ?? null;
  }

  /**
   * One line from one person, then control straight back.
   *
   * Deliberately not a scene: no letterbox, no skip button, no loss of the stick. The
   * cost of talking to somebody should be the two seconds it takes to read them, or
   * villages stop being worth walking through.
   */
  private speakTo(person: Folk): string | null {
    // Returns what was actually said, and null when nothing was — already mid-line, in
    // a scene, or out of lines. A caller that cannot tell the difference will happily
    // report a line that never reached the screen.
    if (this.talking || this.inScene) return null;
    const state = (this.save.beatState[`folk.${person.id}`] ??= {});
    const heard = typeof state.heard === 'number' ? state.heard : 0;
    const text = lineAt(person, new Set(this.save.completed), heard);
    if (!text) return null;
    state.heard = heard + 1;

    this.talking = true;
    const actor = this.actors.get(person.id);
    // They turn to whoever is speaking to them. A line delivered to the back of
    // someone's head reads as a bug, however good the line is.
    if (actor) {
      actor.setFacing(Math.atan2(this.player.x - person.x, this.player.z - person.z));
      actor.play(heard % 2 === 0 ? 'talk-point' : 'talk-cross-arms', true);
    }
    void this.dialogue.showLine(person.id, text, 'spoken').finally(() => {
      this.talking = false;
      if (!this.inScene) this.dialogue.hide();
      actor?.play('idle');
      actor?.setFacing(person.facing ?? 0);
      void this.write('auto');
    });
    return text;
  }

  /** Who is here and what they would say next. Read by the tests and the dev console. */
  folkHere(): { id: string; name: string; distance: number; next: string | null }[] {
    const completed = new Set(this.save.completed);
    return folkIn(FOLK.get(this.currentArea) ?? [], completed).map((person) => {
      const state = this.save.beatState[`folk.${person.id}`] ?? {};
      const heard = typeof state.heard === 'number' ? state.heard : 0;
      return {
        id: person.id,
        name: charactersById.get(person.id)?.name ?? person.id,
        distance: Math.hypot(person.x - this.player.x, person.z - this.player.z),
        next: lineAt(person, completed, heard)
      };
    });
  }

  /** Walks to the nearest person the way `walkToObjective` walks to a marker. */
  walkToFolk(): string | null {
    const people = this.peopleHere();
    if (people.length === 0 || this.inScene) return null;
    let target = people[0]!;
    for (const person of people) {
      if (Math.hypot(person.x - this.player.x, person.z - this.player.z) <
          Math.hypot(target.x - this.player.x, target.z - this.player.z)) target = person;
    }
    // Walking here moves the logical player; the body is placed at the end, the same
    // way `walkToGather` and `walkToObjective` do it. Without that the character model
    // stays where it was and every screenshot taken after a debug walk is a lie.
    const arrive = (): string => {
      this.player.facing = Math.atan2(target.x - this.player.x, target.z - this.player.z);
      const actor = this.actors.get('fang-yuan');
      actor?.setPosition(this.player.x, 0, this.player.z);
      actor?.setFacing(this.player.facing);
      return target.id;
    };
    for (let step = 0; step < 900; step++) {
      const gap = Math.hypot(target.x - this.player.x, target.z - this.player.z);
      if (gap <= SPEAK_RANGE * 0.9) return arrive();
      const towards = Math.atan2(target.x - this.player.x, target.z - this.player.z);
      let moved = false;
      for (let turn = 0; turn < 9 && !moved; turn++) {
        const angle = towards + (turn % 2 === 0 ? 1 : -1) * Math.ceil(turn / 2) * (Math.PI / 9);
        const nextX = this.player.x + Math.sin(angle) * 0.8;
        const nextZ = this.player.z + Math.cos(angle) * 0.8;
        if (this.blocked(nextX, nextZ)) continue;
        this.player.x = nextX;
        this.player.z = nextZ;
        moved = true;
      }
      if (!moved) return null;
    }
    return null;
  }

  /** Says the next line of whoever is in reach. Returns what was said, or null. */
  speakToNearest(): string | null {
    const person = this.folkInReach();
    return person ? this.speakTo(person) : null;
  }

  /** The fight panel's model, or null when nothing is fighting. */
  fightView(): EncounterView | null {
    return this.encounter ? this.encounter.view(performance.now()) : null;
  }

  /**
   * Attempts a strike and reports what the phase rule decided.
   *
   * For tests, and for the dev console. Going through the keyboard cannot check a
   * rule: a key is queued and consumed on the next frame, so a press made a moment
   * before the window opens lands inside it. That is the right behaviour to keep —
   * being forgiving by one frame is how the game should feel — but it means a test
   * that presses a key and then reads the bar is testing the race, not the rule.
   */
  tryStrike(abilityId: string): { landed: boolean; reason: string; damage: number } | null {
    if (!this.encounter) return null;
    const ability = ABILITIES.find((a) => a.id === abilityId);
    if (!ability) return null;
    const now = performance.now();
    if (!this.combat.use(ability, now)) {
      return { landed: false, reason: 'Not ready, or not enough essence.', damage: 0 };
    }
    return this.encounter.strike(ability, now);
  }

  /** Removes an actor from the world. Fang Yuan stays: he is the player. */
  despawn(id: string): void {
    if (id === 'fang-yuan') return;
    const actor = this.actors.get(id);
    if (!actor) return;
    this.renderer.scene.remove(actor.root);
    actor.dispose();
    this.actors.delete(id);
  }

  /**
   * Pushes a scripted camera back out of whoever is standing in front of it.
   *
   * A shot framed on two people a few paces apart can put a third actor between the
   * lens and the subject; at a pace and a half they fill the frame as an unreadable
   * shape. Backing the camera off along its own view direction keeps the framing the
   * scene asked for and gets the body out of it.
   */
  private clearOfActors(position: Vector3, look: Vector3): Vector3 {
    const MIN = 2.6;
    const back = position.clone().sub(look);
    if (back.lengthSq() < 1e-6) return position;
    back.normalize();
    let push = 0;
    for (const actor of this.actors.values()) {
      const gap = Math.hypot(actor.position.x - position.x, actor.position.z - position.z);
      if (gap < MIN) push = Math.max(push, MIN - gap);
    }
    return push > 0 ? position.clone().addScaledVector(back, push) : position;
  }

  /** The shot a scene asked for, before the dialogue panel is taken into account. */
  private sceneAim: { position: Vector3; look: Vector3 } | null = null;

  /** Points the camera at a scripted look target, lifted clear of the dialogue panel. */
  private aimScene(position: Vector3, look: Vector3): void {
    const lifted = look.clone();
    lifted.y -= this.framingLift(position.distanceTo(look));
    this.renderer.camera.lookAt(lifted);
  }

  camera = {
    to: (target: Vector3, look: Vector3, seconds: number): Promise<void> =>
      new Promise((resolve) => {
        const position = this.clearOfActors(target, look);
        this.sceneAim = { position, look: look.clone() };
        const from = this.renderer.camera.position.clone();
        const start = performance.now();
        const step = (now: number) => {
          const time = seconds <= 0 ? 1 : Math.min(1, (now - start) / (seconds * 1000));
          const eased = time * time * (3 - 2 * time);
          this.renderer.camera.position.lerpVectors(from, position, eased);
          this.aimScene(this.renderer.camera.position, look);
          if (time < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    cut: (position: Vector3, look: Vector3): void => {
      const clear = this.clearOfActors(position, look);
      this.sceneAim = { position: clear, look: look.clone() };
      this.renderer.camera.position.copy(clear);
      this.aimScene(clear, look);
    }
  };

  showLine(actorId: string, text: string, kind: 'spoken' | 'thought' | 'narration'): Promise<void> {
    return this.dialogue.showLine(actorId, text, kind);
  }

  askChoice(id: string, prompt: string, options: { id: string; label: string }[]): Promise<string> {
    return this.dialogue.askChoice(id, prompt, options);
  }

  fade(to: 'black' | 'clear', seconds: number): Promise<void> {
    this.fadeNode.style.transitionDuration = `${seconds}s`;
    this.fadeNode.classList.toggle('on', to === 'black');
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  letterbox(on: boolean): void {
    this.letterboxNode.classList.toggle('on', on);
    // The bars are what the header and the dialogue panel have to clear, so the layout
    // keys off the bars rather than off "a scene is playing". They are not the same
    // thing: a fight is not a cutscene and drops them, and plenty of scenes never
    // raise them at all, both of which left panels tucked under a bar that was not
    // there or standing clear of one that was.
    document.body.classList.toggle('letterboxed', on);
  }

  setWeather(kind: string, intensity: number): void {
    this.calendar.setWeather(kind);
    void intensity;
  }

  setTimeOfDay(value: number): void {
    const description = areaDescription(this.currentArea);
    this.renderer.setLighting({
      timeOfDay: value,
      underground: description.enclosed && (description.dark ?? false),
      fogColor: description.fog.color,
      fogNear: description.fog.near,
      fogFar: description.fog.far
    });
  }

  setFlag(flag: string): void {
    const state = (this.save.beatState['flags'] ??= {});
    state[flag] = true;
    // Gu flags are the inventory's source of truth, so acquisition happens here.
    const guFlag = GU_BY_FLAG[flag];
    if (guFlag) {
      const taken = this.upkeep.acquire(guFlag, this.save.calendar.day);
      // A Gu that arrived in reserve is not on the action bar, so say where it went.
      if (taken?.stored) bus.emit('toast', { text: 'Open the Gu wheel to choose what you carry.' });
    }
    const rank = RANK_BY_FLAG[flag];
    if (rank) this.cultivation.completeBreakthrough(rank.rank, rank.stage);
    if (flag.startsWith('codex.')) bus.emit('codex.unlock', { entry: flag.slice(6) });
  }

  addEvidence(id: string): void {
    this.exposure.add(id);
  }

  clearEvidence(id: string): void {
    this.exposure.clear(id, 'days', 1);
  }

  showTitle(chapter: number, text: string): Promise<void> {
    const act = actForChapter(chapter);
    return showChapterTitle(chapter, text, act?.name ?? '', this.save.settings.reducedMotion);
  }

  showArt(id: string | null): void {
    const figure = byId<HTMLElement>('sceneArt');
    const image = byId<HTMLImageElement>('sceneImage');
    if (!id) {
      figure.hidden = true;
      return;
    }
    const art = illustrationsById.get(id);
    if (!art?.src) {
      figure.hidden = true;
      return;
    }
    image.src = art.src;
    image.alt = art.alt;
    byId('sceneArtCaption').textContent = art.title;
    figure.hidden = false;
  }

  recordMethod(choiceId: string, optionId: string): void {
    this.save.methods[choiceId] = optionId;
  }

  skipping(): boolean {
    return this.skipRequested;
  }

  // -------------------------------------------------------------------- frame
  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;

    const frame = this.input.frame();
    this.lastMove = frame.move;
    this.lastHeld = frame.held;
    this.handleIntents(frame.pressed);
    if (!this.inScene) this.movePlayer(frame, dt);
    this.updateCamera(frame, dt);

    if (this.encounter) {
      this.encounter.update(dt, now, this.flags());
      this.foe?.setPose(this.encounter.view(now).state, now);
    }
    if (!this.inScene) this.syncFolk(now);
    for (const actor of this.actors.values()) actor.update(dt, now);
    if (this.renderer.hasCarriedLight) this.renderer.moveCarriedLight(this.player.x, 2.4, this.player.z);
    this.updateGatherMarker();
    if (this.objective) {
      // Fades out as you arrive, so it never sits on top of the scene it points at.
      const distance = this.distanceToObjective() ?? Infinity;
      this.objective.visible = distance > OBJECTIVE_RANGE * 0.6;
    }
    this.weather.update(dt, this.player.x, this.player.z);
    this.feedback.update(dt);
    this.renderer.render(now);
    this.renderHud();
    this.dev.update();

    this.save.playtimeSeconds += dt;
    if (now - this.lastAutosave > AUTOSAVE_MS) {
      this.lastAutosave = now;
      void this.write('auto');
    }
    requestAnimationFrame(() => this.frame());
  }

  private handleIntents(pressed: ReadonlySet<Intent>): void {
    if (pressed.has('journal')) this.panels.openJournal('chapters');
    if (pressed.has('atlas')) this.panels.openAtlas();
    if (pressed.has('pause')) openDialog(byId<HTMLDialogElement>('pause'));
    if (pressed.has('recollect')) this.viewRecollection();
    if (this.inScene && (pressed.has('interact') || pressed.has('attack'))) this.dialogue.advance();
    if (this.inScene) return;
    // Someone standing in front of you is the most specific thing in reach, so they
    // are offered before the ground you are standing on and before a distant marker.
    if (pressed.has('interact')) {
      const near = this.folkInReach();
      if (near) {
        this.speakTo(near);
        return;
      }
    }
    if (pressed.has('interact') && this.atForge() && (this.distanceToObjective() ?? Infinity) > OBJECTIVE_RANGE) {
      this.panels.openRefinery();
      return;
    }
    if (pressed.has('interact')) {
      const node = this.gatherable();
      if (node && (this.distanceToObjective() ?? Infinity) > OBJECTIVE_RANGE) {
        this.forage.gather(this.currentArea, node, this.save.calendar.day);
        void this.write('auto');
        return;
      }
    }
    if (pressed.has('interact') && this.awaiting) {
      const distance = this.distanceToObjective() ?? Infinity;
      if (distance <= OBJECTIVE_RANGE) {
        const beat = this.awaiting;
        // A reader who acts before calling the memory up gets the recognition.
        if (!this.memory.viewed(beat.id)) this.memory.recogniseForesight(beat.id);
        void this.enterBeat(beat);
        return;
      }
      bus.emit('toast', { text: `${Math.round(distance)} paces to go.` });
    }
    if (pressed.has('cultivate')) {
      const result = this.cultivation.cultivate();
      bus.emit('toast', {
        text: result
          ? `A day of cultivation: +${result.essence} essence, -${result.stones} stone.`
          : 'Not enough stones to cultivate today.'
      });
    }
    const flags = this.flags();
    for (const ability of this.combat.availableAbilities(flags)) {
      if (!pressed.has(ability.key as Intent)) continue;
      const now = performance.now();
      if (!this.combat.use(ability, now)) {
        // Say which of the two reasons it was; "nothing happened" teaches nobody.
        if (!this.combat.ready(ability, now)) continue;
        bus.emit('toast', { text: `Not enough essence for ${ability.label}.` });
        continue;
      }
      // A fight is the only thing that can be struck. Outside one the ability still
      // fires — the essence is spent and the feedback plays — so practising works.
      if (this.encounter && ability.damage > 0) {
        const result = this.encounter.strike(ability, now);
        if (!result.landed) bus.emit('toast', { text: result.reason });
      }
    }
  }

  private viewRecollection(): void {
    const beat = this.currentBeat();
    if (!beat || !this.memory.enabled) return;
    const recollection = this.memory.view(beat.id);
    if (!recollection) return;
    const node = byId('recollectionPanel');
    node.hidden = false;
    node.replaceChildren(
      el('small', { text: 'Five hundred years ago' }),
      el('p', { text: recollection.text }),
      ...(recollection.partial
        ? [el('p', { class: 'fine', text: 'The memory stops there. It was a long time ago and he was not paying attention to this.' })]
        : [])
    );
    window.setTimeout(() => (node.hidden = true), 9000);
  }

  private movePlayer(frame: { move: { x: number; z: number }; held: ReadonlySet<Intent> }, dt: number): void {
    const { dx, dz, facing } = worldMove(frame.move, this.cameraYaw);
    if (facing === null) {
      this.actors.get('fang-yuan')?.play('idle');
      return;
    }
    const running = frame.held.has('run');
    const speed = (running ? 13 : 7) * dt;
    const nextX = this.player.x + dx * speed;
    const nextZ = this.player.z + dz * speed;
    // Axes are tested separately so a wall you are brushing along does not stop you.
    if (!this.blocked(nextX, this.player.z) && !this.standingOn(nextX, this.player.z)) this.player.x = nextX;
    if (!this.blocked(this.player.x, nextZ) && !this.standingOn(this.player.x, nextZ)) this.player.z = nextZ;
    this.player.facing = facing;

    const actor = this.actors.get('fang-yuan');
    if (actor) {
      actor.setPosition(this.player.x, 0, this.player.z);
      actor.setFacing(facing);
      // A half-pushed stick walks; only a firm push runs.
      actor.play(running && Math.hypot(dx, dz) > 0.7 ? 'run' : 'walk');
    }
  }

  /** What he carries, what is in reserve, and how much he can hold. */
  guLoadout(): { rank: number; capacity: number; carried: string[]; stored: string[] } {
    return {
      rank: this.save.aperture.rank,
      capacity: this.upkeep.capacity(),
      carried: this.upkeep.carried().map((g) => g.id),
      stored: this.upkeep.stored().map((g) => g.id)
    };
  }

  /** Dev and tests: hands over a Gu through the ordinary acquisition path. */
  giveGu(id: string): boolean {
    return !!this.upkeep.acquire(id, this.save.calendar.day);
  }

  /**
   * Runs a refinement, spending essence through the aperture as the system expects.
   *
   * The only caller the refinement system has ever had is the scene runner, which is
   * why the player could never make anything. This is the other door.
   */
  attemptRefinement(recipeId: string): RefinementOutcome {
    const outcome = this.refinement.attempt(recipeId, (amount, gu) => this.cultivation.spend(amount, gu));
    void this.write('auto');
    return outcome;
  }

  /** Which areas have anything to gather, for the dev console and the sweep. */
  forageSummary(): { area: string; nodes: number; items: string[] }[] {
    const rows: { area: string; nodes: number; items: string[] }[] = [];
    for (const id of AREAS.keys()) {
      const nodes = nodesFor(areaDescription(id));
      if (nodes.length) rows.push({ area: id, nodes: nodes.length, items: [...new Set(nodes.map((n) => n.item))] });
    }
    return rows;
  }

  /** What is pickable here and now, and what is in the bag. */
  forageState(): { ready: number; nearest: number | null; carrying: Record<string, number> } {
    const area = areaDescription(this.currentArea);
    const day = this.save.calendar.day;
    const found = this.forage.nearest(this.currentArea, area, day, this.player);
    return {
      ready: this.forage.available(this.currentArea, area, day).length,
      nearest: found ? Math.round(found.distance * 10) / 10 : null,
      carrying: { ...this.save.economy.items }
    };
  }

  /** Walks to the nearest gatherable, the way `walkToObjective` walks to a marker. */
  walkToGather(): boolean {
    const area = areaDescription(this.currentArea);
    const found = this.forage.nearest(this.currentArea, area, this.save.calendar.day, this.player);
    if (!found) return false;
    for (let step = 0; step < 900; step++) {
      const gap = Math.hypot(found.node.x - this.player.x, found.node.z - this.player.z);
      if (gap <= GATHER_RANGE * 0.8) return true;
      const towards = Math.atan2(found.node.x - this.player.x, found.node.z - this.player.z);
      let moved = false;
      for (let turn = 0; turn < 9 && !moved; turn++) {
        const angle = towards + (turn % 2 === 0 ? 1 : -1) * Math.ceil(turn / 2) * (Math.PI / 9);
        const nextX = this.player.x + Math.sin(angle) * 0.9;
        const nextZ = this.player.z + Math.cos(angle) * 0.9;
        if (this.blocked(nextX, nextZ)) continue;
        this.player.x = nextX;
        this.player.z = nextZ;
        this.player.facing = angle;
        moved = true;
      }
      if (!moved) return false;
      // Move the body too, as `walkToObjective` does. A walk that moves the logical
      // position and leaves the model behind puts the camera somewhere the player is
      // not, which is its own bug and hides others.
      const actor = this.actors.get('fang-yuan');
      actor?.setPosition(this.player.x, 0, this.player.z);
      actor?.setFacing(this.player.facing);
    }
    return false;
  }

  /** Is there a refinement bench here? Forges have one; nothing else does. */
  private atForge(): boolean {
    return !this.inScene && !this.encounter && this.currentArea.includes('forge');
  }

  /** The node under the player's feet, if anything is ready there. */
  private gatherable(): ForageNode | null {
    if (this.inScene || this.encounter) return null;
    const found = this.forage.nearest(
      this.currentArea,
      areaDescription(this.currentArea),
      this.save.calendar.day,
      this.player
    );
    return found && found.distance <= GATHER_RANGE ? found.node : null;
  }

  /**
   * Whether a person is standing here. Tight — a body, not a building — and separate
   * from `blocked` so it never reaches the spawn search or the lane check.
   */
  private standingOn(x: number, z: number): boolean {
    for (const person of this.folkBlockers) {
      if (Math.abs(x - person.x) < person.w + 0.5 && Math.abs(z - person.z) < person.d + 0.5) return true;
    }
    return false;
  }

  private blocked(x: number, z: number): boolean {
    for (const blocker of this.blockers) {
      if (Math.abs(x - blocker.x) < blocker.w + 0.5 && Math.abs(z - blocker.z) < blocker.d + 0.5) return true;
    }
    const description = areaDescription(this.currentArea);
    return Math.abs(x) > description.size.x / 2 - 2 || Math.abs(z) > description.size.z / 2 - 2;
  }

  private updateCamera(frame: { look: { dx: number; dy: number } }, dt: number): void {
    if (this.inScene) {
      // A scripted camera is set once, but the panel under it changes height as lines
      // and illustrations come and go, so the shot is re-aimed every frame instead.
      if (this.sceneAim) this.aimScene(this.sceneAim.position, this.sceneAim.look);
      return;
    }
    const settings = this.save.settings;
    // Dragging right turns the view right. The first version subtracted, which orbited
    // the camera the other way and made the controls feel mirrored.
    const yawSign = settings.invertLookX ? -1 : 1;
    const pitchSign = settings.invertLookY ? -1 : 1;
    this.cameraYaw += frame.look.dx * 0.005 * settings.lookSensitivity * yawSign;
    this.cameraPitch = Math.min(
      1.25,
      Math.max(0.08, this.cameraPitch + frame.look.dy * 0.004 * settings.lookSensitivity * pitchSign)
    );
    if (this.freeCamera) {
      this.cameraDistance = Math.max(4, this.cameraDistance - frame.look.dy * dt);
      return;
    }
    this.placeCamera();
  }

  /**
   * How much of the frame the dialogue panel is covering, as a fraction of its height.
   *
   * Zero when it is down. Measured rather than assumed: the panel grows when a line has
   * an inner-voice thought under it, and grows a lot when the scene shows an
   * illustration, which is exactly when it is most in the way.
   */
  private panelShare(): number {
    const panel = document.getElementById('dialoguePanel');
    if (!panel || panel.hidden) return 0;
    const height = panel.getBoundingClientRect().height;
    if (height <= 0) return 0;
    return Math.min(0.5, height / Math.max(1, window.innerHeight));
  }

  /**
   * How far to drop the aim point so the subject clears the dialogue panel.
   *
   * Aiming lower raises what you are looking at. The awakening ceremony is framed on
   * Fang Yuan's chest at the centre of the screen, and the panel — at its tallest,
   * because that scene also shows an illustration — sat straight over it, so the one
   * moment the chapter is about played behind a box of text.
   */
  private framingLift(distance: number): number {
    const share = this.panelShare();
    if (share <= 0) return 0;
    const halfHeight = Math.tan((this.renderer.camera.fov * Math.PI) / 360) * distance;
    return share * halfHeight;
  }

  /**
   * Puts the orbit camera where the player and the yaw say it should be.
   *
   * Called from the frame loop, and again the moment an area is entered. Waiting for
   * the next frame meant `enterArea` returned with the camera still standing in the
   * last area — a one-frame flash of somewhere else on a slow device, and on WebKit in
   * CI a long enough window that the camera tests read the old position and failed.
   */
  private placeCamera(): void {
    // In a fight, orbit the point between the two of them and stand further back.
    //
    // Orbiting the player alone framed a fight as one man looking at empty ground: the
    // foe closes from fifteen paces and spends most of the encounter off screen or a
    // speck at the top of it. Weighted toward the player so it still reads as his
    // shoulder, not a duel seen from the side.
    const fight = this.encounter;
    const foe = fight?.foePosition();
    const centre = foe
      ? { x: this.player.x * 0.68 + foe.x * 0.32, z: this.player.z * 0.68 + foe.z * 0.32 }
      : this.player;
    const pull = fight ? 4.5 : 0;
    const eye = this.insideTheWalls(
      orbitCamera(centre, this.cameraYaw, this.cameraPitch, this.effectiveCameraDistance() + pull)
    );
    this.renderer.camera.position.set(eye.x, eye.y, eye.z);
    const distance = Math.hypot(eye.x - centre.x, eye.y - 2, eye.z - centre.z);
    this.renderer.camera.lookAt(
      new Vector3(centre.x, 2 - this.framingLift(distance), centre.z)
    );
  }

  /**
   * Pulls the camera in so it stays inside the room.
   *
   * The default 16-unit orbit is fine outdoors and puts the camera through the wall of
   * an 18-by-20 bedroom, which renders as the room seen from outside. Interiors get a
   * distance proportional to their smaller half-extent.
   */
  /**
   * Keeps the orbit camera inside an enclosed area.
   *
   * The distance clamp assumes the player is at the area's origin, and stops being
   * enough the moment they are not: standing four paces back in an eighteen-by-twenty
   * room put the camera through the far wall, and the chapter 3 room rendered as a
   * brown plane with none of the bed, window or stones the text describes on it.
   */
  private insideTheWalls(eye: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const description = areaDescription(this.currentArea);
    if (!description.enclosed) return eye;
    const margin = 1.2;
    const limitX = description.size.x / 2 - margin;
    const limitZ = description.size.z / 2 - margin;
    const height = (description.ceilingHeight ?? 6) - 0.6;
    return {
      x: Math.max(-limitX, Math.min(limitX, eye.x)),
      y: Math.min(height, eye.y),
      z: Math.max(-limitZ, Math.min(limitZ, eye.z))
    };
  }

  private effectiveCameraDistance(): number {
    // An explicit inspection distance (the visual sweep's establishing shot) is not
    // clamped: the clamp exists to keep the play camera out of the walls.
    if (this.cameraDistanceOverride !== null) return this.cameraDistanceOverride;
    const description = areaDescription(this.currentArea);
    if (!description.enclosed) return this.cameraDistance;
    const halfExtent = Math.min(description.size.x, description.size.z) / 2;
    return Math.max(4.5, Math.min(this.cameraDistance, halfExtent * 0.85));
  }

  private flags(): Set<string> {
    const flags = graph.flagsFor(new Set(this.save.completed));
    for (const key of Object.keys(this.save.beatState['flags'] ?? {})) flags.add(key);
    return flags;
  }

  private renderHud(): void {
    // The exploration HUD stands down during a scene; see `body.scene` in style.css.
    document.body.classList.toggle('scene', this.inScene);
    document.body.classList.toggle('fighting', !!this.encounter);
    const beat = this.currentBeat();
    const flags = this.flags();
    const abilities = this.combat.availableAbilities(flags);
    this.hud.render(
      {
        rankLabel: this.cultivation.rankLabel(),
        essence: this.cultivation.essence,
        essenceMax: this.cultivation.essenceMax,
        essenceLabel: this.cultivation.essenceLabel(),
        vitality: this.save.vitality,
        vitalityMax: this.save.vitalityMax,
        stones: this.economy.stones,
        questTitle: beat?.title ?? 'Qing Mao',
        // The player's objective, not the beat sheet's authoring note. The note is the
        // Reader's Lens annotation and stays behind that opt-in.
        questTask: beat?.objective ?? '',
        chapterLabel: beat ? `Chapter ${beat.chapters[0]}${beat.chapters[1] > beat.chapters[0] ? `–${beat.chapters[1]}` : ''}` : '',
        calendarLabel: this.calendar.label(),
        distance: this.distanceToObjective(),
        context: this.contextAction(),
        sluggish: this.save.gu.filter((g) => g.sluggish).map((g) => g.id),
        due: this.upkeep.due(this.save.calendar.day),
        recollectionAvailable: !!beat && !!this.memory.available(beat.id) && !this.memory.viewed(beat.id),
        fight: this.fightView()
      },
      abilities,
      (ability: Ability) => this.combat.cost(ability)
    );
  }

  /** What the one big touch button does right now, given what is in front of you. */
  private contextAction(): { intent: Intent; label: string } | null {
    if (this.inScene) return { intent: 'interact', label: 'Continue' };
    const distance = this.distanceToObjective();
    if (distance !== null && distance <= OBJECTIVE_RANGE) return { intent: 'interact', label: 'Begin' };
    // Standing over something worth picking. Offered before cultivating, because it is
    // the more specific thing to be doing in that spot.
    const near = this.folkInReach();
    if (near) return { intent: 'interact', label: `Speak to ${charactersById.get(near.id)?.name ?? near.id}` };
    if (this.gatherable()) return { intent: 'interact', label: 'Gather' };
    // A forge has a bench in it. Nowhere else does.
    if (this.atForge()) return { intent: 'interact', label: 'Refine' };
    if (this.cultivation.essence < this.cultivation.essenceMax * 0.5) {
      return { intent: 'cultivate', label: t('hud.cultivate') };
    }
    return { intent: 'interact', label: t('hud.interact') };
  }

  // -------------------------------------------------------------------- chrome
  private wireChrome(): void {
    byId('pauseButton').addEventListener('click', () => openDialog(byId<HTMLDialogElement>('pause')));
    byId('resume').addEventListener('click', () => closeDialog(byId<HTMLDialogElement>('pause')));
    byId('skipScene').addEventListener('click', () => {
      this.skipRequested = true;
      // Render anything still to come instantly, then settle the line on screen.
      // Without the second call the scene sits on the typewriter until someone taps.
      this.dialogue.setInstant(true);
      this.timeline.abort();
      this.dialogue.cancelPending();
    });
    byId('recollectButton').addEventListener('click', () => this.viewRecollection());
    byId('dialogueBacklogToggle').addEventListener('click', () => {
      const node = byId('dialogueBacklog');
      node.hidden = !node.hidden;
    });
    byId('autoAdvance').addEventListener('change', (event) => {
      this.dialogue.autoAdvance = (event.target as HTMLInputElement).checked;
      // Apply it to the line already on screen rather than only to the next one.
      this.dialogue.refreshAutoAdvance();
    });
    for (const slot of ['slot1', 'slot2', 'slot3'] as const) {
      maybe(`save-${slot}`)?.addEventListener('click', () => void this.write(slot));
      maybe(`load-${slot}`)?.addEventListener('click', () => void this.load(slot));
    }
    byId('reset').addEventListener('click', () => {
      if (!confirm('Begin a new life? This replaces the autosave.')) return;
      const carried = this.save.completed.includes('act4.escape.raft');
      const next = freshSave(this.save.seed + 1);
      if (carried) {
        // New Game+: the codex, the ledger and the recognitions carry over. Canon does not.
        next.newGamePlus = this.save.newGamePlus + 1;
        next.reader.codex = [...this.save.reader.codex];
        next.reader.foresight = this.save.reader.foresight;
        next.reader.lens = this.save.reader.lens;
        next.reader.veteran = true;
        next.settings = { ...this.save.settings };
      }
      void store.write('auto', next).then(() => location.reload());
      bus.emit('game.newLife', { newGamePlus: carried });
    });
    byId('exportSave').addEventListener('click', () => {
      const json = JSON.stringify(this.save, null, 2);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = el('a', { href: url, download: 'qing-mao-save.json' });
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
    byId('importSave').addEventListener('click', () => byId<HTMLInputElement>('saveFile').click());
    byId('saveFile').addEventListener('change', async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const result = migrate(JSON.parse(await file.text()), graph);
      await store.write('auto', result.save);
      location.reload();
    });
  }

  /** save -> DOM. Called on boot and whenever the Options dialog is opened. */
  private settingsToDom(): void {
    const settings = this.save.settings;
    setSelect('difficulty', settings.difficulty);
    setSelect('intensity', settings.intensity);
    setSelect('approach', settings.approach);
    // The registry decides what is on offer; the markup ships only the "current" row.
    const narrativeSelect = maybe<HTMLSelectElement>('narrative');
    if (narrativeSelect && narrativeSelect.options.length <= 1) {
      for (const set of narrativeSets) {
        const option = document.createElement('option');
        option.value = set.id;
        option.textContent = `${set.label} — ${set.note}`;
        narrativeSelect.append(option);
      }
    }
    setSelect('narrative', settings.narrative ?? '');
    setSelect('tier', settings.tier);
    setSelect('fontChoice', settings.font);
    setSelect('textSize', String(settings.textSize));
    setCheck('reducedMotion', settings.reducedMotion);
    setCheck('manualAim', settings.manualAim);
    setCheck('aimAssist', settings.aimAssist);
    setCheck('haptics', settings.haptics);
    setCheck('holdToGuard', settings.holdToGuard);
    setCheck('holdToRun', settings.holdToRun);
    setCheck('refinementFailure', settings.refinementFailure);
    setCheck('guUpkeep', settings.guUpkeep);
    setCheck('fightHints', settings.fightHints ?? false);
    setCheck('invertLookX', settings.invertLookX);
    setCheck('invertLookY', settings.invertLookY);
    const sensitivity = maybe<HTMLInputElement>('lookSensitivity');
    if (sensitivity) sensitivity.value = String(Math.round(settings.lookSensitivity * 100));
    setCheck('lensToggle', this.save.reader.lens);
    setCheck('veteranToggle', this.save.reader.veteran);
  }

  /** DOM -> save. Only ever called from the Options dialog's Apply button. */
  private settingsFromDom(): void {
    const settings = this.save.settings;
    for (const [id, key] of [
      ['difficulty', 'difficulty'], ['intensity', 'intensity'],
      ['approach', 'approach'], ['tier', 'tier'], ['fontChoice', 'font']
    ] as const) {
      const node = maybe<HTMLSelectElement>(id);
      if (node) (settings as unknown as Record<string, unknown>)[key] = node.value;
    }
    const textSize = maybe<HTMLSelectElement>('textSize');
    if (textSize) settings.textSize = Number(textSize.value) as 1 | 2 | 3;
    const sensitivity = maybe<HTMLInputElement>('lookSensitivity');
    if (sensitivity) settings.lookSensitivity = Math.max(0.2, Number(sensitivity.value) / 100);
    for (const id of ['reducedMotion', 'manualAim', 'aimAssist', 'haptics',
                      'holdToGuard', 'holdToRun', 'refinementFailure', 'guUpkeep',
                      'fightHints'] as const) {
      const node = maybe<HTMLInputElement>(id);
      if (node) (settings as unknown as Record<string, unknown>)[id] = node.checked;
    }
    // The narrative set is applied rather than merely stored: the prose has to change
    // when Apply is pressed, not on the next launch. An empty value means the live
    // content files, which is what a fresh save starts on.
    const narrative = maybe<HTMLSelectElement>('narrative');
    if (narrative) {
      const chosen = narrative.value === '' ? null : narrative.value;
      if (chosen !== settings.narrative) {
        settings.narrative = chosen;
        void applyNarrative(chosen).then((applied) => {
          bus.emit('toast', {
            text: applied
              ? `Prose set to ${chosen === null ? 'the current text' : chosen}.`
              : `No narrative set named ${chosen ?? ''}.`
          });
        });
      }
    }
    this.save.reader.lens = maybe<HTMLInputElement>('lensToggle')?.checked ?? this.save.reader.lens;
    this.save.reader.veteran = maybe<HTMLInputElement>('veteranToggle')?.checked ?? this.save.reader.veteran;
    this.applySettings();
  }

  /** Pushes the current settings into the document and the systems that read them. */
  private applySettings(): void {
    const settings = this.save.settings;
    const root = document.documentElement;
    root.dataset.textSize = String(settings.textSize);
    root.dataset.font = settings.font;
    // Honour the OS preference as well as the in-game switch.
    const prefers = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const reduced = settings.reducedMotion || prefers;
    root.dataset.reducedMotion = reduced ? 'true' : 'false';
    this.weather.setReducedMotion(reduced);
    bus.emit('lens.toggle', { on: this.save.reader.lens, veteran: this.save.reader.veteran });
  }

  private async write(slot: store.SlotId): Promise<void> {
    this.save.savedAt = Date.now();
    this.save.seed = this.rng.seed;
    const bytes = await store.write(slot, this.save);
    bus.emit('save.write', { slot, bytes });
    if (!bytes) bus.emit('toast', { text: 'Could not write the save. Storage is blocked or full.' });
  }

  private async load(slot: store.SlotId): Promise<void> {
    const raw = await store.read(slot);
    if (!raw) {
      bus.emit('toast', { text: 'That slot is empty.' });
      return;
    }
    await store.write('auto', migrate(raw, graph).save);
    location.reload();
  }

  private showPreviously(lines: string[]): Promise<void> {
    const dialog = byId<HTMLDialogElement>('previously');
    byId('previouslyBody').replaceChildren(...lines.map((line) => el('p', { text: line })));
    openDialog(dialog);
    return new Promise((resolve) => {
      byId('previouslyClose').addEventListener('click', () => {
        closeDialog(dialog);
        resolve();
      }, { once: true });
    });
  }

  /** Aims the camera at empty sky. Used by the culling test to prove the frustum
   *  check is doing something, and by the free camera in developer mode. */
  lookStraightUp(): void {
    this.freeCamera = true;
    this.renderer.camera.position.set(this.player.x, 6, this.player.z);
    this.renderer.camera.lookAt(new Vector3(this.player.x, 400, this.player.z));
    this.renderer.render(performance.now());
  }

  /** True when the player has control: not inside a scene. */
  isExploring(): boolean {
    return !this.inScene;
  }

  area(): string {
    return this.currentArea;
  }

  playerPosition(): { x: number; z: number } {
    return { x: this.player.x, z: this.player.z };
  }

  awaitingBeatId(): string | null {
    return this.awaiting?.id ?? null;
  }

  objectiveDistance(): number | null {
    return this.distanceToObjective();
  }

  lineCount(): number {
    return this.dialogue.lines.length;
  }

  cameraPosition(): { x: number; y: number; z: number } {
    const p = this.renderer.camera.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** What an area is built from, so a test can assert the room has a bed in it. */
  areaContents(id: string): { props: string[]; dressing: string[]; enclosed: boolean } {
    const description = areaDescription(id);
    return {
      props: description.props.map((group) => group.kind),
      dressing: (description.dressing ?? []).map((item) => item.kind),
      enclosed: description.enclosed
    };
  }

  /** Hair spec and the geometry actually built for it. */
  characterLook(id: string): { length: string; style: string; colour: number[]; meshes: number } {
    const canon = charactersById.get(id);
    const actor = this.actors.get(id);
    let meshes = 0;
    actor?.root.traverse(() => { meshes += 1; });
    return {
      length: canon?.hair?.length ?? 'short',
      style: canon?.hair?.style ?? 'loose',
      colour: canon?.palette.hair ?? [0, 0, 0],
      meshes
    };
  }

  /**
   * Walks into an area without playing its scene. Used by the visual sweep to
   * photograph every area in the game, which is how the dark interiors and the
   * oversized objective marker were found.
   */
  visitArea(areaId: string): boolean {
    if (!AREAS.has(areaId)) return false;
    this.inScene = false;
    this.enterArea(areaId);
    return true;
  }

  /**
   * Walks to the objective marker and starts the beat waiting there.
   *
   * The play sweep uses this to get from one scene to the next the way a player does.
   * It really walks — in the same steps, through the same blockers — rather than
   * teleporting, so an objective walled off behind its own scenery shows up here as a
   * walk that does not arrive, instead of as a beat that silently never triggers.
   */
  walkToObjective(): boolean {
    if (!this.awaiting || this.inScene) return false;
    for (let step = 0; step < 600; step++) {
      const distance = Math.hypot(this.player.x, this.player.z);
      if (distance <= OBJECTIVE_RANGE * 0.8) {
        const beat = this.awaiting;
        if (!this.memory.viewed(beat.id)) this.memory.recogniseForesight(beat.id);
        void this.enterBeat(beat);
        return true;
      }
      const towards = Math.atan2(-this.player.x, -this.player.z);
      // Straight at it first, then progressively wider, alternating left and right:
      // the same thing a player does when something is in the way.
      let moved = false;
      for (let turn = 0; turn < 9 && !moved; turn++) {
        const angle = towards + (turn % 2 === 0 ? 1 : -1) * Math.ceil(turn / 2) * (Math.PI / 9);
        const nextX = this.player.x + Math.sin(angle) * 0.9;
        const nextZ = this.player.z + Math.cos(angle) * 0.9;
        if (this.blocked(nextX, nextZ)) continue;
        this.player.x = nextX;
        this.player.z = nextZ;
        this.player.facing = angle;
        moved = true;
      }
      if (!moved) return false;
      const actor = this.actors.get('fang-yuan');
      actor?.setPosition(this.player.x, 0, this.player.z);
      actor?.setFacing(this.player.facing);
    }
    return false;
  }

  /** Jumps to a beat and offers it, without replaying everything before it. */
  jumpToBeat(beatId: string): boolean {
    const beat = graph.get(beatId);
    if (!beat) return false;
    const complete = new Set<string>();
    for (const candidate of graph.beats) {
      if (graph.indexOf(candidate.id) < graph.indexOf(beatId)) complete.add(candidate.id);
    }
    this.save.completed = [...complete];
    this.save.calendar.day = beat.day;
    this.inScene = false;
    this.offerBeat(beat);
    return true;
  }

  areaIds(): string[] {
    return [...AREAS.keys()];
  }

  /**
   * Overrides the orbit distance. The visual sweep uses it for an establishing shot:
   * at the play distance you see about a thirty-unit circle, which is not enough to
   * tell whether a hundred-unit area is actually laid out or just has a path in it.
   */
  setCameraDistance(distance: number): void {
    this.cameraDistance = Math.max(4, distance);
  }

  /** Sweep-only: fixes the orbit distance and bypasses the interior clamp. */
  setInspectionDistance(distance: number | null): void {
    this.cameraDistanceOverride = distance === null ? null : Math.max(4, distance);
  }

  /**
   * The camera's own axes, read out of its world matrix rather than re-derived.
   *
   * The movement basis had `cross(up, forward)` where it needed `cross(forward, up)`,
   * so strafing was mirrored at every yaw — and the unit test checked it against the
   * same hand-written cross product, so it passed. This reads the right vector from the
   * matrix three.js actually renders with, which cannot agree with a mistake of mine.
   */
  cameraBasis(): { right: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } } {
    const camera = this.renderer.camera;
    camera.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const forward = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
    return { right: { ...right }, forward: { ...forward } };
  }

  /** Where the model's face points, and which way it is turned. */
  facingProbe(id: string): { faceZ: number; backZ: number; rotationY: number; forward: { x: number; z: number } } {
    const probe = this.actors.get(id)?.facingProbe() ?? { faceZ: 0, backZ: 0, rotationY: 0 };
    return { ...probe, forward: { x: Math.sin(probe.rotationY), z: Math.cos(probe.rotationY) } };
  }

  /** Raw input and resolved movement, for diagnosing control problems. */
  moveDebug(): Record<string, unknown> {
    const frame = { move: { ...this.lastMove }, held: this.lastHeld };
    const resolved = worldMove(frame.move, this.cameraYaw);
    return {
      rawMove: frame.move,
      held: [...frame.held],
      cameraYaw: this.cameraYaw,
      resolved,
      player: { ...this.player },
      area: this.currentArea,
      inScene: this.inScene,
      blockedAhead: this.blocked(this.player.x + resolved.dx, this.player.z + resolved.dz),
      blockerCount: this.blockers.length
    };
  }

  /** How much state the completed beats have actually applied. */
  sceneStateAfterSkip(): { flagsApplied: number; evidence: number } {
    return {
      flagsApplied: Object.keys(this.save.beatState['flags'] ?? {}).length,
      evidence: this.save.exposure.evidence.length
    };
  }

  /** Renderer counters, read by the performance-budget test and the dev overlay. */
  stats(): ReturnType<Renderer['stats']> {
    return this.renderer.stats();
  }

  /** Systems the refinement and evidence screens will drive as Act II is built out. */
  get systems(): unknown {
    return { refinement: this.refinement, exposure: this.exposure };
  }
}

const GU_BY_FLAG: Record<string, string> = {
  'gu.cicada': 'spring-autumn-cicada', 'gu.moonlight': 'moonlight-gu', 'gu.liquor-worm': 'liquor-worm',
  'gu.little-light': 'little-light-gu', 'gu.white-boar': 'white-boar-gu', 'gu.jade-skin': 'jade-skin-gu',
  'gu.white-jade': 'white-jade-gu', 'gu.moonglow': 'moonglow-gu', 'gu.four-flavours': 'four-flavours-liquor-worm',
  'gu.black-boar': 'black-boar-gu', 'gu.stealth-scales': 'stealth-scales-gu', 'gu.earth-ear': 'earth-ear-grass',
  'gu.nine-leaf': 'nine-leaf-vitality-grass', 'gu.water-shield': 'water-shield-gu', 'gu.sky-canopy': 'sky-canopy-gu',
  'gu.thunderwings': 'thunderwings-gu', 'gu.blood-moon': 'blood-moon-gu', 'gu.centipede': 'chainsaw-golden-centipede',
  'gu.tusita': 'tusita-flower', 'gu.treasure-lotus': 'heavenly-essence-treasure-lotus',
  'gu.mudskin-toad': 'mudskin-toad-gu', 'gu.yang': 'yang-gu'
};

const RANK_BY_FLAG: Record<string, { rank: number; stage: 'initial' | 'middle' | 'upper' | 'peak' }> = {
  'rank.1.initial': { rank: 1, stage: 'initial' },
  'rank.1.middle': { rank: 1, stage: 'middle' },
  'rank.2.initial': { rank: 2, stage: 'initial' },
  'rank.3.initial': { rank: 3, stage: 'initial' },
  'rank.3.peak': { rank: 3, stage: 'peak' }
};

// ----------------------------------------------------------------------- boot
async function boot(): Promise<void> {
  // The minimum requirement is WebGL2 and <dialog>. Say so plainly rather than
  // showing a blank canvas.
  if (!hasWebGL2() || !hasDialogSupport()) {
    byId('unsupported').hidden = false;
    byId('unsupportedBody').textContent = hasWebGL2()
      ? 'This browser does not support the <dialog> element, which the game uses for every panel.'
      : NO_WEBGL2_MESSAGE;
    return;
  }

  // Asked for, never waited on.
  //
  // `navigator.storage.persist()` raises a permission prompt in Firefox, and a prompt
  // nobody answers is a promise that never settles — so awaiting it here meant boot
  // stopped before the title screen and the player sat looking at an empty page.
  // Firefox under a virtual display reproduced it exactly: WebGL2 fine, document
  // complete, title dialog present but never opened, nothing thrown.
  //
  // Nothing needed the answer in the first place: the result was discarded, and the
  // eviction warning below is decided by `atEvictionRisk()`, which is synchronous. So
  // the request goes out and boot carries on without it.
  void store.requestPersistence();
  if (store.atEvictionRisk()) byId('iosStorageWarning').hidden = false;

  const raw = (await store.read('auto')) ?? store.readLegacyBuildSave();
  const result = migrate(raw, graph);
  if (result.migratedFrom) {
    bus.emit('save.migrated', { from: result.migratedFrom, to: result.save.version });
    byId('migrationNote').hidden = false;
    byId('migrationNote').textContent =
      `Save migrated from version ${result.migratedFrom}. ${result.notes.join(' ')}`;
    // The original is kept verbatim so a player can always recover their old file.
    if (result.original) await store.write('legacy', { keptFrom: result.migratedFrom, original: result.original });
  }

  // Apply the saved narrative set before anything reads a line. Sets load on demand,
  // and `t()` and the ledger are synchronous everywhere below this point.
  if (result.save.settings.narrative) await applyNarrative(result.save.settings.narrative);

  const stored = result.save.settings.tier;
  let tier: TierName;
  if (stored === 'auto') {
    const probe = document.createElement('canvas').getContext('webgl2');
    const measured = benchmark(probe);
    tier = measured.tier;
    byId('tierNote').textContent = `Quality set to ${tier}. ${measured.reason} You can change it in Options.`;
  } else {
    tier = stored;
    byId('tierNote').textContent = `Quality set to ${tier} by hand.`;
  }

  const game = new Game(result.save, tier);
  // A small, stable surface for the dev console and for the Playwright assertions.
  // Everything on it is a read or a pure function; nothing here mutates the game.
  (window as Window & { qingMao?: unknown }).qingMao = Object.assign(game, {
    frameStats: () => game.stats(),
    debug: {
      lookStraightUp: () => game.lookStraightUp(),
      isExploring: () => game.isExploring(),
      playerPosition: () => game.playerPosition(),
      awaitingBeat: () => game.awaitingBeatId(),
      currentArea: () => game.area(),
      objectiveDistance: () => game.objectiveDistance(),
      lineCount: () => game.lineCount(),
      cameraPosition: () => game.cameraPosition(),
      areaContents: (id: string) => game.areaContents(id),
      characterLook: (id: string) => game.characterLook(id),
      facingProbe: (id: string) => game.facingProbe(id),
      toast: (text: string) => bus.emit('toast', { text }),
      visitArea: (areaId: string) => game.visitArea(areaId),
      jumpToBeat: (beatId: string) => game.jumpToBeat(beatId),
      walkToObjective: () => game.walkToObjective(),
      narrative: () => ({ active: activeNarrativeId(), sets: narrativeSets.map((n) => n.id) }),
      setNarrative: (id: string | null) => applyNarrative(id),
      ledgerText: (chapter: number) => graph.chapters.find((c) => c.chapter === chapter)?.ledger ?? null,
      folkHere: () => game.folkHere(),
      walkToFolk: () => game.walkToFolk(),
      speakToNearest: () => game.speakToNearest(),
      spawnClearance: (areaId: string) => game.spawnClearance(areaId),
      currentBeatFacts: () => game.currentBeatFacts(),
      cameraBasis: () => game.cameraBasis(),
      fightView: () => game.fightView(),
      tryStrike: (abilityId: string) => game.tryStrike(abilityId),
      forageSummary: () => game.forageSummary(),
      forageState: () => game.forageState(),
      walkToGather: () => game.walkToGather(),
      guLoadout: () => game.guLoadout(),
      refine: (recipeId: string) => game.attemptRefinement(recipeId),
      giveGu: (id: string) => game.giveGu(id),
      areaIds: () => game.areaIds(),
      setCameraDistance: (d: number) => game.setCameraDistance(d),
      setInspectionDistance: (d: number | null) => game.setInspectionDistance(d),
      moveDebug: () => game.moveDebug(),
      sceneStateAfterSkip: () => game.sceneStateAfterSkip()
    },
    legacy: { build: () => buildLegacy(game.save), fallback: defaultLegacy, validate: validateLegacy }
  });

  const intro = byId<HTMLDialogElement>('intro');
  openDialog(intro);
  byId('begin').addEventListener('click', () => {
    closeDialog(intro);
    void game.start();
  });
  for (const [id, beatId] of [
    ['startAct2', 'act2.inquiry.jia-fu'],
    ['startAct3', 'act3.assets.petition'],
    ['startAct4', 'act4.yao-le.rank-three']
  ] as const) {
    byId(id).addEventListener('click', () => {
      closeDialog(intro);
      const complete = new Set<string>();
      for (const beat of graph.beats) if (graph.indexOf(beat.id) < graph.indexOf(beatId)) complete.add(beat.id);
      game.save.completed = [...complete];
      game.save.current = beatId;
      void game.start();
    });
  }
}

/**
 * Nothing in the game is reachable if boot throws, and `void boot()` discarded the
 * rejection — so any failure past the WebGL2 gate (a migration that throws on a
 * malformed save, a missing asset) left the player looking at an empty page with no
 * indication that anything had gone wrong at all. A blank screen is the one outcome
 * worth spending a few lines to rule out.
 */
void boot().catch((error: unknown) => {
  const panel = document.getElementById('unsupported');
  const body = document.getElementById('unsupportedBody');
  const heading = panel?.querySelector('h2');
  if (heading) heading.textContent = 'The game could not start';
  if (body) {
    body.textContent =
      'Something failed while starting up, so the game stopped rather than showing you ' +
      'an empty screen. Reloading may be enough. If it is not, the details are below ' +
      'and clearing this site\'s stored data will start a fresh save.';
    const detail = document.createElement('pre');
    detail.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    body.after(detail);
  }
  if (panel) panel.hidden = false;
  throw error;
});

function setSelect(id: string, value: string): void {
  const node = document.getElementById(id) as HTMLSelectElement | null;
  if (node) node.value = value;
}

function setCheck(id: string, value: boolean): void {
  const node = document.getElementById(id) as HTMLInputElement | null;
  if (node) node.checked = value;
}
