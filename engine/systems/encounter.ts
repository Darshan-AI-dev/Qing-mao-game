/**
 * Fights.
 *
 * `BOSSES` in combat.ts described five multi-phase encounters — telegraph shapes,
 * reaction windows, and a sentence for each phase saying what actually gets through
 * its defence — and nothing ever instantiated one. Every must-land fight in the game,
 * the prologue included, was a dialogue scene with an essence bar that did nothing.
 *
 * This is the part that was missing. A phase is a rule, not a health bar:
 *
 *   - `window`   strike in the gap after its guard drops, not into the guard
 *   - `close`    it can only raise the second layer at range, so be inside it
 *   - `place`    it retreats to the same spot every time; be standing there
 *   - `conceal`  the screen has to pass over you, not be fought
 *   - `vary`     the ice mirrors your last opening, so do not repeat it
 *
 * Each rule is one sentence of the source text made mechanical, and the player can
 * be told the sentence by calling the Recollection up — Fang Yuan has fought this
 * before, which is the whole premise of the game.
 *
 * Telegraph windows come from the data and are stretched on the gentler difficulty.
 * Research consensus for action games is about 250ms to perceive and answer a cue at
 * all, so nothing here is allowed below 450ms even on hard.
 */
import { bus } from '../core/bus';
import type { Ability, BossDefinition } from './bosses';
import type { Combat } from './combat';
import { phasesFor, type EncounterPhase } from './phases';
export type { EncounterPhase, PhaseRule } from './phases';

export type EncounterState = 'approaching' | 'winding' | 'striking' | 'open' | 'won' | 'lost';

export interface EncounterView {
  name: string;
  phase: number;
  phases: number;
  defence: string;
  hint: string;
  vitality: number;
  vitalityMax: number;
  state: EncounterState;
  /** True while the player's attacks will actually land. */
  openNow: boolean;
}

import type { Cultivation } from './cultivation';
import type { SaveGameV5 } from '../save/schema';

export interface EncounterHost {
  playerPosition(): { x: number; z: number };
  /**
   * Has the player called this beat's memory up?
   *
   * If they have, Fang Yuan remembers how the fight goes and the phase's rule is
   * printed for them. If they have not, the panel says what the foe is *doing* but not
   * what beats it, and working it out unprompted is the Foresight recognition the
   * design asks for. It is the game's central pillar made into a combat mechanic:
   * you are the one who remembers, and remembering is worth something.
   */
  recalled(): boolean;
  /** Where the foe should stand, and how it moves. The renderer owns the body. */
  moveFoe(x: number, z: number, facing: number): void;
  concealed(now: number): boolean;
  guarding(now: number): boolean;
}

/** A fight in progress. One at a time; the scene runner owns its lifetime. */
export class Encounter {
  readonly phases: EncounterPhase[];
  private index = 0;
  private vitality: number;
  private state: EncounterState = 'approaching';
  private stateUntil = 0;
  private foe = { x: 0, z: -14 };
  private lastOpening = '';
  /** Phases the player has already beaten the rule of at least once. */
  private discovered = new Set<number>();
  /** Openings the ice has already seen, for the `vary` rule. */
  private seenOpenings = new Set<string>();

  constructor(
    readonly boss: BossDefinition,
    private save: SaveGameV5,
    private combat: Combat,
    private cultivation: Cultivation,
    private host: EncounterHost
  ) {
    this.phases = phasesFor(boss);
    this.vitality = this.phases[0]!.vitality;
    bus.emit('fight.start', { boss: boss.id, name: boss.name, phases: this.phases.length });
  }

  get phase(): EncounterPhase {
    return this.phases[this.index]!;
  }

  get finished(): boolean {
    return this.state === 'won' || this.state === 'lost';
  }

  get won(): boolean {
    return this.state === 'won';
  }

  /**
   * Telegraph length, stretched for the gentler difficulty and floored well above a
   * human reaction time on the harder one.
   */
  private windUp(): number {
    const base = this.phase.telegraph.seconds;
    const scale = this.save.settings.difficulty === 'story' ? 1.8 : this.save.settings.difficulty === 'hard' ? 0.8 : 1.2;
    return Math.max(0.45, base * scale) * 1000;
  }

  view(now: number): EncounterView {
    return {
      name: this.boss.name,
      phase: this.index + 1,
      phases: this.phases.length,
      defence: this.phase.defence,
      // Earned, not given: recall it, or work it out and keep it.
      hint: this.host.recalled() || this.discovered.has(this.index) ? this.phase.hint : '',
      vitality: this.vitality,
      vitalityMax: this.phase.vitality,
      state: this.state,
      openNow: this.openNow(now)
    };
  }

  /** Would a strike land right now? The phase rule decides, not the damage number. */
  openNow(now: number): boolean {
    if (this.finished) return false;
    const rule = this.phase.rule;
    const player = this.host.playerPosition();
    const distance = Math.hypot(player.x - this.foe.x, player.z - this.foe.z);
    switch (rule.kind) {
      case 'window':
        return this.state === 'open';
      case 'close':
        return distance <= rule.within;
      case 'place':
        return Math.hypot(player.x - rule.x, player.z - rule.z) <= rule.radius;
      case 'conceal':
        return this.host.concealed(now);
      case 'vary':
        return true;
    }
  }

  /**
   * The player swings. Returns what happened, so the HUD can say why nothing landed —
   * a fight where your attacks silently do nothing is a fight nobody can learn.
   */
  strike(ability: Ability, now: number): { landed: boolean; reason: string; damage: number } {
    if (this.finished) return { landed: false, reason: 'It is over.', damage: 0 };
    const player = this.host.playerPosition();
    const distance = Math.hypot(player.x - this.foe.x, player.z - this.foe.z);
    if (distance > ability.range) {
      return this.miss(`${ability.label} does not reach that far.`);
    }
    if (this.phase.rule.kind === 'vary' && this.lastOpening === ability.id) {
      this.seenOpenings.add(ability.id);
      return this.miss('It has already answered that one.');
    }
    if (!this.openNow(now)) {
      return this.miss(this.phase.hint);
    }
    this.lastOpening = ability.id;
    if (!this.discovered.has(this.index)) {
      this.discovered.add(this.index);
      if (!this.host.recalled()) {
        bus.emit('fight.read', { boss: this.boss.id, phase: this.index + 1, hint: this.phase.hint });
      }
    }
    const damage = Math.max(1, Math.round(ability.damage));
    this.vitality -= damage;
    bus.emit('hit.enemy', { amount: damage, target: this.boss.id, telegraph: this.phase.telegraph.shape });
    if (this.vitality <= 0) this.advance(now);
    return { landed: true, reason: '', damage };
  }

  /** A swing that did nothing, and the reason, which the player is always told. */
  private miss(reason: string): { landed: boolean; reason: string; damage: number } {
    bus.emit('fight.miss', { boss: this.boss.id, reason });
    return { landed: false, reason, damage: 0 };
  }

  private advance(now: number): void {
    if (this.index + 1 >= this.phases.length) {
      this.state = 'won';
      bus.emit('fight.end', { boss: this.boss.id, won: true });
      return;
    }
    this.index += 1;
    this.vitality = this.phase.vitality;
    this.state = 'approaching';
    this.stateUntil = now + 900;
    this.lastOpening = '';
    bus.emit('fight.phase', { boss: this.boss.id, phase: this.index + 1, defence: this.phase.defence });
  }

  /**
   * The foe's turn: close the distance, wind up where the player can see it, strike,
   * then stand open for a moment. The open window is the `window` rule's answer.
   */
  update(dt: number, now: number, flags: ReadonlySet<string>): void {
    if (this.finished) return;
    if (this.save.vitality <= 0) {
      this.state = 'lost';
      bus.emit('fight.end', { boss: this.boss.id, won: false });
      return;
    }

    const player = this.host.playerPosition();
    const toPlayer = Math.atan2(player.x - this.foe.x, player.z - this.foe.z);
    const distance = Math.hypot(player.x - this.foe.x, player.z - this.foe.z);

    // It closes unless it is mid-swing, and never walks into the player.
    if (this.state === 'approaching' || this.state === 'open') {
      const reach = 3.2;
      if (distance > reach) {
        const speed = 4.4 * dt;
        this.foe.x += Math.sin(toPlayer) * speed;
        this.foe.z += Math.cos(toPlayer) * speed;
      }
    }
    this.host.moveFoe(this.foe.x, this.foe.z, toPlayer);

    if (now < this.stateUntil) return;
    switch (this.state) {
      case 'approaching': {
        this.state = 'winding';
        this.stateUntil = now + this.windUp();
        this.combat.telegraph(this.boss.id, this.phase);
        return;
      }
      case 'winding': {
        this.state = 'striking';
        this.stateUntil = now + 220;
        // Concealment and a raised guard are the two answers to being hit. A dodge is
        // the third, and it works by not being here: the reach check below.
        const hit = Math.hypot(player.x - this.foe.x, player.z - this.foe.z) < 6.5;
        if (hit && !this.host.concealed(now)) {
          this.combat.damageTaken(this.phaseDamage(), now, flags);
        }
        // A swing that misses is not announced. The lean on the body and the telegraph
        // already said it was coming; a toast for every one of them buries the ones
        // that matter, which are the player's own misses and their reasons.
        return;
      }
      case 'striking': {
        this.state = 'open';
        this.stateUntil = now + 1100;
        bus.emit('fight.open', { boss: this.boss.id, seconds: 1.1 });
        return;
      }
      case 'open': {
        this.state = 'approaching';
        this.stateUntil = now + 500;
        return;
      }
      default:
        return;
    }
  }

  /**
   * A share of the player's own ceiling, not a flat number.
   *
   * Flat damage is meaningless across this game's range: eight points is a fifth of a
   * Rank one's forty-four and a rounding error against the prologue's nine hundred, so
   * the tutorial fight could not scratch him while the same number would gut him in
   * chapter 20. Seven per cent of maximum, rising with the phase, means every fight
   * costs about the same fraction of a life however far up the ranks it happens.
   */
  private phaseDamage(): number {
    const share = 0.07 + this.index * 0.025;
    return Math.max(1, Math.round(this.save.vitalityMax * share));
  }

  /** Sets the foe's starting ground, so the fight opens with both of them in frame. */
  placeFoeAt(x: number, z: number): void {
    this.foe = { x, z };
    this.host.moveFoe(x, z, 0);
  }

  /** Where the foe is, for the renderer and for tests. */
  foePosition(): { x: number; z: number } {
    return { ...this.foe };
  }

  /** Seconds left of the current open window, for the HUD bar. */
  openWindow(now: number): number {
    return this.state === 'open' ? Math.max(0, (this.stateUntil - now) / 1000) : 0;
  }

  /** Essence the player has to spend, so the HUD can grey out what is unaffordable. */
  affordable(ability: Ability): boolean {
    return this.cultivation.essence >= this.combat.cost(ability);
  }
}
