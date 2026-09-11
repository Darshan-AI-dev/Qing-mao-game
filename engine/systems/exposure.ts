/**
 * Exposure and evidence.
 *
 * Actions in the relevant arcs leave evidence in the world: witnesses, traces,
 * records and inconsistencies. Cleanup removes or disguises it at a cost in time,
 * essence or stones.
 *
 * Two payoffs read the result: Jia Fu's inquiry (ch 51-59) and Tie Ruo Nan's
 * investigation (ch 170-181). A clean trail gives calmer dialogue and cheaper
 * resolutions; a messy one forces lies, bribes and spending.
 *
 * As in canon, Fang Yuan is never caught. Heat changes the texture and the price
 * of those two scenes and nothing else. Tie Ruo Nan's mistaken theory still
 * happens; the player's trail decides whether it reads as a near miss they earned.
 */
import { bus } from '../core/bus';
import type { SaveGameV5 } from '../save/schema';

export interface EvidenceDefinition {
  id: string;
  secret: string;
  /** What the investigator sees if it is still there. */
  describe: string;
  /** How much this single item adds to the investigator's heat, 0..1. */
  weight: number;
  cleanup: { label: string; stones?: number; days?: number; essence?: number; note: string }[];
  /** Some evidence cannot be removed, only contradicted with a second story. */
  permanent?: boolean;
}

export const EVIDENCE: readonly EvidenceDefinition[] = [
  { id: 'cave.entry-traces', secret: 'secret.liquor-worm-origin', describe: 'Crushed bamboo at a crevice mouth and one print in wet clay.', weight: 0.05,
    cleanup: [{ label: 'Brush the approach and reset the bamboo', days: 1, note: 'An evening, and the mouth looks like weather did it.' }] },
  { id: 'toll.witnesses', secret: 'secret.extortion', describe: 'Four students who can place him at the gate after class.', weight: 0.08,
    cleanup: [{ label: 'Pay two of them to forget the hour', stones: 6, note: 'Cheap, and they remember being paid.' },
              { label: 'Move the collection off the gate', days: 3, note: 'Slower income for a week, no new witnesses.' }] },
  { id: 'toll.ledger-gap', secret: 'secret.extortion', describe: 'An allowance that stops balancing in the Mo household books.', weight: 0.06,
    cleanup: [{ label: 'Take payment in goods instead of stones', days: 2, note: 'Harder to trace, worth less.' }] },
  { id: 'toll.elder-report', secret: 'secret.extortion', describe: 'A note in Elder Mo Chen\'s hand, filed rather than acted on.', weight: 0.1, permanent: true,
    cleanup: [{ label: 'Give the elder a smaller truth to file instead', days: 2, essence: 0, note: 'The note stays. What it says changes.' }] },
  { id: 'servant.body', secret: 'secret.mo-servant', describe: 'A servant who did not come home from the bamboo path.', weight: 0.12,
    cleanup: [{ label: 'Move it off the path before first light', days: 1, essence: 8, note: 'Exhausting, and it works.' }] },
  { id: 'servant.livery', secret: 'secret.mo-servant', describe: 'Household livery with the Mo mark on it.', weight: 0.07,
    cleanup: [{ label: 'Burn it somewhere ordinary', days: 1, note: 'Ash is not evidence.' }] },
  { id: 'servant.witness', secret: 'secret.mo-servant', describe: 'A carter who passed the junction four minutes too early.', weight: 0.09,
    cleanup: [{ label: 'Pay him for a poorer memory', stones: 4, note: 'He keeps the money and the outline.' },
              { label: 'Let him keep a version that names nobody', days: 2, note: 'Slower, and it holds up better.' }] },
  { id: 'jjs.trail', secret: 'secret.jjs', describe: 'Two sets of prints up the high path and only one coming down.', weight: 0.12,
    cleanup: [{ label: 'Walk the path again in daylight, twice', days: 2, note: 'Traffic is the best disguise for traffic.' }] },
  { id: 'jjs.witness', secret: 'secret.jjs', describe: 'A villager who saw Jia Jin Sheng leave after dark.', weight: 0.11,
    cleanup: [{ label: 'Be seen in the village that same evening', days: 1, note: 'An alibi built from being boring.' },
              { label: 'Pay for a vaguer recollection', stones: 5, note: 'Money remembers itself.' }] },
  { id: 'jjs.gu-residue', secret: 'secret.jjs', describe: 'Residue from a Gu nobody has seen him use.', weight: 0.14,
    cleanup: [{ label: 'Wait out the residue on the ridge', days: 4, note: 'Four days of calendar time and it is gone.' },
              { label: 'Spend essence to scatter it now', essence: 16, note: 'Immediate, and it costs a day of cultivation.' }] },
  { id: 'jjs.missing-report', secret: 'secret.jjs', describe: 'A filed missing-person report with dates in it.', weight: 0.08, permanent: true,
    cleanup: [{ label: 'Make sure the dates are right', days: 1, note: 'A correct record is easier to live beside than a wrong one.' }] },
  { id: 'map.owner-missing', secret: 'secret.hunter-map', describe: 'A hunter who has stopped walking his circuit.', weight: 0.1,
    cleanup: [{ label: 'Leave the hideout exactly as found', days: 1, note: 'If nobody knows the map moved, the map keeps working.' }] },
  { id: 'map.copy-mismatch', secret: 'secret.hunter-map', describe: 'Circles on his map that the clan\'s copies do not have.', weight: 0.05,
    cleanup: [{ label: 'Redraw a copy with the circles removed', days: 2, note: 'Carry the safe copy, hide the real one.' }] },
  { id: 'rank2.essence-colour', secret: 'secret.rank-two', describe: 'Red-steel essence in a student the records have at Rank one.', weight: 0.15, permanent: true,
    cleanup: [{ label: 'Fight below your rank in public, consistently', days: 3, essence: 12, note: 'Expensive and it never fully closes.' }] },
  { id: 'rank2.absence', secret: 'secret.rank-two', describe: 'Ten evenings at Jiang He\'s place that nobody can account for.', weight: 0.09,
    cleanup: [{ label: 'Give the evenings a dull explanation', stones: 3, days: 1, note: 'Jiang He is incurious, and he is also for sale.' }] },
  { id: 'yaole.absence', secret: 'secret.yao-le', describe: 'A girl who went into the forest and did not come out of it.', weight: 0.18, permanent: true,
    cleanup: [{ label: 'Join the search and be useful in it', days: 4, note: 'The absence stays. His place in it changes.' }] },
  { id: 'yaole.last-seen', secret: 'secret.yao-le', describe: 'Two people who can date the afternoon past the second ridge.', weight: 0.13,
    cleanup: [{ label: 'Pay the carter, again', stones: 6, note: 'The same man, the same price, a worse memory.' },
              { label: 'Put yourself somewhere else that afternoon', days: 3, note: 'Three days of building a different afternoon.' }] },
  { id: 'yaole.ritual-site', secret: 'secret.yao-le', describe: 'Ground past the second ridge that does not match the rest of the forest.', weight: 0.16,
    cleanup: [{ label: 'Let the season cover it', days: 8, note: 'Rain does what essence cannot.' },
              { label: 'Work the ground yourself', essence: 24, days: 2, note: 'Faster, and it leaves him visibly tired.' }] },
  { id: 'search.inconsistency', secret: 'secret.yao-le', describe: 'Two accounts of his own movements that do not quite agree.', weight: 0.12,
    cleanup: [{ label: 'Settle on one account and never improve it', days: 1, note: 'The strongest version is the one he stops editing.' }] }
];

const BY_ID = new Map(EVIDENCE.map((e) => [e.id, e]));

/** Which secrets each investigator actually pursues. */
export const INVESTIGATOR_SCOPE: Record<string, string[]> = {
  'jia-fu': ['secret.jjs', 'secret.liquor-worm-origin', 'secret.mo-servant'],
  'tie-ruo-nan': ['secret.jjs', 'secret.mo-servant', 'secret.hunter-map', 'secret.rank-two', 'secret.yao-le', 'secret.extortion']
};

export class Exposure {
  constructor(private save: SaveGameV5) {}

  static definition(id: string): EvidenceDefinition | undefined {
    return BY_ID.get(id);
  }

  add(id: string): void {
    const def = BY_ID.get(id);
    if (!def || this.save.exposure.evidence.includes(id)) return;
    this.save.exposure.evidence.push(id);
    bus.emit('evidence.add', { id, secret: def.secret });
    this.recompute();
  }

  /** Marks a piece cleaned. Permanent evidence stays listed but stops counting fully. */
  clear(id: string, paidIn: 'stones' | 'days' | 'essence', cost: number): void {
    const def = BY_ID.get(id);
    if (!def) return;
    if (!this.save.exposure.cleaned.includes(id)) this.save.exposure.cleaned.push(id);
    if (!def.permanent) {
      const index = this.save.exposure.evidence.indexOf(id);
      if (index >= 0) this.save.exposure.evidence.splice(index, 1);
    }
    bus.emit('evidence.clear', { id, cost, paidIn });
    this.recompute();
  }

  open(): readonly string[] {
    return this.save.exposure.evidence;
  }

  openFor(investigator: string): EvidenceDefinition[] {
    const scope = INVESTIGATOR_SCOPE[investigator] ?? [];
    return this.save.exposure.evidence
      .map((id) => BY_ID.get(id))
      .filter((def): def is EvidenceDefinition => !!def && scope.includes(def.secret));
  }

  /** 0..1. Drives dialogue tone and resolution price, never a "caught" outcome. */
  heat(investigator: string): number {
    return this.save.exposure.heat[investigator] ?? 0;
  }

  private recompute(): void {
    for (const investigator of Object.keys(INVESTIGATOR_SCOPE)) {
      let total = 0;
      for (const def of this.openFor(investigator)) {
        total += this.save.exposure.cleaned.includes(def.id) ? def.weight * 0.35 : def.weight;
      }
      const value = Math.min(1, Math.round(total * 100) / 100);
      this.save.exposure.heat[investigator] = value;
      bus.emit('exposure.change', { investigator, value });
    }
  }

  /**
   * How an investigation scene should be played. The outcome is always the same;
   * `tone`, `price` and `lies` are the only things the trail moves.
   */
  investigationShape(investigator: string): { tone: 'calm' | 'pressing' | 'tense'; price: number; lies: number; opensWith: string | null } {
    const heat = this.heat(investigator);
    const open = this.openFor(investigator);
    const heaviest = [...open].sort((a, b) => b.weight - a.weight)[0];
    const tone = heat < 0.25 ? 'calm' : heat < 0.6 ? 'pressing' : 'tense';
    return {
      tone,
      price: Math.round(heat * 40),
      lies: Math.min(4, open.length),
      opensWith: heaviest?.describe ?? null
    };
  }
}
