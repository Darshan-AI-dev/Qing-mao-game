/**
 * Types for the shared canon bible. `/canon` is consumed by this game and by the
 * sequel; nothing in here may depend on `/engine` or on `/content`.
 */

export type ChapterRange = [number, number];

export interface AppearanceNote {
  /** A design note taken from the source text, with the chapters it comes from. */
  note: string;
  chapters: ChapterRange;
}

export interface Palette {
  robe: [number, number, number];
  trim: [number, number, number];
  hair: [number, number, number];
  skin: [number, number, number];
}

export interface CharacterVariant {
  id: string;
  oneArm?: boolean;
  chapters: ChapterRange;
}

export interface CanonHair {
  length: 'long' | 'short';
  style: 'loose' | 'tied' | 'topknot';
  note?: string;
}

export interface CanonCharacter {
  id: string;
  name: string;
  clan: string | null;
  role: string;
  firstChapter: number;
  appearance: AppearanceNote[];
  /** Guidance for original writing. Never a transcription of any translation. */
  voice: string;
  palette: Palette;
  rig: string | null;
  hair?: CanonHair;
  variants?: CharacterVariant[];
}

export interface CanonGu {
  id: string;
  name: string;
  rank: number;
  /** A canonical Gu can never be lost to upkeep or to refinement failure. */
  canonical: boolean;
  acquired: number | null;
  chapters: number[];
  diet: string | null;
  dietItem?: string;
  feedDays: number | null;
  stonesPerFeed?: number;
  effects: string[];
  refinedFrom?: string[];
  ingredients?: string[];
  notes: string | null;
  source?: string;
}

export interface CanonItem {
  id: string;
  name: string;
  /** Price in primeval stones. `null` means the item is never traded. */
  stones: number | null;
  chapters?: number[];
  note?: string;
}

export interface CanonClan {
  id: string;
  name: string;
  seat: string;
  scope: 'playable' | 'interlude' | 'antagonist' | 'sequel';
  chapters: ChapterRange;
  signatureGu?: string[];
  structure?: string[];
  note: string;
}

export interface CanonArea {
  id: string;
  name: string;
  region: string;
  chapters: ChapterRange;
  outdoor: boolean;
  /** Enclosed areas must render a ceiling — see the stone-forest bug in the review. */
  ceiling: boolean;
  dark?: boolean;
  weather?: string;
  floors?: number;
  note?: string;
}

export interface CanonRank {
  id: string;
  name: string;
  label?: string;
  essence: string;
  stages?: string[];
  chapters?: ChapterRange;
  note?: string;
}

export interface CanonAptitude {
  grade: 'A' | 'B' | 'C' | 'D';
  seaPercent: number;
  holder?: string;
  chapters?: number[];
  note: string;
}

export interface CanonTerm {
  id: string;
  use: string;
  avoid: string[];
  plural?: string;
  definition: string;
  firstUse: number;
}

export interface CanonSeason {
  id: string;
  name: string;
  fromDay: number;
  toDay: number;
  weather: string[];
}

export interface MustLandMoment {
  n: number;
  id: string;
  title: string;
  chapters: ChapterRange;
  treatment: string;
}

export interface Milestone {
  chapter: number;
  day: number;
  year?: number;
  event: string;
}

export interface CanonAct {
  id: string;
  number: number;
  name: string;
  chapters: ChapterRange;
  spine: string;
}

export interface SequelThread {
  id: string;
  summary: string;
}
