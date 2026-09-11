/**
 * Game entry point. Wires the engine to whichever content package is imported.
 *
 * The division of labour is the one from the architecture plan: `/engine` knows
 * about beats, systems, rendering and UI but nothing about Qing Mao; `/content`
 * supplies the beat graph, the scenes and the areas; `/canon` is shared with the
 * sequel. Swapping the content import is the whole of what game 2 has to do here.
 */
import { Vector3, type Object3D } from 'three';
import { areasById, charactersById, mustLandForChapter, actForChapter } from '../canon/index';
import { graph, illustrationsById, loadScript, t } from '../content/qingmao/index';
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
import { Refinement } from './systems/refinement';
import { Memory } from './systems/memory';
import { Combat, type Ability } from './systems/combat';
import { freshSave, type SaveGameV5 } from './save/schema';
import { buildLegacy, defaultLegacy, validateLegacy } from './save/legacy';
import { migrate } from './save/migrate';
import * as store from './save/store';
import { Input, type Intent } from './input/input';
import { Dialogue, showChapterTitle } from './ui/dialogue';
import { Hud, attachToasts } from './ui/hud';
import { Panels } from './ui/panels';
import { Feedback } from './ui/feedback';
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

  private actors = new Map<string, Actor>();
  private blockers: Blocker[] = [];
  private player = { x: 0, z: 44, facing: 0 };
  private cameraYaw = 0;
  private cameraPitch = 0.42;
  private cameraDistance = 16;
  private freeCamera = false;
  private inScene = false;
  private skipRequested = false;
  private lastTick = performance.now();
  private lastAutosave = performance.now();
  private currentArea = '';
  /** The beat waiting to be started, if the player is between beats. */
  private awaiting: Beat | null = null;
  private objective: Object3D | null = null;
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

    this.hud = new Hud(this.input);
    this.feedback = new Feedback(canvas, () => this.save.settings.reducedMotion, () => this.save.settings.haptics);
    this.timeline = new Timeline(this);
    this.panels = new Panels({
      save,
      graph,
      economy: this.economy,
      upkeep: this.upkeep,
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
    for (const actor of this.actors.values()) actor.dispose();
    this.actors.clear();

    const built = buildArea(description, {
      instanceBudget: this.renderer.quality.budget.instanceBudget,
      shadows: this.renderer.quality.budget.shadows
    });
    for (const chunk of built.chunks) this.renderer.addChunk(chunk.group, chunk.centre, chunk.radius);
    for (const lantern of built.lanterns) this.renderer.addLantern(lantern.x, lantern.y, lantern.z);
    this.blockers = built.blockers;
    this.currentArea = areaId;
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
      fogFar: lit ? span * 2.6 : description.fog.far
    });
    if (enclosed && !dark) {
      // One overhead fill, hung just under the ceiling.
      this.renderer.addFill(0, (description.ceilingHeight ?? 6) - 1.1, 0, 1.25);
    }

    const player = this.spawn('fang-yuan');
    // Spawn within sight of what the beat stages at the area's origin. The previous
    // build's chapter-101 preset dropped the player 192 paces from their objective.
    const spawnZ = Math.min(description.size.z / 2 - 6, MAX_SPAWN_DISTANCE);
    this.player = { x: 0, z: spawnZ, facing: Math.PI };
    player.setPosition(0, 0, spawnZ);
    byId('regionName').textContent = canon?.name ?? areaId;
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

  camera = {
    to: (position: Vector3, look: Vector3, seconds: number): Promise<void> =>
      new Promise((resolve) => {
        const from = this.renderer.camera.position.clone();
        const start = performance.now();
        const step = (now: number) => {
          const time = seconds <= 0 ? 1 : Math.min(1, (now - start) / (seconds * 1000));
          const eased = time * time * (3 - 2 * time);
          this.renderer.camera.position.lerpVectors(from, position, eased);
          this.renderer.camera.lookAt(look);
          if (time < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    cut: (position: Vector3, look: Vector3): void => {
      this.renderer.camera.position.copy(position);
      this.renderer.camera.lookAt(look);
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
    if (guFlag) this.upkeep.acquire(guFlag, this.save.calendar.day);
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

    for (const actor of this.actors.values()) actor.update(dt, now);
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
      if (pressed.has(ability.key as Intent)) this.combat.use(ability, performance.now());
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
    if (!this.blocked(nextX, this.player.z)) this.player.x = nextX;
    if (!this.blocked(this.player.x, nextZ)) this.player.z = nextZ;
    this.player.facing = facing;

    const actor = this.actors.get('fang-yuan');
    if (actor) {
      actor.setPosition(this.player.x, 0, this.player.z);
      actor.setFacing(facing);
      // A half-pushed stick walks; only a firm push runs.
      actor.play(running && Math.hypot(dx, dz) > 0.7 ? 'run' : 'walk');
    }
  }

  private blocked(x: number, z: number): boolean {
    for (const blocker of this.blockers) {
      if (Math.abs(x - blocker.x) < blocker.w + 0.5 && Math.abs(z - blocker.z) < blocker.d + 0.5) return true;
    }
    const description = areaDescription(this.currentArea);
    return Math.abs(x) > description.size.x / 2 - 2 || Math.abs(z) > description.size.z / 2 - 2;
  }

  private updateCamera(frame: { look: { dx: number; dy: number } }, dt: number): void {
    if (this.inScene) return;
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
    const eye = orbitCamera(this.player, this.cameraYaw, this.cameraPitch, this.effectiveCameraDistance());
    this.renderer.camera.position.set(eye.x, eye.y, eye.z);
    this.renderer.camera.lookAt(new Vector3(this.player.x, 2, this.player.z));
  }

  /**
   * Pulls the camera in so it stays inside the room.
   *
   * The default 16-unit orbit is fine outdoors and puts the camera through the wall of
   * an 18-by-20 bedroom, which renders as the room seen from outside. Interiors get a
   * distance proportional to their smaller half-extent.
   */
  private effectiveCameraDistance(): number {
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
    const beat = this.currentBeat();
    const chapter = beat?.chapters[0] ?? 1;
    const moment = mustLandForChapter(chapter);
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
        questTask: beat?.designNote ?? '',
        chapterLabel: beat ? `Chapter ${beat.chapters[0]}${beat.chapters[1] > beat.chapters[0] ? `–${beat.chapters[1]}` : ''}${moment ? ' · a moment that has to land' : ''}` : '',
        calendarLabel: this.calendar.label(),
        distance: this.distanceToObjective(),
        context: this.contextAction(),
        sluggish: this.save.gu.filter((g) => g.sluggish).map((g) => g.id),
        recollectionAvailable: !!beat && !!this.memory.available(beat.id) && !this.memory.viewed(beat.id)
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
                      'holdToGuard', 'holdToRun', 'refinementFailure', 'guUpkeep'] as const) {
      const node = maybe<HTMLInputElement>(id);
      if (node) (settings as unknown as Record<string, unknown>)[id] = node.checked;
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

  await store.requestPersistence();
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

void boot();

function setSelect(id: string, value: string): void {
  const node = document.getElementById(id) as HTMLSelectElement | null;
  if (node) node.value = value;
}

function setCheck(id: string, value: boolean): void {
  const node = document.getElementById(id) as HTMLInputElement | null;
  if (node) node.checked = value;
}
