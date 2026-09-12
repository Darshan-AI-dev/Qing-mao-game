/**
 * Who is standing in an area, and what they have to say right now.
 *
 * Pure, so the rules can be tested without a browser: which people exist at this point
 * in the story, which of their lines are eligible, and in what order they are offered.
 *
 * The order matters more than it looks. A person opens with the newest thing they have
 * to say — the line that reacts to whatever you did most recently — and pressing again
 * works backwards through the older ones. Opening with the oldest line would mean the
 * uncle greets you with his pre-awakening line for the rest of the game.
 */
// Type-only, so the engine carries no dependency on the content here: the caller hands
// in the area's people. It also lets the rules be unit-tested in Node, which cannot
// resolve an extensionless import through a stripped type import chain.
import type { Folk, FolkLine } from '../../content/qingmao/world/folk';

export const SPEAK_RANGE = 3.2;

/** The people actually standing in an area, given what the player has finished. */
export function folkIn(all: readonly Folk[], completed: ReadonlySet<string>): readonly Folk[] {
  return all.filter((person) => !(person.until && completed.has(person.until)));
}

/** Their lines, newest first. Empty only if a person has nothing eligible at all. */
export function linesFor(person: Folk, completed: ReadonlySet<string>): readonly FolkLine[] {
  const eligible = person.lines.filter(
    (line) =>
      (!line.needs || completed.has(line.needs)) &&
      !(line.until && completed.has(line.until))
  );
  return [...eligible].reverse();
}

/**
 * The line to say on the `heard`-th press, cycling.
 *
 * Cycling rather than stopping: a person who has run out of new lines repeats their
 * most recent one, which is how someone standing in a doorway actually behaves, and it
 * means the Speak prompt is never a button that does nothing.
 */
export function lineAt(person: Folk, completed: ReadonlySet<string>, heard: number): string | null {
  const lines = linesFor(person, completed);
  if (lines.length === 0) return null;
  const index = Math.max(0, heard) % lines.length;
  return lines[index]?.text ?? null;
}

/** Nearest person within speaking distance, or null. */
export function nearestFolk(
  all: readonly Folk[],
  completed: ReadonlySet<string>,
  at: { x: number; z: number }
): { person: Folk; distance: number } | null {
  let best: { person: Folk; distance: number } | null = null;
  for (const person of folkIn(all, completed)) {
    const distance = Math.hypot(person.x - at.x, person.z - at.z);
    if (distance > SPEAK_RANGE) continue;
    if (!best || distance < best.distance) best = { person, distance };
  }
  return best;
}

export type { Folk, FolkLine };
