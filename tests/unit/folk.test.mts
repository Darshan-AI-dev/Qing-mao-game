/**
 * The rules for who is standing where, and what they say next.
 *
 * Pure data and pure functions, so this runs in Node with no browser: the ordering rule
 * (newest thing first), the gates, and the person who leaves the world after a beat.
 */
import { FOLK } from '../../content/qingmao/world/folk.ts';
import { folkIn, linesFor, lineAt, nearestFolk, SPEAK_RANGE } from '../../engine/systems/folk.ts';

let failures = 0;
const check = (what: string, ok: boolean, detail = ''): void => {
  if (!ok) {
    failures++;
    console.error(`  FAIL ${what}${detail ? ` — ${detail}` : ''}`);
  }
};

const none = new Set<string>();
const village = FOLK.get('mountain.village') ?? [];
const household = FOLK.get('mountain.uncle-house') ?? [];

check('there are people in the world', FOLK.size >= 5 && village.length > 0);

// Everyone has something to say before anything has happened, or walking up to them at
// the start of the game is a dead end.
for (const [areaId, people] of FOLK) {
  for (const person of people) {
    // Two from the start, not one: a person who repeats themselves on the second press
    // is a sign with a name on it, and everybody had exactly one line to begin with.
    check(`${person.id} is worth pressing twice`, linesFor(person, none).length >= 2, `in ${areaId}`);
    check(
      `${person.id} does not repeat on a second press`,
      lineAt(person, none, 0) !== lineAt(person, none, 1),
      `in ${areaId}`
    );
  }
}

// Newest first. The uncle's pre-awakening line is withdrawn by `until`, so once the
// awakening is done he must not be opening with it.
const uncle = household.find((p) => p.id === 'fang-qiu')!;
const before = lineAt(uncle, none, 0) ?? '';
const after = lineAt(uncle, new Set(['act1.awakening.ceremony']), 0) ?? '';
check('the uncle opens with his pre-awakening line at the start', /safe/.test(before), before);
check('the uncle reacts to the awakening once it has happened', after !== before && /Forty-four/.test(after), after);

// Pressing again works back through the older lines rather than repeating one.
const completed = new Set(['act1.awakening.ceremony', 'act1.academy.first-gu']);
const eligible = linesFor(uncle, completed);
const heard = [0, 1, 2].map((n) => lineAt(uncle, completed, n));
check('a second press says something else', heard[0] !== heard[1], String(heard));
check('the newest line is offered first', heard[0] === eligible[0]?.text);
// One full turn through everything he has, then back to the top.
check('the cycle comes back round', lineAt(uncle, completed, eligible.length) === heard[0],
  `${eligible.length} eligible`);

// Nothing a later beat has withdrawn is ever offered again.
const withAwakening = linesFor(uncle, new Set(['act1.awakening.ceremony']));
check('a withdrawn line is gone for good', !withAwakening.some((l) => /safe/.test(l.text)));

// And somebody who dies is no longer standing in the village.
const jia = village.find((p) => p.id === 'jia-jin-sheng');
check('Jia Jin Sheng is in the village to begin with', !!jia);
check(
  'Jia Jin Sheng is not in the village after the night on the path',
  !folkIn(village, new Set(['act1.jia-jin-sheng.night'])).some((p) => p.id === 'jia-jin-sheng')
);
check(
  'everyone else is still there',
  folkIn(village, new Set(['act1.jia-jin-sheng.night'])).length === village.length - 1
);

// Reach. Standing on someone finds them; standing across the square does not.
const target = village[0]!;
check('someone at arm’s length is in reach', !!nearestFolk(village, none, { x: target.x, z: target.z }));
check(
  'someone across the square is not',
  nearestFolk(village, none, { x: target.x + SPEAK_RANGE + 2, z: target.z }) === null
);
// The nearest of two, not just the first in the list.
const crowd = nearestFolk(household, none, { x: household[1]!.x, z: household[1]!.z });
check('the nearest person is the one who answers', crowd?.person.id === household[1]!.id, crowd?.person.id);

// Nobody is gated on a beat in a way that leaves them mute at any point in the story.
const everyGate = new Set<string>();
for (const [, people] of FOLK) {
  for (const person of people) {
    for (const line of person.lines) {
      if (line.needs) everyGate.add(line.needs);
      if (line.until) everyGate.add(line.until);
    }
  }
}
for (const [areaId, people] of FOLK) {
  for (const person of people) {
    if (person.until && everyGate.has(person.until)) continue;
    check(
      `${person.id} still has something to say at the end`,
      linesFor(person, everyGate).length > 0,
      `in ${areaId}`
    );
  }
}

const people = [...FOLK.values()].flat();
if (failures > 0) {
  console.error(`folk: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`folk: ${people.length} people across ${FOLK.size} areas, lines and reach ok`);
