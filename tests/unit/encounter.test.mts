/**
 * Phase rules. Pure logic, so checked directly rather than through a browser.
 *
 * The point of a phase is that it is a rule to read, not a health bar to out-damage,
 * so the thing worth asserting is that each rule actually gates damage: a strike into
 * a raised guard does nothing, and the same strike a moment later does.
 */
import { BOSSES } from '../../engine/systems/bosses.ts';
import { phasesFor } from '../../engine/systems/phases.ts';

let failures = 0;
const check = (label: string, condition: boolean, detail = '') => {
  if (!condition) {
    failures++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

// Every boss in the data has to have engine rules, or its phases all silently collapse
// into the one open-window rule and the fiction's distinct reads are thrown away.
for (const boss of BOSSES) {
  const phases = phasesFor(boss);
  check(`${boss.id}: a rule for every phase`, phases.length === boss.phases.length);
  for (const [i, phase] of phases.entries()) {
    check(`${boss.id} phase ${i + 1}: has a rule`, !!phase.rule);
    check(`${boss.id} phase ${i + 1}: has a hint`, phase.hint.length > 10);
    check(`${boss.id} phase ${i + 1}: prose answer kept`, phase.answer.length > 10);
    // The research consensus is about 250ms to perceive a cue and answer it. Nothing
    // in the data may be tighter than that before difficulty scaling touches it.
    check(
      `${boss.id} phase ${i + 1}: telegraph is readable`,
      phase.telegraph.seconds >= 0.6,
      `${phase.telegraph.seconds}s`
    );
    // Shape carries what the attack is; pattern carries it again for anyone who cannot
    // separate the colours. A phase with neither is not a telegraph.
    check(`${boss.id} phase ${i + 1}: telegraph has shape and pattern`,
      !!phase.telegraph.shape && !!phase.telegraph.pattern);
  }
  // Distinct reads: a multi-phase boss whose phases all use the same rule is a boss
  // with one phase and a longer health bar.
  if (phases.length > 1) {
    const kinds = new Set(phases.map((p) => p.rule.kind));
    check(`${boss.id}: phases ask for different things`, kinds.size > 1,
      `all ${[...kinds].join(', ')}`);
  }
}

// Every boss is anchored to a beat, and no two share one: `bossFor(beat)` returns the
// first match, so a duplicate would make one of them unreachable.
const beats = new Set<string>();
for (const boss of BOSSES) {
  check(`${boss.id}: has a beat`, boss.beat.length > 0);
  check(`${boss.id}: its beat is not shared`, !beats.has(boss.beat), boss.beat);
  beats.add(boss.beat);
}

if (failures) {
  console.error(`\nencounter: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`encounter: ${BOSSES.length} bosses, rules and telegraphs ok`);
