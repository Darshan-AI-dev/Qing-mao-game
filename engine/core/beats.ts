/**
 * The beat graph: stable IDs instead of a step counter.
 *
 * The previous build tested `step >= N` in 178 places, so inserting one arc
 * renumbered everything after it and invalidated saves. Here a beat is addressed
 * by ID, gates on prerequisite beat IDs, and publishes flags. `legacyStep` exists
 * only so a pre-v5 save can be mapped onto this graph once, at migration time.
 */

export type Coverage = 'played' | 'staged' | 'ledger';

export interface Beat {
  id: string;
  title: string;
  chapters: [number, number];
  coverage: Coverage;
  template: string;
  area: string;
  script: string;
  /** Prerequisite beat IDs. */
  requires: string[];
  /** Story flags this beat publishes. */
  sets: string[];
  /** Flags and evidence IDs this beat branches on. */
  reads: string[];
  /** Evidence this beat can leave in the world. */
  evidence: string[];
  cast: string[];
  mustLand: number | null;
  recollection: string | null;
  foresight: string | null;
  art: string | null;
  sfx: string | null;
  music: string | null;
  day: number;
  weather: string;
  legacyStep: number;
  /**
   * What the player is being asked to do next, in their own words.
   *
   * The quest panel used to print `designNote` here, so everyone playing the game read
   * the beat sheet's authoring notes — "Weak on purpose", "Also the combat tutorial" —
   * as their objective. The design note is the Reader's Lens annotation and belongs
   * behind that opt-in; this is the line for everyone else.
   */
  objective: string | null;
  designNote: string | null;
}

export interface ChapterRecord {
  chapter: number;
  beat: string;
  act: string;
  coverage: Coverage;
  ledger: string;
}

export class BeatGraph {
  readonly beats: readonly Beat[];
  readonly byId: ReadonlyMap<string, Beat>;
  readonly chapters: readonly ChapterRecord[];
  private byChapter: ReadonlyMap<number, Beat>;
  private order: ReadonlyMap<string, number>;

  constructor(beats: readonly Beat[], chapters: readonly ChapterRecord[]) {
    this.beats = [...beats].sort((a, b) => a.chapters[0] - b.chapters[0]);
    this.byId = new Map(this.beats.map((b) => [b.id, b]));
    this.chapters = chapters;
    const byChapter = new Map<number, Beat>();
    for (const beat of this.beats) {
      for (let c = beat.chapters[0]; c <= beat.chapters[1]; c++) byChapter.set(c, beat);
    }
    this.byChapter = byChapter;
    this.order = new Map(this.beats.map((b, i) => [b.id, i]));
  }

  get(id: string): Beat | undefined {
    return this.byId.get(id);
  }

  beatForChapter(chapter: number): Beat | undefined {
    return this.byChapter.get(chapter);
  }

  ledgerForChapter(chapter: number): string | undefined {
    return this.chapters.find((c) => c.chapter === chapter)?.ledger;
  }

  /** Running order, used by the Chapters view and by the dev beat jumper. */
  indexOf(id: string): number {
    return this.order.get(id) ?? -1;
  }

  /** A beat is available when every prerequisite beat is already complete. */
  isAvailable(id: string, complete: ReadonlySet<string>): boolean {
    const beat = this.byId.get(id);
    if (!beat) return false;
    if (complete.has(id)) return false;
    return beat.requires.every((r) => complete.has(r));
  }

  available(complete: ReadonlySet<string>): Beat[] {
    return this.beats.filter((b) => this.isAvailable(b.id, complete));
  }

  /** The single beat the quest panel points at: the earliest available one. */
  next(complete: ReadonlySet<string>): Beat | undefined {
    return this.available(complete)[0];
  }

  /** Every flag published by the completed beats. */
  flagsFor(complete: ReadonlySet<string>): Set<string> {
    const flags = new Set<string>();
    for (const id of complete) for (const f of this.byId.get(id)?.sets ?? []) flags.add(f);
    return flags;
  }

  /**
   * Maps a pre-v5 save's step counter onto the graph: every beat whose legacyStep
   * is at or below the old step is treated as complete. Prerequisites are then
   * closed over, so a save can never land in a state the graph considers impossible.
   */
  fromLegacyStep(step: number): Set<string> {
    const complete = new Set<string>();
    for (const beat of this.beats) if (beat.legacyStep <= step) complete.add(beat.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...complete]) {
        for (const req of this.byId.get(id)?.requires ?? []) {
          if (!complete.has(req)) {
            complete.add(req);
            changed = true;
          }
        }
      }
    }
    return complete;
  }

  /** Chapter coverage counts, for the Journal header and the content lint. */
  coverageSummary(): Record<Coverage, number> {
    const out: Record<Coverage, number> = { played: 0, staged: 0, ledger: 0 };
    for (const record of this.chapters) out[record.coverage]++;
    return out;
  }
}
