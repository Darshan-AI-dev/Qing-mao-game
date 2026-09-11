/**
 * Save migration. The previous build shipped four save versions and kept the
 * originals; that discipline carries forward here.
 *
 * v1-v4 all stored a single `step` counter. The rule is the one from the design
 * review: legacy step N means "every beat whose legacyStep is at or below N is
 * complete", with prerequisites closed over by the beat graph. Everything else in
 * a legacy save that still has a home (stones, position, options, lore) is carried
 * across; anything that does not is dropped rather than guessed at.
 */
import type { BeatGraph } from '../core/beats';
import { SAVE_VERSION, defaultSettings, freshSave, type SaveGameV5 } from './schema';

interface LegacySave {
  version: number;
  step?: number;
  x?: number;
  z?: number;
  realm?: string;
  stones?: number;
  essence?: number;
  health?: number;
  strength?: number;
  visited?: string[];
  clues?: string[];
  soil?: string[];
  heritage?: { seen?: number[]; lore?: string[] };
  arc3?: { leaves?: number; choices?: string[] };
  finale?: { rewound?: boolean };
  options?: { difficulty?: string; approach?: string };
}

const REALM_TO_AREA: Record<string, string> = {
  mountain: 'mountain.village',
  hollow: 'mountain.deep-inheritance',
  wolfwood: 'mountain.wolf-forest',
  bai: 'bai.hall',
  bloodlake: 'mountain.blood-lake',
  glacier: 'mountain.glacier',
  river: 'mountain.yellow-dragon-river'
};

export interface MigrationResult {
  save: SaveGameV5;
  migratedFrom: number | null;
  /** Kept verbatim so a player can always get their original file back. */
  original: unknown | null;
  notes: string[];
}

function isV5(value: unknown): value is SaveGameV5 {
  const v = value as SaveGameV5 | null;
  return !!v && v.version === SAVE_VERSION && Array.isArray(v.completed) && !!v.aperture && !!v.settings;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** v5 saves from an older patch may predate a settings field; fill gaps in place. */
function healV5(save: SaveGameV5): SaveGameV5 {
  const defaults = defaultSettings();
  save.settings = { ...defaults, ...save.settings, keymap: { ...defaults.keymap, ...save.settings?.keymap }, audio: { ...defaults.audio, ...save.settings?.audio } };
  save.reader = { ...{ lens: false, veteran: false, foresight: 0, recollectionsViewed: [], codex: [], errata: [] }, ...save.reader };
  save.exposure = { ...{ evidence: [], cleaned: [], heat: {} }, ...save.exposure };
  save.economy = { ...{ stones: 0, lines: [], carried: 0, items: {} }, ...save.economy };
  save.beatState ??= {};
  save.methods ??= {};
  save.newGamePlus ??= 0;
  return save;
}

export function migrate(raw: unknown, graph: BeatGraph): MigrationResult {
  const notes: string[] = [];

  if (isV5(raw)) return { save: healV5(raw), migratedFrom: null, original: null, notes };

  const legacy = raw as LegacySave | null;
  const from = legacy?.version;
  if (!from || from < 1 || from > 4 || typeof legacy?.step !== 'number') {
    return { save: freshSave(), migratedFrom: null, original: null, notes: ['No readable save; started a new life.'] };
  }

  const save = freshSave();
  const step = clampNumber(legacy.step, 0, 76, 0);
  const completed = graph.fromLegacyStep(step);
  save.completed = [...completed];
  save.current = graph.next(completed)?.id ?? null;
  notes.push(`Mapped legacy step ${step} onto ${completed.size} beats.`);

  const lastBeat = [...completed].map((id) => graph.get(id)).filter(Boolean).sort((a, b) => b!.chapters[1] - a!.chapters[1])[0];
  const chapter = lastBeat?.chapters[1] ?? 1;

  save.area = REALM_TO_AREA[legacy.realm ?? 'mountain'] ?? 'mountain.village';
  save.position = { x: clampNumber(legacy.x, -200, 200, 0), z: clampNumber(legacy.z, -200, 200, 0), facing: 0 };
  save.economy.stones = clampNumber(legacy.stones, 0, 10000, 12);
  save.vitality = clampNumber(legacy.health, 1, 100, 100);
  save.strength = clampNumber(legacy.strength, 0, 3, 0);

  // Rank is rebuilt from the chapter the legacy step landed on rather than from the
  // old essence cap, which conflated rank with the Liquor worm's refinement.
  if (chapter >= 200) save.aperture = { rank: 1, stage: 'initial', aptitude: 44, essence: 44, essenceMax: 44 };
  else if (chapter >= 152) save.aperture = { rank: 3, stage: chapter >= 187 ? 'peak' : 'initial', aptitude: 44, essence: 180, essenceMax: 180 };
  else if (chapter >= 92) save.aperture = { rank: 2, stage: 'initial', aptitude: 44, essence: 90, essenceMax: 90 };
  else if (chapter >= 50) save.aperture = { rank: 1, stage: 'middle', aptitude: 44, essence: 44, essenceMax: 44 };
  else if (chapter >= 4) save.aperture = { rank: 1, stage: 'initial', aptitude: 44, essence: 44, essenceMax: 44 };
  else save.aperture = { rank: 0, stage: 'initial', aptitude: 44, essence: 0, essenceMax: 0 };

  // Gu are derived from the beats that grant them, so the inventory cannot drift
  // out of step with the story the way a parallel list would.
  const flags = graph.flagsFor(completed);
  const guFromFlags: Record<string, string> = {
    'gu.cicada': 'spring-autumn-cicada', 'gu.moonlight': 'moonlight-gu', 'gu.liquor-worm': 'liquor-worm',
    'gu.little-light': 'little-light-gu', 'gu.white-boar': 'white-boar-gu', 'gu.jade-skin': 'jade-skin-gu',
    'gu.white-jade': 'white-jade-gu', 'gu.moonglow': 'moonglow-gu', 'gu.four-flavours': 'four-flavours-liquor-worm',
    'gu.black-boar': 'black-boar-gu', 'gu.stealth-scales': 'stealth-scales-gu', 'gu.earth-ear': 'earth-ear-grass',
    'gu.nine-leaf': 'nine-leaf-vitality-grass', 'gu.water-shield': 'water-shield-gu', 'gu.sky-canopy': 'sky-canopy-gu',
    'gu.thunderwings': 'thunderwings-gu', 'gu.blood-moon': 'blood-moon-gu', 'gu.centipede': 'chainsaw-golden-centipede',
    'gu.tusita': 'tusita-flower', 'gu.treasure-lotus': 'heavenly-essence-treasure-lotus',
    'gu.mudskin-toad': 'mudskin-toad-gu', 'gu.yang': 'yang-gu'
  };
  save.gu = Object.entries(guFromFlags)
    .filter(([flag]) => flags.has(flag))
    .map(([, id]) => ({ id, fedOn: 0, sluggish: false }));
  if (!save.gu.some((g) => g.id === 'spring-autumn-cicada')) save.gu.unshift({ id: 'spring-autumn-cicada', fedOn: 0, sluggish: false });

  save.calendar = { day: lastBeat?.day ?? 1, year: chapter > 130 ? 2 : 1, weather: lastBeat?.weather ?? 'clear' };
  if (typeof legacy.arc3?.leaves === 'number') save.economy.items['vitality-leaf'] = clampNumber(legacy.arc3.leaves, 0, 99, 0);
  if (Array.isArray(legacy.heritage?.lore)) {
    save.reader.codex = legacy.heritage.lore.filter((x) => typeof x === 'string').slice(0, 64);
    notes.push(`Carried ${save.reader.codex.length} jade-marker entries into the codex.`);
  }

  const difficulty = legacy.options?.difficulty;
  if (difficulty === 'story' || difficulty === 'standard' || difficulty === 'hard') save.settings.difficulty = difficulty;
  const approach = legacy.options?.approach;
  if (approach === 'balanced' || approach === 'patient' || approach === 'force') save.settings.approach = approach;

  // A legacy save has no evidence record, so investigators start from a clean trail.
  // That is the generous reading, and it never blocks a canonical outcome.
  notes.push('Legacy saves carry no evidence record; investigators start from a clean trail.');

  return { save: healV5(save), migratedFrom: from, original: raw, notes };
}
