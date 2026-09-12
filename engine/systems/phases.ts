/**
 * Phase rules: what actually gets through each boss phase's defence.
 *
 * Its own module, for the same reason `core/movement.ts` is: this is the part that is
 * hard to see wrong by reading and obvious when it is checked, so it is kept pure and
 * unit-tested. The runtime that drives a fight lives in encounter.ts.
 *
 * Each rule is one sentence of the source text made mechanical:
 *
 *   - `window`   strike in the gap after its guard drops, not into the guard
 *   - `close`    it can only raise the second layer at range, so be inside it
 *   - `place`    it retreats to the same ground every time; be standing there
 *   - `conceal`  the screen has to pass over you, not be fought
 *   - `vary`     the ice mirrors your last opening, so do not repeat it
 */
import type { BossDefinition, BossPhase } from './bosses';

/** How a phase's defence is beaten, derived from the phase's prose answer. */
export type PhaseRule =
  | { kind: 'window' }
  | { kind: 'close'; within: number }
  | { kind: 'place'; x: number; z: number; radius: number }
  | { kind: 'conceal' }
  | { kind: 'vary' };

export interface EncounterPhase extends BossPhase {
  rule: PhaseRule;
  /** What the player is being asked to read. Shown only once they have earned it. */
  hint: string;
}

/**
 * The rules, keyed by boss and phase index.
 *
 * They are written here rather than in the boss data because they are engine
 * behaviour, while the data is the fiction. The two are checked against each other by
 * the content lint: every phase needs a rule.
 */
const RULES: Record<string, PhaseRule[]> = {
  'fang-zheng': [
    { kind: 'window' },
    { kind: 'close', within: 4.5 },
    { kind: 'place', x: -26, z: -26, radius: 7 }
  ],
  'monkey-king': [{ kind: 'window' }, { kind: 'close', within: 6 }],
  'boar-king': [{ kind: 'window' }, { kind: 'close', within: 5 }],
  'thunder-crown-wolf': [{ kind: 'conceal' }, { kind: 'place', x: 0, z: -18, radius: 8 }],
  'bai-ning-bing': [{ kind: 'vary' }],
  // The prologue. Eight of them, and he is a Rank eight with one exit: the fight is
  // the tutorial, so the rules are the two simplest ones in the game.
  'prologue-eight': [{ kind: 'window' }, { kind: 'close', within: 5 }]
};

const HINTS: Record<PhaseRule['kind'], string> = {
  window: 'Strike in the gap after its guard drops.',
  close: 'Get inside its reach; it cannot raise that at range.',
  place: 'It comes back to the same ground every time. Be there first.',
  conceal: 'Do not fight the screen. Let it pass over you.',
  vary: 'It answers whatever you last opened with. Change the opening.'
};

export function phasesFor(boss: BossDefinition): EncounterPhase[] {
  const rules = RULES[boss.id] ?? boss.phases.map((): PhaseRule => ({ kind: 'window' }));
  return boss.phases.map((phase, i) => {
    const rule = rules[i] ?? { kind: 'window' };
    return { ...phase, rule, hint: HINTS[rule.kind] };
  });
}
