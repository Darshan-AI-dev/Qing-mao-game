/**
 * Deterministic RNG. Seeded per save so a reload reproduces the same gambling
 * shells and the same refinement rolls, and so the Playwright runs are stable.
 */
export class Rng {
  private state: number;

  constructor(seed = 2031) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(rows: readonly T[]): T | undefined {
    return rows.length ? rows[this.int(rows.length)] : undefined;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  get seed(): number {
    return this.state;
  }

  set seed(value: number) {
    this.state = value >>> 0 || 1;
  }
}
