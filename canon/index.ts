/**
 * The shared canon bible. Scenes, beats and the codex address everything in here
 * by ID, so a chapter reference only ever has to be corrected in one place.
 *
 * The sequel imports this module unchanged and extends it with its own content
 * package; nothing here knows that this game stops at chapter 200.
 */
import charactersData from './characters.json';
import guData from './gu.json';
import clansData from './clans.json';
import placesData from './places.json';
import ranksData from './ranks.json';
import timelineData from './timeline.json';
import glossaryData from './glossary.json';

import type {
  CanonAct, CanonAptitude, CanonArea, CanonCharacter, CanonClan, CanonGu, CanonItem,
  CanonRank, CanonSeason, CanonTerm, Milestone, MustLandMoment, SequelThread
} from './types';

export * from './types';

export const characters = charactersData.characters as unknown as CanonCharacter[];
export const gu = guData.gu as unknown as CanonGu[];
export const optionalGu = guData.optionalGu as unknown as CanonGu[];
export const items = guData.items as unknown as CanonItem[];
export const clans = clansData.clans as unknown as CanonClan[];
export const areas = placesData.areas as unknown as CanonArea[];
export const ranks = ranksData.ranks as unknown as CanonRank[];
export const aptitudeGrades = ranksData.aptitude as unknown as CanonAptitude[];
export const glossary = glossaryData.terms as unknown as CanonTerm[];
export const terminologySet = glossaryData.terminologySet;
export const acts = timelineData.acts as unknown as CanonAct[];
export const seasons = timelineData.calendar.seasons as unknown as CanonSeason[];
export const daysPerYear = timelineData.calendar.daysPerYear;
export const mustLand = timelineData.mustLand as unknown as MustLandMoment[];
export const milestones = timelineData.milestones as unknown as Milestone[];
export const sequelThreads = timelineData.sequelHandoff.threads as unknown as SequelThread[];
export const sequelStartsAtChapter = timelineData.sequelHandoff.startsAtChapter;

const index = <T extends { id: string }>(rows: readonly T[]): ReadonlyMap<string, T> =>
  new Map(rows.map((row) => [row.id, row]));

export const charactersById = index(characters);
export const guById = index([...gu, ...optionalGu]);
export const itemsById = index(items);
export const areasById = index(areas);
export const clansById = index(clans);
export const glossaryById = index(glossary);

/** Every Gu that has to survive to chapter 200 no matter how the player plays. */
export const canonicalGuIds: ReadonlySet<string> = new Set(gu.filter((g) => g.canonical).map((g) => g.id));

export function seasonForDay(day: number): CanonSeason {
  const wrapped = ((day - 1) % daysPerYear) + 1;
  const found = seasons.find((s) => wrapped >= s.fromDay && wrapped <= s.toDay);
  // seasons tile the whole year, so the fallback only guards a corrupt data file
  return found ?? (seasons[0] as CanonSeason);
}

export function actForChapter(chapter: number): CanonAct | undefined {
  return acts.find((a) => chapter >= a.chapters[0] && chapter <= a.chapters[1]);
}

export function mustLandForChapter(chapter: number): MustLandMoment | undefined {
  return mustLand.find((m) => chapter >= m.chapters[0] && chapter <= m.chapters[1]);
}

/** Picks the appearance variant a character should use at a given chapter. */
export function variantForChapter(id: string, chapter: number): string | null {
  const character = charactersById.get(id);
  if (!character?.variants) return null;
  const hit = character.variants.find((v) => chapter >= v.chapters[0] && chapter <= v.chapters[1]);
  return hit?.id ?? null;
}
