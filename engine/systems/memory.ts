/**
 * "Five hundred years": memory as a mechanic.
 *
 * A Recollection is a hazy vignette that points at an opportunity — a wine-loving
 * Gu lives on this mountain — without placing a waypoint. The player still has to
 * find it.
 *
 * A reader who acts on what they already know, before calling the memory up, earns
 * a Foresight recognition. Newcomers can call a memory up whenever they like at no
 * cost. Some recollections are deliberately incomplete: his foresight is an
 * advantage, not a script.
 *
 * The one canonical rewind (ch 195-196) is a fixed event and is not routed through
 * this system, but it belongs to the same theme and the UI presents it that way.
 */
import { bus } from '../core/bus';
import type { BeatGraph } from '../core/beats';
import type { SaveGameV5 } from '../save/schema';

export interface Recollection {
  beat: string;
  text: string;
  /** What a reader could act on without being told. */
  foresight: string | null;
  /** Deliberately incomplete memories say so, so the player does not feel cheated. */
  partial: boolean;
}

/** Memories the text itself leaves him unsure about. */
const PARTIAL_BEATS = new Set([
  'act1.liquor-worm.search',
  'act2.hunter.map',
  'act4.investigation.arrival',
  'act4.deep-inheritance.founder'
]);

export class Memory {
  constructor(private save: SaveGameV5, private graph: BeatGraph) {}

  available(beatId: string): Recollection | null {
    const beat = this.graph.get(beatId);
    if (!beat?.recollection) return null;
    return {
      beat: beatId,
      text: beat.recollection,
      foresight: beat.foresight,
      partial: PARTIAL_BEATS.has(beatId)
    };
  }

  /** Offer, not a prompt: the HUD shows a quiet affordance and never interrupts. */
  offer(beatId: string): void {
    if (this.available(beatId) && !this.save.reader.recollectionsViewed.includes(beatId)) {
      bus.emit('recollection.offer', { beat: beatId });
    }
  }

  view(beatId: string): Recollection | null {
    const recollection = this.available(beatId);
    if (!recollection) return null;
    if (!this.save.reader.recollectionsViewed.includes(beatId)) this.save.reader.recollectionsViewed.push(beatId);
    bus.emit('recollection.view', { beat: beatId });
    return recollection;
  }

  viewed(beatId: string): boolean {
    return this.save.reader.recollectionsViewed.includes(beatId);
  }

  /**
   * Called when the player does the thing before asking for the memory. The only
   * reward is recognition — it never unlocks content a newcomer cannot reach.
   */
  recogniseForesight(beatId: string): boolean {
    if (this.viewed(beatId)) return false;
    const beat = this.graph.get(beatId);
    if (!beat?.foresight) return false;
    this.save.reader.foresight += 1;
    bus.emit('foresight.recognise', { beat: beatId, total: this.save.reader.foresight });
    bus.emit('toast', { text: 'Foresight. You were already there.' });
    return true;
  }

  get foresightCount(): number {
    return this.save.reader.foresight;
  }

  /** New Game+ can turn Recollections off entirely as a challenge. */
  get enabled(): boolean {
    return this.save.beatState['ngplus']?.noRecollections !== true;
  }
}
