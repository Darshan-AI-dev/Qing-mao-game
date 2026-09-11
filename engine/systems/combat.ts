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
import type { SaveGameV5 } from '../save/schema';
import type { Cultivation } from './cultivation';
import type { Upkeep } from './upkeep';

export type TelegraphShape = 'cone' | 'ring' | 'line' | 'slam' | 'arc';
export type TelegraphPattern = 'solid' | 'dashed' | 'dotted' | 'chevron' | 'hatched';

export interface Ability {
  id: string;
  label: string;
  key: string;
  gu: string;
  essence: number;
  /** Unlocked only when this flag is set; the HUD hides the rest. */
  requiresFlag: string;
  kind: 'ranged' | 'melee' | 'guard' | 'dodge' | 'move' | 'utility' | 'heal';
  range: number;
  damage: number;
  seconds?: number;
}

export const ABILITIES: readonly Ability[] = [
  { id: 'moonblade', label: 'Moonblade', key: 'attack', gu: 'moonlight-gu', essence: 4, requiresFlag: 'skill.moonblade', kind: 'ranged', range: 18, damage: 9 },
  { id: 'strike', label: 'Strike', key: 'strike', gu: 'body', essence: 0, requiresFlag: 'rank.1.initial', kind: 'melee', range: 3, damage: 5 },
  { id: 'dodge', label: 'Dodge', key: 'dodge', gu: 'body', essence: 1, requiresFlag: 'rank.1.initial', kind: 'dodge', range: 0, damage: 0, seconds: 0.4 },
  { id: 'guard-jade-skin', label: 'Guard', key: 'guard', gu: 'jade-skin-gu', essence: 3, requiresFlag: 'gu.jade-skin', kind: 'guard', range: 0, damage: 0, seconds: 3 },
  { id: 'guard-white-jade', label: 'Guard', key: 'guard', gu: 'white-jade-gu', essence: 5, requiresFlag: 'gu.white-jade', kind: 'guard', range: 0, damage: 0, seconds: 6 },
  { id: 'guard-sky-canopy', label: 'Canopy', key: 'guard', gu: 'sky-canopy-gu', essence: 9, requiresFlag: 'gu.sky-canopy', kind: 'guard', range: 0, damage: 0, seconds: 7 },
  { id: 'moonglow', label: 'Moonglow', key: 'attack', gu: 'moonglow-gu', essence: 8, requiresFlag: 'gu.moonglow', kind: 'ranged', range: 24, damage: 19 },
  { id: 'blood-moon', label: 'Blood Moon', key: 'attack', gu: 'blood-moon-gu', essence: 14, requiresFlag: 'gu.blood-moon', kind: 'ranged', range: 26, damage: 24 },
  { id: 'centipede', label: 'Centipede', key: 'strike', gu: 'chainsaw-golden-centipede', essence: 11, requiresFlag: 'gu.centipede', kind: 'melee', range: 4, damage: 28 },
  { id: 'wings', label: 'Wings', key: 'wings', gu: 'thunderwings-gu', essence: 7, requiresFlag: 'gu.thunderwings', kind: 'move', range: 14, damage: 0 },
  { id: 'conceal', label: 'Conceal', key: 'conceal', gu: 'stealth-scales-gu', essence: 5, requiresFlag: 'gu.stealth-scales', kind: 'utility', range: 0, damage: 0, seconds: 20 },
  { id: 'listen', label: 'Listen', key: 'listen', gu: 'earth-ear-grass', essence: 3, requiresFlag: 'gu.earth-ear', kind: 'utility', range: 40, damage: 0, seconds: 6 },
  { id: 'leaf', label: 'Leaf', key: 'heal', gu: 'nine-leaf-vitality-grass', essence: 0, requiresFlag: 'gu.nine-leaf', kind: 'heal', range: 0, damage: 0 }
];

export interface BossPhase {
  /** The defence the player has to read, not a damage threshold. */
  defence: string;
  /** What tells the player it is up. */
  telegraph: { shape: TelegraphShape; pattern: TelegraphPattern; seconds: number };
  /** What actually gets through it. */
  answer: string;
  vitality: number;
}

export interface BossDefinition {
  id: string;
  name: string;
  beat: string;
  phases: BossPhase[];
}

export const BOSSES: readonly BossDefinition[] = [
  {
    id: 'fang-zheng', name: 'Fang Zheng', beat: 'act2.duel.fang-zheng',
    phases: [
      { defence: 'An outer ward he reapplies on a count of four.', telegraph: { shape: 'ring', pattern: 'solid', seconds: 1.1 }, answer: 'Strike inside the count, not through the ward.', vitality: 60 },
      { defence: 'A second layer he only raises when pressed at range.', telegraph: { shape: 'arc', pattern: 'dashed', seconds: 0.9 }, answer: 'Close the distance and he cannot raise it.', vitality: 70 },
      { defence: 'A retreat into the same corner of the arena, every time.', telegraph: { shape: 'line', pattern: 'chevron', seconds: 0.7 }, answer: 'Be in the corner first.', vitality: 50 }
    ]
  },
  {
    id: 'monkey-king', name: 'Jade-eye stone monkey king', beat: 'act2.inheritance.stone-forest',
    phases: [
      { defence: 'Concealment against the pillars; it only breaks to strike.', telegraph: { shape: 'cone', pattern: 'dotted', seconds: 0.8 }, answer: 'Watch the pillar, not the floor. Light helps.', vitality: 80 },
      { defence: 'It drops stone from above rather than closing.', telegraph: { shape: 'slam', pattern: 'hatched', seconds: 1.3 }, answer: 'Keep moving between pillars; guard is wasted here.', vitality: 90 }
    ]
  },
  {
    id: 'boar-king', name: 'Wild boar king', beat: 'act2.winter.boar-king',
    phases: [
      { defence: 'A charge it commits to completely.', telegraph: { shape: 'line', pattern: 'chevron', seconds: 1.2 }, answer: 'Sidestep late. Guarding a charge costs more than it saves.', vitality: 120 },
      { defence: 'It turns its flank to the wolves and not to you.', telegraph: { shape: 'arc', pattern: 'solid', seconds: 1.0 }, answer: 'Let the wolves work. Strike the flank they opened.', vitality: 100 }
    ]
  },
  {
    id: 'thunder-crown-wolf', name: 'Thunder Crown Wolf', beat: 'act3.wolf-tide.forest',
    phases: [
      { defence: 'The pack screens it; the small ones drive, it arrives after.', telegraph: { shape: 'ring', pattern: 'dashed', seconds: 0.9 }, answer: 'Conceal and let the screen pass. Fighting the screen is the trap.', vitality: 110 },
      { defence: 'A crown discharge that follows the wet ground.', telegraph: { shape: 'cone', pattern: 'hatched', seconds: 1.4 }, answer: 'Stand on stone. The telegraph shows the water, not the wolf.', vitality: 130 }
    ]
  },
  {
    id: 'bai-ning-bing', name: 'Bai Ning Bing', beat: 'act4.bai.transformation',
    phases: [
      { defence: 'Ice that answers whatever you opened with.', telegraph: { shape: 'ring', pattern: 'dotted', seconds: 1.0 }, answer: 'Change your opening. The ice mirrors the last thing it saw.', vitality: 140 }
    ]
  }
];

export class Combat {
  private guardUntil = 0;
  private concealUntil = 0;

  constructor(private save: SaveGameV5, private cultivation: Cultivation, private upkeep: Upkeep) {}

  /** Only unlocked, relevant abilities. The phone HUD shows nothing else. */
  availableAbilities(flags: ReadonlySet<string>): Ability[] {
    const rows = ABILITIES.filter((a) => flags.has(a.requiresFlag));
    // Later guards replace earlier ones rather than stacking up as separate buttons.
    const byKey = new Map<string, Ability>();
    for (const ability of rows) byKey.set(`${ability.key}:${ability.kind}`, ability);
    return [...byKey.values()];
  }

  cost(ability: Ability): number {
    return Math.ceil(ability.essence * this.upkeep.costMultiplier(ability.gu));
  }

  use(ability: Ability, now: number): boolean {
    if (ability.essence > 0 && !this.cultivation.spend(ability.essence, ability.gu)) return false;
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
