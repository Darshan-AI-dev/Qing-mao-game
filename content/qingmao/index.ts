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

/** `t('hud.stones', { n: 12 })`. Missing keys return the key, and the lint fails on one. */
export function t(key: string, values: Record<string, string | number> = {}): string {
  const template = table[key];
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
  if (cached) return cached;
  const key = `./scripts/${beat.script}`;
  const loader = laterScripts[key];
  if (!loader) return null;
  const module = await loader();
  loaded.set(beat.id, module.default);
  return module.default;
}

/** Used by the content lint and by the dev overlay. */
export function loadedScriptCount(): number {
  return loaded.size;
}
