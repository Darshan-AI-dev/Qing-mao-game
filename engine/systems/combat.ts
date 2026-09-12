/**
 * Combat.
 *
 * Every ability shows its essence cost, because after the drop back to Rank one at
 * chapter 200 the scarcity is the whole feeling. Telegraphs carry a shape and a
 * pattern as well as a colour, so they read without colour vision.
 *
 * Bosses are multi-phase and each phase is a defence to read rather than a health
 * bar to out-damage: Fang Zheng's layered shields, the monkey king's concealment,
 * Bai Ning Bing's ice, the Thunder Crown Wolf.
 */
import { bus } from '../core/bus';
import { ABILITIES, BOSSES, type Ability, type BossDefinition, type BossPhase } from './bosses';
export * from './bosses';
import type { SaveGameV5 } from '../save/schema';
import type { Cultivation } from './cultivation';
import type { Upkeep } from './upkeep';

/**
 * How long before the same ability can be used again.
 *
 * Without this a fight is a click-race: the open window is about a second, and a
 * player tapping every tenth of a second lands ten strikes in it, which turns a phase
 * you are meant to read into a phase you out-type. A melee swing recovers faster than
 * a thrown blade, and a guard cannot simply be held up forever.
 */
const RECOVERY: Record<Ability['kind'], number> = {
  ranged: 620, melee: 420, guard: 1400, dodge: 700, move: 1200, utility: 2000, heal: 900
};

export class Combat {
  private guardUntil = 0;
  private concealUntil = 0;
  private readyAt = new Map<string, number>();

  constructor(private save: SaveGameV5, private cultivation: Cultivation, private upkeep: Upkeep) {}

  /**
   * Only unlocked, carried, relevant abilities. The phone HUD shows nothing else.
   *
   * A Gu sitting in reserve is not on him, so its ability is not on the bar. Without
   * this the carrying limit would only be an upkeep discount, and the loadout would
   * not be a decision at all.
   */
  availableAbilities(flags: ReadonlySet<string>): Ability[] {
    const stored = new Set(this.upkeep.stored().map((g) => g.id));
    const rows = ABILITIES.filter((a) => flags.has(a.requiresFlag) && !stored.has(a.gu));
    // Later guards replace earlier ones rather than stacking up as separate buttons.
    const byKey = new Map<string, Ability>();
    for (const ability of rows) byKey.set(`${ability.key}:${ability.kind}`, ability);
    return [...byKey.values()];
  }

  cost(ability: Ability): number {
    return Math.ceil(ability.essence * this.upkeep.costMultiplier(ability.gu));
  }

  /** Milliseconds until this ability can be used again, 0 when it is ready. */
  cooldown(ability: Ability, now: number): number {
    return Math.max(0, (this.readyAt.get(ability.id) ?? 0) - now);
  }

  ready(ability: Ability, now: number): boolean {
    return this.cooldown(ability, now) === 0;
  }

  use(ability: Ability, now: number): boolean {
    if (!this.ready(ability, now)) return false;
    if (ability.essence > 0 && !this.cultivation.spend(ability.essence, ability.gu)) return false;
    this.readyAt.set(ability.id, now + RECOVERY[ability.kind]);
    const effect = this.upkeep.effectMultiplier(ability.gu);
    if (ability.kind === 'guard') this.guardUntil = now + (ability.seconds ?? 0) * 1000 * effect;
    if (ability.kind === 'utility' && ability.id === 'conceal') this.concealUntil = now + (ability.seconds ?? 0) * 1000 * effect;
    if (ability.kind === 'heal') {
      if (!this.save.economy.items['vitality-leaf']) return false;
      this.save.economy.items['vitality-leaf'] -= 1;
      this.save.vitality = Math.min(this.save.vitalityMax, this.save.vitality + 30);
      bus.emit('player.vitality', { value: this.save.vitality, max: this.save.vitalityMax });
    }
    return true;
  }

  guarding(now: number): boolean {
    return now < this.guardUntil;
  }

  concealed(now: number): boolean {
    return now < this.concealUntil;
  }

  /** Guard strength follows the Gu: three seconds at 75%, six at 90%, canopy above. */
  damageTaken(amount: number, now: number, flags: ReadonlySet<string>): number {
    const difficulty = this.save.settings.difficulty === 'story' ? 0.6 : this.save.settings.difficulty === 'hard' ? 1.4 : 1;
    let incoming = amount * difficulty;
    if (this.guarding(now)) {
      const reduction = flags.has('gu.sky-canopy') ? 0.94 : flags.has('gu.white-jade') ? 0.9 : 0.75;
      incoming *= 1 - reduction;
    }
    const taken = Math.max(1, Math.round(incoming));
    this.save.vitality = Math.max(0, this.save.vitality - taken);
    bus.emit('hit.player', { amount: taken, source: 'enemy' });
    bus.emit('player.vitality', { value: this.save.vitality, max: this.save.vitalityMax });
    if (!this.save.settings.reducedMotion) bus.emit('camera.shake', { strength: Math.min(1, taken / 25) });
    if (this.save.settings.haptics) bus.emit('haptic', { pattern: [18] });
    return taken;
  }

  telegraph(target: string, phase: BossPhase): void {
    bus.emit('enemy.telegraph', {
      target,
      shape: phase.telegraph.shape,
      pattern: phase.telegraph.pattern,
      seconds: phase.telegraph.seconds
    });
  }

  static bossFor(beatId: string): BossDefinition | undefined {
    return BOSSES.find((b) => b.beat === beatId);
  }
}
