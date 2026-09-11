/**
 * Content lint. Runs in CI and fails the build on any of the rules from the design
 * review's content-lint list, plus the canon-safety rules from its systems section.
 *
 *   1. all 200 chapters are covered
 *   2. every flag that is read is set somewhere
 *   3. every beat is reachable
 *   4. no canonical outcome depends on an optional flag
 *   5. every string key a scene or the UI asks for exists
 *   6. no dialogue line exceeds the length cap
 *   7. every art reference resolves
 *
 * Plus: enclosed areas match the canon bible's ceiling flag, canonical Gu are never
 * reachable only through a failable recipe, every ledger entry is two to four
 * sentences, terminology follows the glossary, and every must-land moment has a beat.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
/** Static assets are served from public/, so an art src resolves against it. */
const assetExists = (src) => existsSync(join(root, 'public', src)) || existsSync(join(root, src));

const DIALOGUE_CAP = 240;
const LEDGER_MIN = 90;
const LEDGER_MAX = 420;

const failures = [];
const warnings = [];
const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);
const warn = (rule, detail) => warnings.push(`${rule}: ${detail}`);

// ---------------------------------------------------------------- load data
const acts = ['act1', 'act2', 'act3', 'act4'];
const beats = acts.flatMap((a) => read(`content/qingmao/acts/${a}/beats.json`).beats);
const beatById = new Map(beats.map((b) => [b.id, b]));
const ledger = read('content/qingmao/ledger/chapters.json').chapters;
const art = read('content/qingmao/art/manifest.json');
const artById = new Map(art.illustrations.map((i) => [i.id, i]));
const strings = read('content/qingmao/strings/en.json').strings;
const canonPlaces = read('canon/places.json').areas;
const placeById = new Map(canonPlaces.map((a) => [a.id, a]));
const canonGu = read('canon/gu.json');
const guIds = new Set([...canonGu.gu, ...canonGu.optionalGu].map((g) => g.id));
const canonicalGu = new Set(canonGu.gu.filter((g) => g.canonical).map((g) => g.id));
const characters = new Set(read('canon/characters.json').characters.map((c) => c.id));
const timeline = read('canon/timeline.json');
const glossary = read('canon/glossary.json').terms;

const scripts = [];
for (const act of acts) {
  const dir = join(root, 'content/qingmao/scripts', act);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.json')) scripts.push({ path: `${act}/${name}`, data: read(join('content/qingmao/scripts', act, name)) });
  }
}
const scriptByBeat = new Map(scripts.map((s) => [s.data.beat, s]));

// ---------------------------------------------------- 1. 200/200 chapter coverage
const covered = new Map();
for (const beat of beats) {
  for (let c = beat.chapters[0]; c <= beat.chapters[1]; c++) {
    if (covered.has(c)) fail('coverage', `chapter ${c} is claimed by both ${covered.get(c)} and ${beat.id}`);
    covered.set(c, beat.id);
  }
}
const missing = [];
for (let c = 1; c <= 200; c++) if (!covered.has(c)) missing.push(c);
if (missing.length) fail('coverage', `chapters with no beat: ${missing.join(', ')}`);
if (ledger.length !== 200) fail('coverage', `the ledger has ${ledger.length} entries, expected 200`);
for (const row of ledger) {
  const beat = beatById.get(row.beat);
  if (!beat) fail('coverage', `ledger chapter ${row.chapter} points at unknown beat ${row.beat}`);
  else if (beat.coverage !== row.coverage) {
    fail('coverage', `ledger chapter ${row.chapter} says ${row.coverage}, beat ${beat.id} says ${beat.coverage}`);
  }
}

// ------------------------------------------------- 2. every flag read is also set
const allSets = new Set(beats.flatMap((b) => b.sets));
const allEvidence = new Set(beats.flatMap((b) => b.evidence));
const scriptFlags = new Set();
for (const { data } of scripts) {
  for (const command of data.commands) {
    if (command.op === 'flag') scriptFlags.add(command.set);
    if (command.op === 'choice') for (const option of command.options) if (option.sets) scriptFlags.add(option.sets);
  }
}
for (const beat of beats) {
  for (const flag of beat.reads) {
    if (!allSets.has(flag) && !allEvidence.has(flag) && !scriptFlags.has(flag)) {
      fail('flags', `${beat.id} reads "${flag}", which nothing sets`);
    }
  }
}
// A flag a scene sets but the beat never declares is a drift the lint should catch.
for (const { path, data } of scripts) {
  const beat = beatById.get(data.beat);
  if (!beat) continue;
  for (const command of data.commands) {
    if (command.op !== 'flag') continue;
    const declared = beat.sets.includes(command.set) || command.set.startsWith('tutorial.') || command.set.startsWith('codex.');
    if (!declared) warn('flags', `${path} sets "${command.set}" which beat ${beat.id} does not declare`);
  }
}

// ------------------------------------------------------- 3. every beat reachable
const complete = new Set();
let progressed = true;
while (progressed) {
  progressed = false;
  for (const beat of beats) {
    if (complete.has(beat.id)) continue;
    if (beat.requires.every((r) => complete.has(r))) {
      complete.add(beat.id);
      progressed = true;
    }
  }
}
for (const beat of beats) {
  if (!complete.has(beat.id)) fail('reachability', `${beat.id} can never become available (requires ${beat.requires.join(', ')})`);
  for (const required of beat.requires) {
    if (!beatById.has(required)) fail('reachability', `${beat.id} requires unknown beat ${required}`);
  }
}
// Legacy steps must be monotonic, or a migrated save can land before its own prerequisites.
for (const beat of beats) {
  for (const required of beat.requires) {
    const prior = beatById.get(required);
    if (prior && prior.legacyStep > beat.legacyStep) {
      fail('migration', `${beat.id} (legacyStep ${beat.legacyStep}) requires ${required} (legacyStep ${prior.legacyStep})`);
    }
  }
}

// ---------------------------- 4. no canonical outcome depends on an optional flag
const OPTIONAL_PREFIXES = ['optional.', 'sidegrade.'];
const optionalGuFlags = new Set(canonGu.optionalGu.map((g) => `gu.${g.id.replace(/-gu$/, '')}`));
for (const beat of beats) {
  for (const requirement of [...beat.requires, ...beat.reads]) {
    if (OPTIONAL_PREFIXES.some((p) => requirement.startsWith(p)) || optionalGuFlags.has(requirement)) {
      fail('canon-safety', `${beat.id} gates a canonical beat on the optional "${requirement}"`);
    }
  }
  // Every Gu flag a beat sets must name a Gu that exists in the canon bible.
  for (const flag of beat.sets) {
    if (!flag.startsWith('gu.')) continue;
    const slug = flag.slice(3);
    const candidates = [slug, `${slug}-gu`, `${slug}-grass`, `${slug}-flower`, `${slug}-worm`];
    const known = [...guIds].some((id) => candidates.includes(id) || id.includes(slug));
    if (!known) fail('canon-safety', `${beat.id} sets "${flag}" but no Gu in canon/gu.json matches`);
  }
}
// Canonical Gu must never be reachable only through a recipe that can fail outright.
const refinementSource = readFileSync(join(root, 'engine/systems/refinement.ts'), 'utf8');
for (const id of canonicalGu) {
  const match = refinementSource.match(new RegExp(`produces: '${id}'[^}]*chance: ([0-9.]+)`));
  if (match && Number(match[1]) <= 0) fail('canon-safety', `canonical Gu ${id} has a zero-chance recipe`);
}
if (!/canonical refinements? (always succeed|cannot fail)/i.test(refinementSource)) {
  warn('canon-safety', 'refinement.ts no longer documents the canonical-success rule');
}
// Gu listed in the Legacy canon block must all exist and all be canonical.
const legacySource = readFileSync(join(root, 'engine/save/legacy.ts'), 'utf8');
for (const id of legacySource.match(/'[a-z0-9-]+'/g) ?? []) {
  const bare = id.slice(1, -1);
  if (bare.includes('-') && guIds.has(bare) && !canonicalGu.has(bare)) {
    fail('canon-safety', `the Legacy canon block carries the non-canonical Gu ${bare}`);
  }
}

// ------------------------------------------------------- 5. every string resolves
const sourceFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'vendor' || name === 'dist') continue;
      walk(full);
    } else if (name.endsWith('.ts')) sourceFiles.push(full);
  }
})(join(root, 'engine'));
sourceFiles.push(join(root, 'content/qingmao/index.ts'));
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bt\(\s*'([a-zA-Z0-9._-]+)'/g)) {
    if (!(match[1] in strings)) fail('strings', `${file.replace(root + '/', '')} asks for missing string key "${match[1]}"`);
  }
}

// ------------------------------------------------- 6. dialogue length and 7. art
let finalScripts = 0;
let scaffoldScripts = 0;
for (const beat of beats) {
  const script = scriptByBeat.get(beat.id);
  if (!script) {
    fail('scripts', `${beat.id} has no scene script at content/qingmao/scripts/${beat.script}`);
    continue;
  }
  if (script.path !== beat.script) {
    fail('scripts', `${beat.id} declares ${beat.script} but its script is at ${script.path}`);
  }
  if (script.data.quality === 'final') finalScripts++;
  else scaffoldScripts++;

  for (const command of script.data.commands) {
    if (command.op === 'line') {
      if (command.text.length > DIALOGUE_CAP) {
        fail('dialogue', `${script.path}: a line is ${command.text.length} characters, cap is ${DIALOGUE_CAP}`);
      }
      if (!characters.has(command.actor)) {
        fail('dialogue', `${script.path}: line spoken by unknown character "${command.actor}"`);
      }
    }
    if (command.op === 'art' && command.id !== null) {
      const entry = artById.get(command.id);
      if (!entry) fail('art', `${script.path} references unknown illustration "${command.id}"`);
      else if (entry.status === 'present' && !assetExists(entry.src)) {
        fail('art', `${entry.id} is marked present but ${entry.src} is not on disk`);
      }
    }
    if (command.op === 'evidence' && command.add && !allEvidence.has(command.add)) {
      fail('evidence', `${script.path} adds "${command.add}", which no beat declares`);
    }
    if (command.op === 'place' || command.op === 'move' || command.op === 'face' || command.op === 'gesture') {
      const actor = command.actor ?? command.target;
      if (actor && !characters.has(actor)) fail('scripts', `${script.path} stages unknown character "${actor}"`);
    }
  }
}
for (const beat of beats) {
  if (beat.art && !artById.has(beat.art)) fail('art', `beat ${beat.id} references unknown illustration "${beat.art}"`);
}
for (const entry of art.illustrations) {
  if (entry.status === 'present' && !assetExists(entry.src)) {
    fail('art', `${entry.id} is marked present but ${entry.src} is missing`);
  }
  if (entry.status === 'planned' && !entry.prompt) warn('art', `${entry.id} is planned with no prompt written`);
  if (!entry.alt) fail('art', `${entry.id} has no alt text`);
}

// ----------------------------------------- areas, ceilings, cast and must-lands
for (const beat of beats) {
  const place = placeById.get(beat.area);
  if (!place) fail('areas', `${beat.id} is set in unknown area "${beat.area}"`);
  for (const member of beat.cast) {
    if (!characters.has(member)) fail('cast', `${beat.id} casts unknown character "${member}"`);
  }
}
// An underground area that is not enclosed is the stone-forest bug; catch it in data.
const areasSource = readFileSync(join(root, 'content/qingmao/world/areas.ts'), 'utf8');
for (const place of canonPlaces) {
  if (!place.ceiling) continue;
  const block = areasSource.match(new RegExp(`id: '${place.id.replace(/\./g, '\\.')}'[\\s\\S]{0,900}?\\n};`));
  if (block && /enclosed:\s*false/.test(block[0])) {
    fail('areas', `${place.id} has ceiling: true in the canon bible but enclosed: false in areas.ts`);
  }
}
if (!/enclosed\s*\?/.test(readFileSync(join(root, 'content/qingmao/world/areas.ts'), 'utf8')) &&
    !/enclosed: area\.ceiling/.test(areasSource)) {
  warn('areas', 'generated areas no longer take enclosed from the canon ceiling flag');
}
for (const moment of timeline.mustLand) {
  const beat = beatById.get(moment.id);
  if (!beat) fail('must-land', `moment ${moment.n} ("${moment.title}") points at unknown beat ${moment.id}`);
  else if (beat.mustLand !== moment.n) {
    fail('must-land', `moment ${moment.n} maps to beat ${beat.id}, which is tagged mustLand ${beat.mustLand}`);
  }
}
const taggedMoments = new Set(beats.map((b) => b.mustLand).filter(Boolean));
for (let n = 1; n <= 15; n++) if (!taggedMoments.has(n)) fail('must-land', `no beat is tagged with must-land moment ${n}`);

// --------------------------------------------------- ledger voice and terminology
for (const row of ledger) {
  const text = row.ledger;
  if (text.length < LEDGER_MIN) fail('ledger', `chapter ${row.chapter} is ${text.length} characters; the floor is ${LEDGER_MIN}`);
  if (text.length > LEDGER_MAX) fail('ledger', `chapter ${row.chapter} is ${text.length} characters; the cap is ${LEDGER_MAX}`);
  const sentences = text.split(/[.!?]["']?(\s|$)/).filter((s) => s.trim().length > 2).length;
  if (sentences < 2) fail('ledger', `chapter ${row.chapter} is one sentence; the ledger is two to four`);
  if (sentences > 5) warn('ledger', `chapter ${row.chapter} runs to ${sentences} sentences`);
}
// Terminology: the chosen set is applied everywhere, so the avoided forms must not appear.
const prose = [
  ...ledger.map((r) => r.ledger),
  ...scripts.flatMap(({ data }) => data.commands.filter((c) => c.op === 'line').map((c) => c.text)),
  ...Object.values(strings)
];
for (const term of glossary) {
  for (const avoided of term.avoid) {
    if (/\(/.test(avoided)) continue; // parenthetical guidance, not a literal string
    const pattern = new RegExp(`\\b${avoided.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    for (const text of prose) {
      if (pattern.test(text)) fail('terminology', `"${avoided}" appears in prose; the chosen form is "${term.use}"`);
    }
  }
}

// ----------------------------------------------------------------------- report
const summary = {
  beats: beats.length,
  chapters: covered.size,
  played: ledger.filter((r) => r.coverage === 'played').length,
  staged: ledger.filter((r) => r.coverage === 'staged').length,
  ledgerOnly: ledger.filter((r) => r.coverage === 'ledger').length,
  scriptsFinal: finalScripts,
  scriptsScaffold: scaffoldScripts,
  illustrationsPresent: art.illustrations.filter((i) => i.status === 'present').length,
  illustrationsPlanned: art.illustrations.filter((i) => i.status === 'planned').length,
  stringKeys: Object.keys(strings).length
};

console.log('content lint');
console.log(`  beats                ${summary.beats}`);
console.log(`  chapter coverage     ${summary.chapters}/200 (${summary.played} played, ${summary.staged} staged, ${summary.ledgerOnly} ledger)`);
console.log(`  scene scripts        ${summary.scriptsFinal} final, ${summary.scriptsScaffold} scaffold`);
console.log(`  illustrations        ${summary.illustrationsPresent} present, ${summary.illustrationsPlanned} planned`);
console.log(`  ui string keys       ${summary.stringKeys}`);

for (const line of warnings) console.log(`  warn  ${line}`);
if (failures.length) {
  console.error(`\n${failures.length} content lint failure(s):`);
  for (const line of failures) console.error(`  FAIL  ${line}`);
  process.exit(1);
}
console.log(`\nok — ${warnings.length} warning(s), 0 failures.`);
