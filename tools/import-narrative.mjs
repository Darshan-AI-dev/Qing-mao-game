/**
 * Bring your own prose.
 *
 * Two modes, and the first is the important one:
 *
 *   node tools/import-narrative.mjs --template my-text.json
 *     Writes a fill-in file listing every line the game speaks, in scene order, each
 *     one tagged with the beat it belongs to, the chapters that beat covers and who
 *     says it — plus all two hundred ledger chapters. Replace the values with your own
 *     wording and leave anything you do not want to change exactly as it is.
 *
 *   node tools/import-narrative.mjs --from my-text.json --id source --label "Source wording"
 *     Turns a filled-in file into a narrative set the game can be switched to from
 *     Options. Anything you left untouched falls back to the current text, so a partial
 *     pass is fine and you can come back to the rest later.
 *
 * The point of the template is that the mapping is the hard part: the game speaks 316
 * lines across 68 scenes, and knowing which line sits where in the story is exactly
 * what the template answers.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? null;
};

// Paths the caller gives us may be absolute; only repo-relative ones get joined.
const at = (p) => (isAbsolute(p) ? p : join(root, p));
const read = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const beats = ['act1', 'act2', 'act3', 'act4'].flatMap(
  (a) => read(`content/qingmao/acts/${a}/beats.json`).beats
);
const beatById = new Map(beats.map((b) => [b.id, b]));

function everyScript() {
  const out = [];
  const scriptRoot = join(root, 'content/qingmao/scripts');
  for (const act of readdirSync(scriptRoot)) {
    for (const file of readdirSync(join(scriptRoot, act))) {
      if (!file.endsWith('.json')) continue;
      out.push(JSON.parse(readFileSync(join(scriptRoot, act, file), 'utf8')));
    }
  }
  // Story order, so the file reads the way the game plays.
  return out.sort((a, b) => (a.chapters?.[0] ?? 0) - (b.chapters?.[0] ?? 0));
}

if (args.includes('--template')) {
  const out = flag('--template') ?? 'narrative-template.json';
  const lines = {};
  for (const script of everyScript()) {
    const beat = beatById.get(script.beat);
    for (const [index, command] of (script.commands ?? []).entries()) {
      if (command.op !== 'line' || typeof command.text !== 'string') continue;
      lines[`${script.beat}#${index}`] = {
        beat: script.beat,
        title: beat?.title ?? '',
        chapters: script.chapters ?? beat?.chapters ?? [],
        speaker: command.actor ?? '',
        kind: command.kind ?? 'spoken',
        text: command.text
      };
    }
  }
  const ledger = {};
  for (const row of read('content/qingmao/ledger/chapters.json').chapters) {
    ledger[String(row.chapter)] = { beat: row.beat, coverage: row.coverage, text: row.ledger };
  }
  writeFileSync(
    at(out),
    `${JSON.stringify({
      how: 'Replace the "text" of anything you want to change. Leave the rest alone. Then: node tools/import-narrative.mjs --from <this file> --id <id> --label "<label>"',
      lines,
      ledger
    }, null, 2)}\n`
  );
  console.log(`template written to ${out}`);
  console.log(`  ${Object.keys(lines).length} lines across ${everyScript().length} scenes, ${Object.keys(ledger).length} ledger chapters`);
  process.exit(0);
}

const fromPath = flag('--from');
if (!fromPath) {
  console.error('usage: --template <out.json>   or   --from <in.json> --id <id> [--label "..."] [--note "..."]');
  process.exit(1);
}
const id = flag('--id') ?? 'source';
if (!/^[a-z0-9-]+$/.test(id)) {
  console.error(`bad set id "${id}": lowercase letters, digits and hyphens only`);
  process.exit(1);
}

const supplied = JSON.parse(readFileSync(at(fromPath), 'utf8'));
// Start from the current text so a partial pass leaves the rest intact and playable.
const basePath = 'content/qingmao/narrative/sets/house.json';
if (!existsSync(at(basePath))) {
  console.error('no house set to fall back on — run tools/snapshot-narrative.mjs first');
  process.exit(1);
}
const base = read(basePath);

let changedLines = 0;
const lines = { ...base.lines };
for (const [key, entry] of Object.entries(supplied.lines ?? {})) {
  const text = typeof entry === 'string' ? entry : entry?.text;
  if (typeof text !== 'string' || text === lines[key]) continue;
  lines[key] = text;
  changedLines += 1;
}

let changedLedger = 0;
const ledger = { ...base.ledger };
for (const [chapter, entry] of Object.entries(supplied.ledger ?? {})) {
  const text = typeof entry === 'string' ? entry : entry?.text;
  if (typeof text !== 'string' || text === ledger[chapter]) continue;
  ledger[chapter] = text;
  changedLedger += 1;
}

const strings = { ...base.strings, ...(supplied.strings ?? {}) };
const set = {
  id,
  label: flag('--label') ?? id,
  note: flag('--note') ?? 'Imported.',
  capturedAt: new Date().toISOString().slice(0, 10),
  lines,
  ledger,
  strings
};
writeFileSync(join(root, `content/qingmao/narrative/sets/${id}.json`), `${JSON.stringify(set, null, 2)}\n`);

const registryPath = join(root, 'content/qingmao/narrative/index.json');
const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : { sets: [] };
registry.sets = [...registry.sets.filter((s) => s.id !== id), { id, label: set.label, note: set.note }]
  .sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`narrative set "${id}" written`);
console.log(`  ${changedLines} line(s) and ${changedLedger} ledger chapter(s) replaced`);
console.log(`  everything else falls back to the current text`);
console.log(`  select it in Options -> Story text`);
