/**
 * The primeval stone economy.
 *
 * Prices come from the source text wherever the text states one (the two stones
 * for Green Bamboo Wine, the three for the fossil); everything else is balanced
 * around those. The ledger page exists so the player does Fang Yuan's arithmetic
 * rather than watching a number go up.
 *
 * Canonical payments always succeed. If the player is short, `payCanonical`
 * records a debt and the game offers in-character ways to cover it. There is no
 * state in which a canonical outcome is blocked by a shortfall.
 */
import { bus } from '../core/bus';
import { itemsById } from '../../canon/index';
import type { SaveGameV5 } from '../save/schema';

const LINE_WINDOW = 120;

export interface ShortfallOffer {
  id: string;
  label: string;
  stones: number;
  /** Narrative cost: days, exposure, or a favour owed. */
  cost: string;
}

export class Economy {
  constructor(private save: SaveGameV5) {}

  get stones(): number {
    return this.save.economy.stones;
  }

  get items(): Readonly<Record<string, number>> {
    return this.save.economy.items;
  }

  priceOf(itemId: string): number | null {
    return itemsById.get(itemId)?.stones ?? null;
  }

  /** A normal transaction. Returns false and changes nothing if the player is short. */
  spend(amount: number, reason: string): boolean {
    if (amount <= 0) return true;
    if (this.save.economy.stones < amount) return false;
    this.record(-amount, reason);
    return true;
  }

  earn(amount: number, reason: string): void {
    if (amount > 0) this.record(amount, reason);
  }

  /**
   * A payment a canonical outcome depends on. It always goes through. A shortfall
   * becomes a negative balance the game then offers in-character ways to clear,
   * which is the only way to honour both "scarcity you can feel" and "no soft-lock".
   */
  payCanonical(amount: number, reason: string): { paid: number; shortfall: number } {
    const shortfall = Math.max(0, amount - this.save.economy.stones);
    this.record(-amount, reason);
    if (shortfall > 0) bus.emit('toast', { text: `Short by ${shortfall} stones. The clan will want that made up.` });
    return { paid: amount, shortfall };
  }

  /** In-character ways to cover a shortfall. Never a gift, always a trade. */
  shortfallOffers(shortfall: number, flags: ReadonlySet<string>): ShortfallOffer[] {
    const offers: ShortfallOffer[] = [
      { id: 'sell-stock', label: 'Sell what is in the room', stones: Math.ceil(shortfall * 0.6), cost: 'Inventory. Some of it you wanted.' }
    ];
    if (flags.has('econ.toll-income')) offers.push({ id: 'raise-toll', label: 'Raise the rate at the gate', stones: shortfall, cost: 'Two more days, and one more witness.' });
    if (flags.has('econ.leaf-income')) offers.push({ id: 'sell-leaves', label: 'Sell leaves early to Jiang Ya', stones: shortfall, cost: 'A cycle of leaves you may need for vitality.' });
    if (flags.has('econ.mission-pay')) offers.push({ id: 'take-mission', label: 'Take a clan mission', stones: shortfall, cost: 'Four days of calendar time.' });
    if (flags.has('econ.tavern-income')) offers.push({ id: 'draw-tavern', label: 'Draw against the tavern', stones: shortfall, cost: 'The wage bill comes due sooner.' });
    return offers;
  }

  addItem(itemId: string, count = 1): void {
    const current = this.save.economy.items[itemId] ?? 0;
    this.save.economy.items[itemId] = current + count;
  }

  consumeItem(itemId: string, count = 1): boolean {
    const current = this.save.economy.items[itemId] ?? 0;
    if (current < count) return false;
    this.save.economy.items[itemId] = current - count;
    return true;
  }

  buyItem(itemId: string, count = 1): boolean {
    const price = this.priceOf(itemId);
    if (price === null) return false;
    if (!this.spend(price * count, `Bought ${itemsById.get(itemId)?.name ?? itemId}`)) return false;
    this.addItem(itemId, count);
    return true;
  }

  private record(delta: number, reason: string): void {
    this.save.economy.stones += delta;
    this.save.economy.lines.push({ day: this.save.calendar.day, delta, reason, balance: this.save.economy.stones });
    while (this.save.economy.lines.length > LINE_WINDOW) {
      const dropped = this.save.economy.lines.shift();
      if (dropped) this.save.economy.carried += dropped.delta;
    }
    bus.emit('stones.change', { delta, balance: this.save.economy.stones, reason });
  }

  /** Income and expense by day, for the ledger page's running balance. */
  dailyTotals(): { day: number; income: number; expense: number; balance: number }[] {
    const byDay = new Map<number, { day: number; income: number; expense: number; balance: number }>();
    for (const line of this.save.economy.lines) {
      const row = byDay.get(line.day) ?? { day: line.day, income: 0, expense: 0, balance: line.balance };
      if (line.delta >= 0) row.income += line.delta;
      else row.expense += -line.delta;
      row.balance = line.balance;
      byDay.set(line.day, row);
    }
    return [...byDay.values()].sort((a, b) => a.day - b.day);
  }
}
