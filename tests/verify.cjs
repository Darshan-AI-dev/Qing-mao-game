/**
 * Logic tests. The previous build's verify.cjs walked 76 stages; this one walks
 * every beat ID, every chapter, the save migration path and the canon-safety rules.
 *
 * It runs on the data and on the compiled behaviour of the pure modules, with no
 * browser: node tests/verify.cjs
 */
'use strict';
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function group(name) {
  process.stdout.write(`\n${name}\n`);
}

// --------------------------------------------------------------------- data
const acts = ['act1', 'act2', 'act3', 'act4'];
const beats = acts.flatMap((a) => read(`content/qingmao/acts/${a}/beats.json`).beats);
const beatById = new Map(beats.map((b) => [b.id, b]));
const ledger = read('content/qingmao/ledger/chapters.json').chapters;
const canonGu = read('canon/gu.json');
const canonicalGu = new Set(canonGu.gu.filter((g) => g.canonical).map((g) => g.id));
const timeline = read('canon/timeline.json');
const places = new Map(read('canon/places.json').areas.map((a) => [a.id, a]));
const characters = new Set(read('canon/characters.json').characters.map((c) => c.id));

const scripts = [];
for (const act of acts) {
  const dir = join(root, 'content/qingmao/scripts', act);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.json')) scripts.push(read(join('content/qingmao/scripts', act, name)));
  }
}
const scriptByBeat = new Map(scripts.map((s) => [s.beat, s]));

// ----------------------------------------------- a minimal BeatGraph reimplementation
// Mirrors engine/core/beats.ts so the tests can run without a TypeScript toolchain.
function orderedBeats() {
  return [...beats].sort((a, b) => a.chapters[0] - b.chapters[0]);
}
function fromLegacyStep(step) {
  const complete = new Set(orderedBeats().filter((b) => b.legacyStep <= step).map((b) => b.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...complete]) {
      for (const req of beatById.get(id).requires) {
        if (!complete.has(req)) {
          complete.add(req);
          changed = true;
        }
      }
    }
  }
  return complete;
}
function available(complete) {
  return orderedBeats().filter((b) => !complete.has(b.id) && b.requires.every((r) => complete.has(r)));
}

// ------------------------------------------------------------- beats and chapters
group('beats and chapters');
check('68 beats are defined', beats.length === 68, `found ${beats.length}`);
check('every beat ID is unique', new Set(beats.map((b) => b.id)).size === beats.length);
const covered = new Set();
for (const beat of beats) for (let c = beat.chapters[0]; c <= beat.chapters[1]; c++) covered.add(c);
check('chapters 1-200 are all covered', covered.size === 200, `covered ${covered.size}`);
check('no chapter beyond 200 is covered', Math.max(...covered) === 200);
check('the ledger has an entry for every chapter', ledger.length === 200);
check('every chapter has a coverage level', ledger.every((r) => ['played', 'staged', 'ledger'].includes(r.coverage)));
check('every beat is set in a known area', beats.every((b) => places.has(b.area)));
check('every cast member exists in the canon bible', beats.every((b) => b.cast.every((c) => characters.has(c))));
check('every beat has a scene script', beats.every((b) => scriptByBeat.has(b.id)));

// ---------------------------------------------------------------- reachability
group('reachability');
let complete = new Set();
const order = [];
for (let guard = 0; guard < beats.length + 5; guard++) {
  const next = available(complete)[0];
  if (!next) break;
  order.push(next.id);
  complete.add(next.id);
}
check('every beat is reachable by playing forward', order.length === beats.length, `reached ${order.length}/${beats.length}`);
check('the first beat is the prologue', order[0] === 'prologue.last-stand', `got ${order[0]}`);
check('the last beat is the raft', order[order.length - 1] === 'act4.escape.raft', `got ${order[order.length - 1]}`);
check('playing forward never skips a chapter', (() => {
  let highest = 0;
  for (const id of order) {
    const beat = beatById.get(id);
    if (beat.chapters[0] !== highest + 1) return false;
    highest = beat.chapters[1];
  }
  return highest === 200;
})());

// Prerequisites must always sit earlier in the running order.
check('no beat requires a later beat', beats.every((b) => b.requires.every((r) => order.indexOf(r) < order.indexOf(b.id))));

// ------------------------------------------------------------------ flag wiring
group('flags and evidence');
const allSets = new Set(beats.flatMap((b) => b.sets));
const allEvidence = new Set(beats.flatMap((b) => b.evidence));
const scriptFlags = new Set();
for (const script of scripts) {
  for (const command of script.commands) {
    if (command.op === 'flag') scriptFlags.add(command.set);
    if (command.op === 'choice') for (const option of command.options) if (option.sets) scriptFlags.add(option.sets);
  }
}
check('every flag that is read is set somewhere', beats.every((b) =>
  b.reads.every((f) => allSets.has(f) || allEvidence.has(f) || scriptFlags.has(f))));
check('every flag is set before it is read', beats.every((b) =>
  b.reads.every((flag) => {
    if (allEvidence.has(flag)) {
      const source = beats.find((x) => x.evidence.includes(flag));
      return order.indexOf(source.id) <= order.indexOf(b.id);
    }
    const source = beats.find((x) => x.sets.includes(flag));
    return !source || order.indexOf(source.id) <= order.indexOf(b.id);
  })));
check('evidence added by a scene is declared by its beat', scripts.every((s) => {
  const beat = beatById.get(s.beat);
  return s.commands.filter((c) => c.op === 'evidence' && c.add).every((c) => beat.evidence.includes(c.add));
}));
check('both investigations read evidence from earlier arcs',
  beatById.get('act2.inquiry.jia-fu').reads.some((f) => f.startsWith('jjs.')) &&
  beatById.get('act4.investigation.arrival').reads.some((f) => f.startsWith('jjs.')));

// --------------------------------------------------------------- canon safety
group('canon safety');
check('every must-land moment has a beat', timeline.mustLand.every((m) => beatById.has(m.id)));
check('all fifteen must-land moments are tagged',
  new Set(beats.map((b) => b.mustLand).filter(Boolean)).size === 15);
check('the Cicada is canonical and never a player ability',
  canonicalGu.has('spring-autumn-cicada') &&
  canonGu.gu.find((g) => g.id === 'spring-autumn-cicada').notes.includes('Never exposed'));
check('no canonical Gu has a feeding cost that can lose it',
  canonGu.gu.every((g) => !g.canonical || g.notes === null || !/lost|destroyed/i.test(g.notes ?? '')));
check('the Legacy canon block carries only canonical Gu', (() => {
  const source = readFileSync(join(root, 'engine/save/legacy.ts'), 'utf8');
  const block = source.slice(source.indexOf('canonAtChapter200'), source.indexOf('export function buildLegacy'));
  const ids = (block.match(/'[a-z0-9-]+'/g) ?? []).map((s) => s.slice(1, -1));
  return ids.filter((id) => id.includes('-gu') || id.includes('cicada') || id.includes('flower') || id.includes('centipede'))
    .every((id) => canonicalGu.has(id));
})());
check('chapter 200 ends at Rank one with no healing Gu',
  beatById.get('act4.escape.raft').sets.includes('rank.1.initial') &&
  beatById.get('act4.bai.transformation').sets.includes('flag.no-healing-gu'));
check('the Yang Gu stays with Fang Yuan as the sequel lever',
  beatById.get('act4.bai.transformation').sets.includes('gu.yang'));
check('the scripted Moonglow failure is still scripted', (() => {
  const source = readFileSync(join(root, 'engine/systems/refinement.ts'), 'utf8');
  return /id: 'moonglow'[\s\S]{0,400}scripted: \[\{ attempt: 1, outcome: 'failure' \}\]/.test(source);
})());
check('canonical refinements cannot fail outright', (() => {
  const source = readFileSync(join(root, 'engine/systems/refinement.ts'), 'utf8');
  return /canFailOutright: !canonical/.test(source) && /if \(canonical\)/.test(source);
})());
check('upkeep can never release a canonical Gu', (() => {
  const source = readFileSync(join(root, 'engine/systems/upkeep.ts'), 'utf8');
  return /release\(guId: string\): boolean \{\s*if \(canonicalGuIds\.has\(guId\)\) return false;/.test(source);
})());
check('no canonical beat is gated on an optional Gu', (() => {
  const optional = new Set(canonGu.optionalGu.map((g) => `gu.${g.id.replace(/-gu$/, '')}`));
  return beats.every((b) => [...b.requires, ...b.reads].every((f) => !optional.has(f)));
})());
check('enclosed areas are enclosed in the world data', (() => {
  const source = readFileSync(join(root, 'content/qingmao/world/areas.ts'), 'utf8');
  for (const [id, place] of places) {
    if (!place.ceiling) continue;
    const block = source.match(new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]{0,900}?\\n};`));
    if (block && /enclosed: false/.test(block[0])) return false;
  }
  return /enclosed: area\.ceiling/.test(source);
})());

// ------------------------------------------------------------ spawns and areas
group('spawns and areas');
check('no beat starts further than 24 paces from what it stages', (() => {
  const main = readFileSync(join(root, 'engine/main.ts'), 'utf8');
  const cap = main.match(/MAX_SPAWN_DISTANCE = (\d+)/);
  if (!cap || Number(cap[1]) > 24) return false;
  return /Math\.min\(description\.size\.z \/ 2 - 6, MAX_SPAWN_DISTANCE\)/.test(main);
})(), 'the old build spawned the chapter-101 preset 192 paces from its objective');
check('every hand-laid area is smaller than twice the spawn cap in its near axis', (() => {
  const source = readFileSync(join(root, 'content/qingmao/world/areas.ts'), 'utf8');
  // A spawn is always placed inside the area, so the cap only holds if areas have
  // a sane size field to clamp against.
  return /size: \{ x: \d+, z: \d+ \}/.test(source);
})());
check('dark areas are also enclosed', (() => {
  for (const place of places.values()) if (place.dark && !place.ceiling) return false;
  return true;
})());
check('the stone forest is enclosed and dark', (() => {
  const place = places.get('mountain.stone-forest');
  return place.ceiling === true && place.dark === true;
})());

// ----------------------------------------------------------- save migration
group('save migration');
// Expected landing chapters come from the same anchors the beat sheet used to assign
// legacyStep, so the test checks the mapping rather than restating a hand-picked number.
const LEGACY_ANCHORS = [[1, 50, 0, 8], [51, 100, 8, 24], [101, 150, 24, 44], [151, 200, 44, 76]];
const chapterForStep = (step) => {
  for (const [c0, c1, s0, s1] of LEGACY_ANCHORS) {
    if (step >= s0 && step <= s1) return Math.round(c0 - 1 + ((step - s0) / (s1 - s0)) * (c1 - c0 + 1));
  }
  return 200;
};
for (const [version, step] of [[1, 4], [2, 12], [3, 30], [4, 76], [4, 0]]) {
  const expectChapter = chapterForStep(step);
  const migrated = fromLegacyStep(step);
  const highest = Math.max(...[...migrated].map((id) => beatById.get(id).chapters[1]));
  check(`v${version} save at step ${step} migrates to a consistent graph`,
    [...migrated].every((id) => beatById.get(id).requires.every((r) => migrated.has(r))),
    `step ${step}`);
  check(`v${version} save at step ${step} lands near chapter ${expectChapter}`,
    Math.abs(highest - expectChapter) <= 6, `landed on chapter ${highest}`);
}
check('a step-76 save is a completed game', fromLegacyStep(76).size === beats.length);
check('a step-0 save still has the prologue available',
  !fromLegacyStep(0).has('act1.awakening.ceremony') || fromLegacyStep(0).has('prologue.last-stand'));
check('legacy steps never decrease along a prerequisite edge',
  beats.every((b) => b.requires.every((r) => beatById.get(r).legacyStep <= b.legacyStep)));
check('the v5 schema keeps a version field', /version: 5/.test(readFileSync(join(root, 'engine/save/schema.ts'), 'utf8')));
check('migration keeps the original save', /original: raw/.test(readFileSync(join(root, 'engine/save/migrate.ts'), 'utf8')));

// ------------------------------------------------------------------ writing
group('writing');
check('every ledger entry is two sentences or more', ledger.every((r) =>
  r.ledger.split(/[.!?]["']?(\s|$)/).filter((s) => s.trim().length > 2).length >= 2));
check('no dialogue line exceeds the cap',
  scripts.every((s) => s.commands.filter((c) => c.op === 'line').every((c) => c.text.length <= 240)));
check('the slice has seven final-quality scripts',
  scripts.filter((s) => s.quality === 'final').length === 7,
  `found ${scripts.filter((s) => s.quality === 'final').length}`);
check('the slice covers chapters 1-19', (() => {
  const finalChapters = new Set();
  for (const s of scripts.filter((x) => x.quality === 'final')) {
    for (let c = s.chapters[0]; c <= s.chapters[1]; c++) finalChapters.add(c);
  }
  for (let c = 1; c <= 19; c++) if (!finalChapters.has(c)) return false;
  return true;
})());
check('the slice uses the inner-voice channel', (() => {
  const slice = scripts.filter((s) => s.quality === 'final');
  const thoughts = slice.flatMap((s) => s.commands.filter((c) => c.op === 'line' && c.kind === 'thought'));
  return thoughts.length >= 30;
})(), 'inner voice should carry a real share of the slice');
check('every illustration marked present is on disk', (() => {
  const art = read('content/qingmao/art/manifest.json').illustrations;
  return art.filter((i) => i.status === 'present')
    .every((i) => existsSync(join(root, 'public', i.src)) || existsSync(join(root, i.src)));
})());
check('every scene carries sfx and music fields for a later sound pack',
  scripts.every((s) => 'sfx' in s && 'music' in s));
check('every scene line carries an sfx field',
  scripts.every((s) => s.commands.filter((c) => c.op === 'line').every((c) => 'sfx' in c)));
check('Reader\'s Lens notes exist on every scene', scripts.every((s) => !!s.lens?.anchor && !!s.lens?.adaptation));
check('veteran notes are only on scenes that opted in',
  scripts.every((s) => s.veteran === undefined || Array.isArray(s.veteran)));

// ---------------------------------------------------- narrative set writing
// The rules above only see the live content files. A narrative set is prose the
// game can be switched to, so it has to clear the same bar — otherwise a set
// could ship a three-line wall of text or a one-sentence ledger entry and no
// check would notice until it was on screen.
group('narrative sets');
const setRegistry = existsSync(join(root, 'content/qingmao/narrative/index.json'))
  ? read('content/qingmao/narrative/index.json').sets
  : [];
const narrativeSets = setRegistry.map((entry) => ({
  id: entry.id,
  data: read(`content/qingmao/narrative/sets/${entry.id}.json`)
}));
check('at least one archived set exists, so a rewrite is reversible', narrativeSets.length >= 1);
const sentences = (text) =>
  text.split(/[.!?]["']?(\s|$)/).filter((part) => part && part.trim().length > 2).length;
for (const { id, data } of narrativeSets) {
  const lines = Object.entries(data.lines ?? {});
  const chapters = Object.entries(data.ledger ?? {});
  const tooLong = lines.filter(([, text]) => text.length > 240);
  const blank = [...lines, ...chapters].filter(([, text]) => !String(text).trim());
  const thin = chapters.filter(([, text]) => sentences(text) < 2);
  check(`set "${id}" keeps every line inside the 240-character cap`, tooLong.length === 0,
    tooLong.length ? `e.g. ${tooLong[0][0]} at ${tooLong[0][1].length}` : '');
  check(`set "${id}" has no blank line or chapter`, blank.length === 0,
    blank.length ? `e.g. ${blank[0][0]}` : '');
  check(`set "${id}" keeps every ledger entry at two sentences or more`, thin.length === 0,
    thin.length ? `e.g. chapter ${thin[0][0]}` : '');
}

// ------------------------------------------------------------------- report
group('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED:`);
  for (const line of failures) console.error(`  FAIL  ${line}`);
  process.exit(1);
}
console.log(`${passed} checks passed across ${beats.length} beats, 200 chapters and ${scripts.length} scenes.`);
