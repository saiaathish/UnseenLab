/**
 * Deterministic seeded PRNG for the Lumina 2D engines.
 *
 * mulberry32: tiny, fast, and statistically fine for demo workloads. Same
 * seed -> same sequence on every platform, which is what deterministic replay
 * and the seed-determinism tests rely on.
 */

export type Rng = () => number;

/** Create a PRNG generator in [0, 1). Seeds are hashed to a nonzero uint32. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: a float in [lo, hi). */
export function rngRange(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** Convenience: an integer in [lo, hi] inclusive. */
export function rngInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export interface StatefulRng {
  next(): number;
  /** Current internal state (uint32) — for deterministic serialization. */
  getState(): number;
  setState(a: number): void;
}

/**
 * mulberry32 with an inspectable/settable internal state, so engines can
 * snapshot the PRNG in serializeState() and resume identically after
 * restoreState().
 */
export function makeStatefulRng(seed: number): StatefulRng {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState() {
      return a >>> 0;
    },
    setState(s: number) {
      a = s >>> 0;
    },
  };
}
