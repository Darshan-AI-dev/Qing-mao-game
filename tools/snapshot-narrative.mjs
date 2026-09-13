/**
 * Snapshot every word of narrative in the game into a named set.
 *
 * A set is a complete record of the spoken and written text at one moment: every
 * `line` in every scene script, every chapter of the ledger, and every UI string. The
 * game can be pointed at a set at runtime, which is what makes a rewrite reversible —
 * replace the live files with anything at all, and the archived set still brings the
 * old wording back without touching git.
 *
 * Lines are keyed by beat and command index, because the scripts have no line ids. That
 * is stable as long as a script's command order does not change; when it does, snapshot
 * again. The lint checks that whatever the live files say is covered by the archive.
 *
 *   node tools/snapshot-narrative.mjs <id> "<label>" "<note>"
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , rawId, rawLabel, rawNote] = process.argv;
const id = rawId ?? 'house';
const label = rawLabel ?? 'House prose';
const note = rawNote ?? 'The game as written.';

if (!/^[a-z0-9-]+$/.test(id)) {
  console.error(`bad set id "${id}": lowercase letters, digits and hyphens only`);
  process.exit(1);
}

const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// --- scene lines, keyed by beat and command index
const lines = {};
let scriptCount = 0;
const scriptRoot = join(root, 'content/qingmao/scripts');
for (const act of readdirSync(scriptRoot)) {
  const actDir = join(scriptRoot, act);
  for (const file of readdirSync(actDir)) {
    if (!file.endsWith('.json')) continue;
    const script = JSON.parse(readFileSync(join(actDir, file), 'utf8'));
    scriptCount += 1;
    for (const [index, command] of (script.commands ?? []).entries()) {
      if (command.op !== 'line' || typeof command.text !== 'string') continue;
      lines[`${script.beat}#${index}`] = command.text;
    }
  }
}

// --- the ledger, keyed by chapter
const ledger = {};
for (const row of read('content/qingmao/ledger/chapters.json').chapters) {
  ledger[String(row.chapter)] = row.ledger;
}

// --- UI strings
const strings = { ...read('content/qingmao/strings/en.json').strings };

const set = { id, label, note, capturedAt: new Date().toISOString().slice(0, 10), lines, ledger, strings };
const outDir = join(root, 'content/qingmao/narrative/sets');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify(set, null, 2)}\n`);

// --- registry, so the game and the Options panel know what exists
const registryPath = join(root, 'content/qingmao/narrative/index.json');
const registry = existsSync(registryPath)
  ? JSON.parse(readFileSync(registryPath, 'utf8'))
  : { sets: [] };
registry.sets = [
  ...registry.sets.filter((s) => s.id !== id),
  { id, label, note }
].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`narrative set "${id}"`);
console.log(`  scene lines    ${Object.keys(lines).length} across ${scriptCount} scripts`);
console.log(`  ledger         ${Object.keys(ledger).length} chapters`);
console.log(`  ui strings     ${Object.keys(strings).length}`);
