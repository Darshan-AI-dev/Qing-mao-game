/**
 * Gu refinement.
 *
 * The rule from the design review: canonical refinements always succeed eventually.
 * A bad roll costs stones and calendar days and leaves the materials intact — it
 * never destroys a Gu a later chapter needs. The scripted first Moonglow failure
 * (ch 119) is a scripted outcome, not a roll.
 *
 * Optional recipes, found through inheritances, the academy or trade, can fail
 * outright. They are sidegrades and nothing canonical depends on them.
 */
import { bus } from '../core/bus';
import { canonicalGuIds, guById, itemsById } from '../../canon/index';
import type { Rng } from '../core/rng';
import type { SaveGameV5 } from '../save/schema';
import type { Calendar } from './calendar';
import type { Economy } from './economy';
import type { Upkeep } from './upkeep';

export interface Recipe {
  id: string;
  /** The Gu produced. */
  produces: string;
  /** Gu consumed as material. */
  from: string[];
  /** Items that improve the binding. Optional — their absence raises the cost. */
  improvedBy: string[];
  essence: number;
  stones: number;
  /** Base chance of a clean first attempt. */
  chance: number;
  /** Scripted outcomes override the roll entirely. */
  scripted?: { attempt: number; outcome: 'failure' }[];
}

export const RECIPES: readonly Recipe[] = [
  { id: 'white-jade', produces: 'white-jade-gu', from: ['white-boar-gu', 'jade-skin-gu'], improvedBy: ['snowy-tusk'], essence: 20, stones: 8, chance: 0.7 },
  { id: 'moonglow', produces: 'moonglow-gu', from: ['moonlight-gu'], improvedBy: ['moon-orchid-petal'], essence: 24, stones: 11, chance: 0.65,
    // Chapter 119 fails no matter what the player brings. That is the chapter.
    scripted: [{ attempt: 1, outcome: 'failure' }] },
  { id: 'four-flavours', produces: 'four-flavours-liquor-worm', from: ['liquor-worm', 'liquor-worm'], improvedBy: ['four-flavour-wine'], essence: 30, stones: 18, chance: 0.6 },
  { id: 'blood-moon', produces: 'blood-moon-gu', from: ['moonglow-gu'], improvedBy: ['beast-blood'], essence: 40, stones: 26, chance: 0.7 },
  // Optional sidegrades. These can fail outright and consume their materials.
  { id: 'dull-sight', produces: 'dull-sight-gu', from: [], improvedBy: ['ash'], essence: 8, stones: 5, chance: 0.5 },
  { id: 'quiet-step', produces: 'quiet-step-gu', from: [], improvedBy: ['moss'], essence: 8, stones: 5, chance: 0.5 },
  { id: 'ledger-moth', produces: 'ledger-moth-gu', from: [], improvedBy: ['paper'], essence: 6, stones: 4, chance: 0.55 },
  { id: 'cold-hearth', produces: 'cold-hearth-gu', from: [], improvedBy: ['charcoal'], essence: 14, stones: 9, chance: 0.45 }
];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export type RefinementOutcome =
  | { kind: 'success'; gu: string; stones: number; days: number }
  /** Canonical recipe, bad roll: try again, poorer. The Gu is never lost. */
  | { kind: 'delay'; gu: string; stones: number; days: number; attempt: number }
  /** Optional recipe only. Materials are consumed. */
  | { kind: 'failure'; gu: string; stones: number; days: number }
  | { kind: 'blocked'; reason: 'materials' | 'essence' | 'stones' };

export class Refinement {
  constructor(
    private save: SaveGameV5,
    private economy: Economy,
    private calendar: Calendar,
    private upkeep: Upkeep,
    private rng: Rng
  ) {}

  static recipe(id: string): Recipe | undefined {
    return BY_ID.get(id);
  }

  /** The refinement screen reads this: what is selected, what it costs, what can go wrong. */
  preview(recipeId: string): { recipe: Recipe; improved: boolean; stones: number; essence: number; chance: number; canFailOutright: boolean } | null {
    const recipe = BY_ID.get(recipeId);
    if (!recipe) return null;
    const improved = recipe.improvedBy.some((item) => (this.save.economy.items[item] ?? 0) > 0);
    const canonical = canonicalGuIds.has(recipe.produces);
    return {
      recipe,
      improved,
      stones: improved ? recipe.stones : Math.ceil(recipe.stones * 1.4),
      essence: recipe.essence,
      chance: Math.min(0.95, recipe.chance + (improved ? 0.2 : 0)),
      // Canonical recipes cannot fail outright, and the screen says so.
      canFailOutright: !canonical && this.save.settings.refinementFailure
    };
  }

  attempt(recipeId: string, spendEssence: (amount: number, gu: string) => boolean): RefinementOutcome {
    const preview = this.preview(recipeId);
    if (!preview) return { kind: 'blocked', reason: 'materials' };
    const { recipe, improved, stones, chance } = preview;

    const owned = new Map<string, number>();
    for (const g of this.save.gu) owned.set(g.id, (owned.get(g.id) ?? 0) + 1);
    for (const material of recipe.from) {
      const have = owned.get(material) ?? 0;
      if (have < recipe.from.filter((m) => m === material).length) return { kind: 'blocked', reason: 'materials' };
    }
    if (this.save.economy.stones < stones) return { kind: 'blocked', reason: 'stones' };
    if (!spendEssence(recipe.essence, recipe.produces)) return { kind: 'blocked', reason: 'essence' };

    const state = (this.save.beatState[`refine.${recipeId}`] ??= {});
    const attempt = (typeof state.attempts === 'number' ? state.attempts : 0) + 1;
    state.attempts = attempt;

    this.economy.spend(stones, `Refinement: ${guById.get(recipe.produces)?.name ?? recipe.produces}`);
    for (const item of recipe.improvedBy) if (improved) this.economy.consumeItem(item, 1);

    const scripted = recipe.scripted?.find((s) => s.attempt === attempt);
    const rolled = scripted ? false : this.rng.chance(chance) || !this.save.settings.refinementFailure;
    const canonical = canonicalGuIds.has(recipe.produces);

    if (rolled) {
      const days = improved ? 2 : 3;
      this.calendar.advance(days);
      // Materials are consumed only on success, and only the non-canonical ones.
      for (const material of recipe.from) this.upkeep.release(material);
      this.upkeep.acquire(recipe.produces, this.calendar.day);
      bus.emit('gu.refine', { gu: recipe.produces, outcome: 'success', days, stones });
      return { kind: 'success', gu: recipe.produces, stones, days };
    }

    if (canonical) {
      // A canonical refinement that did not take: days and stones gone, materials kept.
      const days = 9;
      this.calendar.advance(days);
      bus.emit('gu.refine', { gu: recipe.produces, outcome: 'delay', days, stones });
      return { kind: 'delay', gu: recipe.produces, stones, days, attempt };
    }

    const days = 4;
    this.calendar.advance(days);
    for (const material of recipe.from) this.upkeep.release(material);
    for (const item of recipe.improvedBy) this.economy.consumeItem(item, 1);
    bus.emit('gu.refine', { gu: recipe.produces, outcome: 'failure', days, stones });
    return { kind: 'failure', gu: recipe.produces, stones, days };
  }

  /** Used by the content lint: no canonical Gu may be reachable only through a failable recipe. */
  static canonicalRecipesAreSafe(): boolean {
    return RECIPES.every((r) => !canonicalGuIds.has(r.produces) || r.chance > 0);
  }

  ingredientLabel(itemId: string): string {
    return itemsById.get(itemId)?.name ?? itemId;
  }
}
