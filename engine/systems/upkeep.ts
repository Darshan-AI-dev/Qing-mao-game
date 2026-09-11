/**
 * Gu upkeep. The in-game reason the player needs stones.
 *
 * Each Gu eats what the canon bible says it eats, on its own interval. Upkeep is
 * paid automatically from inventory first and stones second, and every payment
 * appears in the ledger.
 *
 * If the player runs short the Gu goes sluggish: costs rise, effects weaken, and
 * optional content is locked until it is fed. A canonical Gu is never lost. The
 * whole system can be switched off in settings for players who want the story
 * without the housekeeping.
 */
import { bus } from '../core/bus';
import { canonicalGuIds, guById, itemsById } from '../../canon/index';
import type { SaveGameV5 } from '../save/schema';
import type { Economy } from './economy';

export const SLUGGISH_COST_MULTIPLIER = 1.5;
export const SLUGGISH_EFFECT_MULTIPLIER = 0.65;

export interface UpkeepReport {
  fed: { gu: string; paidWith: 'item' | 'stones'; cost: number }[];
  sluggish: string[];
  recovered: string[];
  totalStones: number;
}

export class Upkeep {
  constructor(private save: SaveGameV5, private economy: Economy) {}

  /** Runs once per calendar day. */
  tick(day: number): UpkeepReport {
    const report: UpkeepReport = { fed: [], sluggish: [], recovered: [], totalStones: 0 };
    if (!this.save.settings.guUpkeep) return report;

    for (const state of this.save.gu) {
      const canon = guById.get(state.id);
      if (!canon?.feedDays) continue;
      if (day - state.fedOn < canon.feedDays) continue;

      const dietItem = canon.dietItem;
      if (dietItem && this.economy.consumeItem(dietItem, 1)) {
        state.fedOn = day;
        const wasSluggish = state.sluggish;
        state.sluggish = false;
        if (wasSluggish) report.recovered.push(state.id);
        report.fed.push({ gu: state.id, paidWith: 'item', cost: 0 });
        bus.emit('gu.feed', { gu: state.id, paidWith: 'item', cost: 0 });
        continue;
      }

      const price = canon.stonesPerFeed ?? (dietItem ? itemsById.get(dietItem)?.stones ?? 1 : 1);
      const cost = state.sluggish ? Math.ceil(price * SLUGGISH_COST_MULTIPLIER) : price;
      if (this.economy.spend(cost, `Fed ${canon.name}`)) {
        state.fedOn = day;
        const wasSluggish = state.sluggish;
        state.sluggish = false;
        if (wasSluggish) report.recovered.push(state.id);
        report.fed.push({ gu: state.id, paidWith: 'stones', cost });
        report.totalStones += cost;
        bus.emit('gu.feed', { gu: state.id, paidWith: 'stones', cost });
        continue;
      }

      // Short. The Gu goes sluggish; it is never lost, canonical or otherwise.
      if (!state.sluggish) {
        state.sluggish = true;
        report.sluggish.push(state.id);
        bus.emit('gu.sluggish', { gu: state.id, days: day - state.fedOn });
        bus.emit('toast', { text: `${canon.name} has gone sluggish. It needs ${canon.diet}.` });
      }
    }
    return report;
  }

  isSluggish(guId: string): boolean {
    return this.save.gu.find((g) => g.id === guId)?.sluggish ?? false;
  }

  /** Optional content is gated on a fed Gu; canonical content never is. */
  blocksOptional(guId: string): boolean {
    return this.isSluggish(guId);
  }

  costMultiplier(guId: string): number {
    return this.isSluggish(guId) ? SLUGGISH_COST_MULTIPLIER : 1;
  }

  effectMultiplier(guId: string): number {
    return this.isSluggish(guId) ? SLUGGISH_EFFECT_MULTIPLIER : 1;
  }

  /** Per-day stone cost of the current inventory, for the ledger's upkeep row. */
  dailyBurn(): number {
    let total = 0;
    for (const state of this.save.gu) {
      const canon = guById.get(state.id);
      if (!canon?.feedDays) continue;
      total += (canon.stonesPerFeed ?? 1) / canon.feedDays;
    }
    return Math.round(total * 100) / 100;
  }

  acquire(guId: string, day: number): void {
    if (this.save.gu.some((g) => g.id === guId)) return;
    this.save.gu.push({ id: guId, fedOn: day, sluggish: false });
  }

  /** Only ever called for non-canonical Gu. The guard is the point. */
  release(guId: string): boolean {
    if (canonicalGuIds.has(guId)) return false;
    const index = this.save.gu.findIndex((g) => g.id === guId);
    if (index < 0) return false;
    this.save.gu.splice(index, 1);
    return true;
  }
}
