/**
 * The cultivation model: aperture state, essence, small realms, breakthroughs.
 *
 * Cultivating costs stones and calendar time, which is what keeps it in tension
 * with missions and classes. Breakthroughs are staged as rituals by the scene
 * runner; this module only holds the state and the gates.
 */
import { bus } from '../core/bus';
import { aptitudeGrades, ranks } from '../../canon/index';
import type { SaveGameV5 } from '../save/schema';
import type { Calendar } from './calendar';
import type { Economy } from './economy';
import type { Upkeep } from './upkeep';

const STAGES = ['initial', 'middle', 'upper', 'peak'] as const;
type Stage = (typeof STAGES)[number];

/** Essence ceilings by rank, scaled by the 44% sea the text gives Fang Yuan. */
const RANK_SEA: Record<number, number> = { 0: 0, 1: 44, 2: 90, 3: 180, 4: 360, 8: 900 };

export class Cultivation {
  constructor(
    private save: SaveGameV5,
    private economy: Economy,
    private calendar: Calendar,
    private upkeep: Upkeep
  ) {}

  get rank(): number {
    return this.save.aperture.rank;
  }

  get stage(): Stage {
    return this.save.aperture.stage;
  }

  get essence(): number {
    return this.save.aperture.essence;
  }

  get essenceMax(): number {
    return this.save.aperture.essenceMax;
  }

  rankLabel(): string {
    const rank = ranks.find((r) => r.id === `rank${this.save.aperture.rank}`);
    if (!rank) return 'Unawakened';
    if (this.save.aperture.rank === 0) return rank.name;
    const stage = this.save.aperture.stage;
    return `${rank.name} · ${stage[0]!.toUpperCase()}${stage.slice(1)} stage`;
  }

  essenceLabel(): string {
    const rank = ranks.find((r) => r.id === `rank${this.save.aperture.rank}`);
    return rank?.essence ?? 'none';
  }

  aptitudeLabel(): string {
    const grade = aptitudeGrades.find((g) => g.seaPercent === this.save.aperture.aptitude);
    return grade ? `${grade.grade} grade · ${grade.seaPercent}%` : `${this.save.aperture.aptitude}%`;
  }

  /** Every ability routes its cost through here so the HUD and the bus agree. */
  spend(amount: number, guId: string): boolean {
    const cost = Math.ceil(amount * this.upkeep.costMultiplier(guId));
    if (this.save.aperture.essence < cost) {
      bus.emit('gu.refused', { gu: guId, reason: this.upkeep.isSluggish(guId) ? 'sluggish' : 'essence' });
      return false;
    }
    this.save.aperture.essence -= cost;
    bus.emit('gu.activate', { gu: guId, essence: cost });
    bus.emit('player.essence', { value: this.save.aperture.essence, max: this.save.aperture.essenceMax });
    return true;
  }

  restore(amount: number): void {
    this.save.aperture.essence = Math.min(this.save.aperture.essenceMax, this.save.aperture.essence + amount);
    bus.emit('player.essence', { value: this.save.aperture.essence, max: this.save.aperture.essenceMax });
  }

  /** One session of seated cultivation: stones, a day of the calendar, some essence. */
  cultivate(): { essence: number; stones: number } | null {
    const stones = 1;
    if (!this.economy.spend(stones, 'Cultivation')) return null;
    const hasLiquor = this.save.gu.some((g) => (g.id === 'liquor-worm' || g.id === 'four-flavours-liquor-worm') && !g.sluggish);
    const gain = Math.ceil(this.save.aperture.essenceMax * (hasLiquor ? 0.45 : 0.3));
    this.restore(gain);
    this.calendar.advance(1);
    bus.emit('cultivate.tick', { essence: gain, stones });
    return { essence: gain, stones };
  }

  /** Canonical breakthroughs are never gated on resources; the ritual is the gate. */
  beginBreakthrough(rank: number, stage: Stage): void {
    bus.emit('breakthrough.begin', { rank: `rank${rank}`, stage });
  }

  completeBreakthrough(rank: number, stage: Stage): void {
    this.save.aperture.rank = rank;
    this.save.aperture.stage = stage;
    const sea = RANK_SEA[rank] ?? this.save.aperture.essenceMax;
    this.save.aperture.essenceMax = sea;
    this.save.aperture.essence = sea;
    bus.emit('breakthrough.done', { rank: `rank${rank}`, stage });
    bus.emit('player.essence', { value: sea, max: sea });
  }

  /** Chapter 200: back to Rank one, and he knows exactly what he has lost. */
  reduceTo(rank: number, stage: Stage): void {
    this.save.aperture.rank = rank;
    this.save.aperture.stage = stage;
    this.save.aperture.essenceMax = RANK_SEA[rank] ?? 44;
    this.save.aperture.essence = Math.min(this.save.aperture.essence, this.save.aperture.essenceMax);
    bus.emit('player.essence', { value: this.save.aperture.essence, max: this.save.aperture.essenceMax });
  }

  nextStage(): Stage | null {
    const index = STAGES.indexOf(this.save.aperture.stage);
    return index >= 0 && index < STAGES.length - 1 ? STAGES[index + 1]! : null;
  }
}
