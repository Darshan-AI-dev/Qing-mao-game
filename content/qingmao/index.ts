/**
 * The Qing Mao content package.
 *
 * `/engine` never imports from here; this module depends on the engine and on
 * `/canon`, and the sequel adds `/content/southern-border` beside it. Act 2 to 4
 * scripts are loaded lazily so the first playable moment stays inside the download
 * budget — the Vite config splits them into act packs.
 */
import { BeatGraph, type Beat, type ChapterRecord } from '../../engine/core/beats';
import type { SceneScript } from '../../engine/scene/timeline';
import act1 from './acts/act1/beats.json';
import act2 from './acts/act2/beats.json';
import act3 from './acts/act3/beats.json';
import act4 from './acts/act4/beats.json';
import ledger from './ledger/chapters.json';
import strings from './strings/en.json';
import artManifest from './art/manifest.json';
import narrativeRegistry from './narrative/index.json';

export const beats = [...act1.beats, ...act2.beats, ...act3.beats, ...act4.beats] as unknown as Beat[];
export const chapters = ledger.chapters as unknown as ChapterRecord[];
export const graph = new BeatGraph(beats, chapters);

export interface Illustration {
  id: string;
  status: 'present' | 'planned';
  src?: string;
  title: string;
  chapters: [number, number];
  alt: string;
  note?: string;
  prompt?: string;
}

export const illustrations = artManifest.illustrations as unknown as Illustration[];
export const illustrationsById = new Map(illustrations.map((i) => [i.id, i]));

const table = strings.strings as Record<string, string>;

/**
 * Narrative sets: the whole text of the game, swappable at runtime.
 *
 * A set is a complete record of every spoken line, every chapter of the ledger and
 * every UI string, captured by `tools/snapshot-narrative.mjs`. Selecting one overlays
 * it on whatever the live content files say, which is what makes rewriting the prose
 * reversible: the archived set brings the old wording back without touching git, so a
 * rewrite that does not work out is a setting rather than a revert.
 *
 * Sets load on demand — the archive is a quarter of a megabyte and has no business in
 * the chunk that opens the game — so `applyNarrative` is awaited during boot, before
 * anything reads a line, and every lookup below it is synchronous as it was before.
 */
export interface NarrativeSet {
  id: string;
  label: string;
  note: string;
  capturedAt?: string;
  /** Keyed `${beatId}#${commandIndex}`. */
  lines: Record<string, string>;
  /** Keyed by chapter number. */
  ledger: Record<string, string>;
  strings: Record<string, string>;
}

const narrativeModules = import.meta.glob<{ default: NarrativeSet }>('./narrative/sets/*.json');
export const narrativeSets = (narrativeRegistry.sets ?? []) as { id: string; label: string; note: string }[];

let active: NarrativeSet | null = null;
/** The ledger as the live files have it, so switching back is exact. */
const liveLedger = new Map<number, string>();
const patchedScripts = new Map<string, SceneScript>();

export function activeNarrativeId(): string | null {
  return active?.id ?? null;
}

export async function applyNarrative(id: string | null): Promise<boolean> {
  if ((active?.id ?? null) === id) return true;
  patchedScripts.clear();
  if (id === null) {
    active = null;
    restoreLedger();
    return true;
  }
  const loader = narrativeModules[`./narrative/sets/${id}.json`];
  if (!loader) return false;
  active = (await loader()).default;
  applyLedger();
  return true;
}

function restoreLedger(): void {
  for (const row of chapters) {
    const original = liveLedger.get(row.chapter);
    if (original !== undefined) row.ledger = original;
  }
}

function applyLedger(): void {
  for (const row of chapters) {
    if (!liveLedger.has(row.chapter)) liveLedger.set(row.chapter, row.ledger);
    const replacement = active?.ledger[String(row.chapter)];
    row.ledger = replacement ?? liveLedger.get(row.chapter) ?? row.ledger;
  }
}

/** Overlays a set's lines onto a script, cached so a scene is patched once. */
function withNarrative(script: SceneScript): SceneScript {
  if (!active) return script;
  const cached = patchedScripts.get(script.beat);
  if (cached) return cached;
  const commands = script.commands.map((command, index) => {
    if (command.op !== 'line') return command;
    const replacement = active?.lines[`${script.beat}#${index}`];
    return replacement === undefined ? command : { ...command, text: replacement };
  });
  const patched = { ...script, commands } as SceneScript;
  patchedScripts.set(script.beat, patched);
  return patched;
}

/** `t('hud.stones', { n: 12 })`. Missing keys return the key, and the lint fails on one. */
export function t(key: string, values: Record<string, string | number> = {}): string {
  const template = active?.strings[key] ?? table[key];
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

export function hasString(key: string): boolean {
  return key in table;
}

export const stringKeys = Object.keys(table);

// Scene scripts, eagerly for Act I and lazily for the rest. Vite turns each act
// directory into its own chunk, so opening the game downloads Act I only.
const act1Scripts = import.meta.glob<{ default: SceneScript }>('./scripts/act1/*.json', { eager: true });
const laterScripts = import.meta.glob<{ default: SceneScript }>('./scripts/act{2,3,4}/*.json');

const loaded = new Map<string, SceneScript>();
for (const [path, module] of Object.entries(act1Scripts)) {
  const script = module.default;
  loaded.set(script.beat, script);
  void path;
}

export async function loadScript(beat: Beat): Promise<SceneScript | null> {
  const cached = loaded.get(beat.id);
  if (cached) return withNarrative(cached);
  const key = `./scripts/${beat.script}`;
  const loader = laterScripts[key];
  if (!loader) return null;
  const module = await loader();
  loaded.set(beat.id, module.default);
  return withNarrative(module.default);
}

/** Used by the content lint and by the dev overlay. */
export function loadedScriptCount(): number {
  return loaded.size;
}
