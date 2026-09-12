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
 *
 * There is also a carrying limit, because the source has one: a mortal Gu Master of
 * ranks one to five raises five or six at a time, no more. Past that a new Gu arrives
 * stored — no upkeep, no use — and the player chooses what to carry. That is what
 * makes upkeep a decision rather than a bill: you are paying for the five you picked.
 * Nothing is destroyed and every swap is reversible, so no loadout can strand a save.
 */
import { bus } from '../core/bus';
import { canonicalGuIds, guById, itemsById } from '../../canon/index';
import type { GuState, SaveGameV5 } from '../save/schema';
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
      if (state.stored) continue;
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
      if (state.stored) continue;
      const canon = guById.get(state.id);
      if (!canon?.feedDays) continue;
      total += (canon.stonesPerFeed ?? 1) / canon.feedDays;
    }
    return Math.round(total * 100) / 100;
  }

  /**
   * How many Gu can be carried at once.
   *
   * "Mortal Gu Masters ranked one to five would usually only raise at most five to six
   * mortal Gu at the same time." Five while he is still finding his feet, six from
   * Rank three, and the prologue's Rank eight is not a mortal master at all.
   */
  capacity(): number {
    const rank = this.save.aperture.rank;
    if (rank >= 6) return 12;
    return rank >= 3 ? 6 : 5;
  }

  /**
   * What is coming due, soonest first, for the HUD strip.
   *
   * Upkeep was invisible until something went hungry, which makes "scarcity you can
   * feel" a bill that arrives rather than a pressure you plan around. A player who can
   * see that the Moonlight Gu eats in two days can decide whether the detour to the
   * orchid bank is worth the day it costs — which is the decision the whole economy
   * exists to pose.
   */
  due(day: number, within = 4): { gu: string; days: number; has: boolean }[] {
    const rows: { gu: string; days: number; has: boolean }[] = [];
    if (!this.save.settings.guUpkeep) return rows;
    for (const state of this.carried()) {
      const canon = guById.get(state.id);
      if (!canon?.feedDays) continue;
      const days = state.fedOn + canon.feedDays - day;
      if (days > within) continue;
      rows.push({
        gu: state.id,
        days: Math.max(0, days),
        // Whether the diet is already in the bag decides whether this is a note or a
        // problem, so the strip says which.
        has: !canon.dietItem || (this.save.economy.items[canon.dietItem] ?? 0) > 0
      });
    }
    return rows.sort((a, b) => a.days - b.days);
  }

  carried(): GuState[] {
    return this.save.gu.filter((g) => !g.stored);
  }

  stored(): GuState[] {
    return this.save.gu.filter((g) => g.stored);
  }

  /**
   * Takes a Gu. Past the carrying limit it goes into reserve rather than being
   * refused: refusing it could lose a canonical Gu the story needs later.
   */
  acquire(guId: string, day: number): { stored: boolean } | null {
    if (this.save.gu.some((g) => g.id === guId)) return null;
    const full = this.carried().length >= this.capacity();
    this.save.gu.push({ id: guId, fedOn: day, sluggish: false, stored: full });
    if (full) {
      bus.emit('toast', {
        text: `${guById.get(guId)?.name ?? guId} goes into reserve — you can carry ${this.capacity()}.`
      });
    }
    return { stored: full };
  }

  /** Swaps a stored Gu in. Returns false when there is no room to carry it. */
  carry(guId: string): boolean {
    const state = this.save.gu.find((g) => g.id === guId);
    if (!state || !state.stored) return false;
    if (this.carried().length >= this.capacity()) return false;
    state.stored = false;
    // It has not been fed while it sat in reserve, so it is due now rather than
    // instantly sluggish: putting a Gu away and taking it out again is not a penalty.
    state.fedOn = this.save.calendar.day;
    bus.emit('gu.carry', { gu: guId, carried: true });
    return true;
  }

  /** Puts a carried Gu into reserve. The Spring Autumn Cicada never leaves him. */
  store(guId: string): boolean {
    if (guId === 'spring-autumn-cicada') return false;
    const state = this.save.gu.find((g) => g.id === guId);
    if (!state || state.stored) return false;
    state.stored = true;
    bus.emit('gu.carry', { gu: guId, carried: false });
    return true;
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
