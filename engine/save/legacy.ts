/**
 * The sequel bridge.
 *
 * At chapter 200 the game offers "Carry this life forward": a Legacy JSON file,
 * also written to this site's storage so the sequel can pick it up without a file
 * picker. The `canon` block is identical for every player — a first-game choice
 * must never change what the sequel treats as canon. The `player` block only
 * changes texture: dialogue colouring, codex carry-over, lens preferences and a
 * small early-foresight allowance.
 *
 * Game 2 runs without a Legacy file. `defaultLegacy()` is what it falls back to.
 */
import { sequelThreads } from '../../canon/index';
import type { SaveGameV5 } from './schema';
import * as store from './store';

export const LEGACY_VERSION = 1;

export interface LegacyCanon {
  rank: string;
  aptitude: string;
  gu: string[];
  companions: string[];
  threads: string[];
}

export interface LegacyPlayer {
  methods: Record<string, string>;
  exposure: Record<string, number>;
  foresightRecognitions: number;
  codex: string[];
  reader: { lens: boolean; veteran: boolean };
  settings: { intensity: string; difficulty: string };
  playtimeHours: number;
  newGamePlus: number;
}

export interface LegacyFile {
  legacyVersion: number;
  game: 'qingmao';
  completedAt: string;
  canon: LegacyCanon;
  player: LegacyPlayer;
}

/**
 * Fixed for every player. These are the facts chapter 201 starts from, and the
 * content lint asserts that nothing in the save can alter them.
 */
export function canonAtChapter200(): LegacyCanon {
  return {
    rank: 'rank1.initial',
    aptitude: 'canon.ch200',
    gu: ['spring-autumn-cicada', 'yang-gu', 'thunderwings-gu', 'blood-moon-gu', 'chainsaw-golden-centipede', 'tusita-flower', 'sky-canopy-gu'],
    companions: ['bai-ning-bing'],
    threads: sequelThreads.map((t) => t.id)
  };
}

export function buildLegacy(save: SaveGameV5): LegacyFile {
  return {
    legacyVersion: LEGACY_VERSION,
    game: 'qingmao',
    completedAt: 'ch200',
    canon: canonAtChapter200(),
    player: {
      methods: { ...save.methods },
      exposure: Object.fromEntries(
        Object.entries(save.exposure.heat).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      foresightRecognitions: save.reader.foresight,
      codex: [...save.reader.codex],
      reader: { lens: save.reader.lens, veteran: save.reader.veteran },
      settings: { intensity: save.settings.intensity, difficulty: save.settings.difficulty },
      playtimeHours: Math.round((save.playtimeSeconds / 3600) * 10) / 10,
      newGamePlus: save.newGamePlus
    }
  };
}

/** What the sequel uses when the player never finished this game, or never played it. */
export function defaultLegacy(): LegacyFile {
  return {
    legacyVersion: LEGACY_VERSION,
    game: 'qingmao',
    completedAt: 'ch200',
    canon: canonAtChapter200(),
    player: {
      methods: {},
      exposure: {},
      foresightRecognitions: 0,
      codex: [],
      reader: { lens: false, veteran: false },
      settings: { intensity: 'faithful', difficulty: 'standard' },
      playtimeHours: 0,
      newGamePlus: 0
    }
  };
}

export function validateLegacy(value: unknown): LegacyFile | null {
  const file = value as LegacyFile | null;
  if (!file || file.legacyVersion !== LEGACY_VERSION || file.game !== 'qingmao') return null;
  if (!file.canon || !Array.isArray(file.canon.gu) || !Array.isArray(file.canon.threads)) return null;
  if (!file.player || typeof file.player.foresightRecognitions !== 'number') return null;
  // The canon block is authoritative regardless of what the file claims, so a
  // hand-edited Legacy file cannot change the sequel's starting facts.
  return { ...file, canon: canonAtChapter200() };
}

/** Writes the Legacy to site storage so the sequel on the same origin finds it. */
export async function storeLegacy(file: LegacyFile): Promise<number> {
  return store.write('legacy', file);
}

export async function loadStoredLegacy(): Promise<LegacyFile> {
  const raw = await store.read<LegacyFile>('legacy');
  return validateLegacy(raw) ?? defaultLegacy();
}
