/**
 * Save schema v5. Everything is keyed by stable IDs, so inserting a beat or a Gu
 * never invalidates an existing save. v1-v4 are the previous build's step-counter
 * formats and are still readable; see migrate.ts.
 */

export const SAVE_VERSION = 5;

export interface ApertureState {
  rank: number;
  stage: 'initial' | 'middle' | 'upper' | 'peak';
  /** Aptitude percentage. 44 for Fang Yuan, from chapter 4. */
  aptitude: number;
  essence: number;
  essenceMax: number;
}

export interface GuState {
  id: string;
  /** Calendar day this Gu was last fed. */
  fedOn: number;
  /** Set when upkeep lapsed: higher costs, weaker effects, optional content locked. */
  sluggish: boolean;
}

export interface LedgerLine {
  day: number;
  delta: number;
  reason: string;
  balance: number;
}

export interface EconomyState {
  stones: number;
  /** Rolling window kept for the ledger page; older lines are summarised into `carried`. */
  lines: LedgerLine[];
  carried: number;
  items: Record<string, number>;
}

export interface ExposureState {
  /** Evidence IDs still in the world. */
  evidence: string[];
  /** Evidence IDs the player cleaned up, kept so investigators can note the gap. */
  cleaned: string[];
  /** 0..1 per investigator. Never reaches a "caught" state; canon is fixed. */
  heat: Record<string, number>;
}

export interface CalendarState {
  day: number;
  year: number;
  weather: string;
}

export interface ReaderState {
  lens: boolean;
  veteran: boolean;
  foresight: number;
  recollectionsViewed: string[];
  codex: string[];
  errata: { scene: string; chapter: number; note: string }[];
}

export interface SettingsState {
  intensity: 'restrained' | 'faithful';
  difficulty: 'story' | 'standard' | 'hard';
  approach: 'balanced' | 'patient' | 'force';
  tier: 'low' | 'medium' | 'high' | 'auto';
  renderScale: number;
  textSize: 1 | 2 | 3;
  font: 'serif' | 'readable';
  reducedMotion: boolean;
  aimAssist: boolean;
  manualAim: boolean;
  haptics: boolean;
  holdToGuard: boolean;
  holdToRun: boolean;
  refinementFailure: boolean;
  guUpkeep: boolean;
  keymap: Record<string, string>;
  /** Reserved so a later sound pack needs no schema change. */
  audio: { master: number; music: number; sfx: number; muted: boolean };
}

export interface SaveGameV5 {
  version: 5;
  /** Wall-clock of the last write, for the slot list. */
  savedAt: number;
  playtimeSeconds: number;
  newGamePlus: number;
  seed: number;
  /** Completed beat IDs. The only progress marker in the schema. */
  completed: string[];
  /** The beat the player is inside, if any. */
  current: string | null;
  area: string;
  position: { x: number; z: number; facing: number };
  aperture: ApertureState;
  vitality: number;
  vitalityMax: number;
  gu: GuState[];
  strength: number;
  economy: EconomyState;
  exposure: ExposureState;
  calendar: CalendarState;
  reader: ReaderState;
  settings: SettingsState;
  /** Per-beat scratch state: which choice was taken, counters, partial progress. */
  beatState: Record<string, Record<string, number | string | boolean>>;
  /** Method choices, surfaced in the Legacy export so the sequel can colour dialogue. */
  methods: Record<string, string>;
}

export function defaultSettings(): SettingsState {
  return {
    intensity: 'faithful',
    difficulty: 'standard',
    approach: 'balanced',
    tier: 'auto',
    renderScale: 1,
    textSize: 2,
    font: 'serif',
    reducedMotion: false,
    aimAssist: true,
    manualAim: false,
    haptics: true,
    holdToGuard: true,
    holdToRun: true,
    refinementFailure: true,
    guUpkeep: true,
    keymap: {
      forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
      interact: 'KeyE', attack: 'Space', strike: 'KeyF', guard: 'KeyR',
      dodge: 'KeyQ', cultivate: 'KeyC', run: 'ShiftLeft', wings: 'KeyT',
      observe: 'KeyL', conceal: 'KeyV', listen: 'KeyB', heal: 'KeyH',
      journal: 'KeyJ', atlas: 'KeyM', pause: 'Escape', recollect: 'KeyG'
    },
    audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false }
  };
}

export function freshSave(seed = 2031): SaveGameV5 {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    playtimeSeconds: 0,
    newGamePlus: 0,
    seed,
    completed: [],
    current: null,
    area: 'prologue.last-stand',
    position: { x: 0, z: 44, facing: 0 },
    // The prologue is played at full power; the next beat drops him to Rank one.
    aperture: { rank: 8, stage: 'peak', aptitude: 44, essence: 900, essenceMax: 900 },
    vitality: 100,
    vitalityMax: 100,
    gu: [{ id: 'spring-autumn-cicada', fedOn: 0, sluggish: false }],
    strength: 0,
    economy: { stones: 12, lines: [], carried: 0, items: {} },
    exposure: { evidence: [], cleaned: [], heat: { 'jia-fu': 0, 'tie-ruo-nan': 0 } },
    calendar: { day: 0, year: 1, weather: 'storm' },
    reader: { lens: false, veteran: false, foresight: 0, recollectionsViewed: [], codex: [], errata: [] },
    settings: defaultSettings(),
    beatState: {},
    methods: {}
  };
}
