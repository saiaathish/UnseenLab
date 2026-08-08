/**
 * geometry/rng.ts — deterministic seeded PRNG helpers (C1, Wave 3; design-1 §6).
 *
 * Single source of truth for the layout engine's seeded randomness (and any
 * B2-stage consumer that needs one): `hashString` (FNV-1a, 32-bit) plus
 * `mulberry32`. Same implementations as the renderer's historical private
 * copies (formerly renderer.ts:123–140, now visuals.ts:137–154) and identical
 * to the 2D presentation layer's `hashString` (presentation/constants.ts), so
 * every surface derives the same seed from the same spec id:
 *
 *   seed = hashString(`${spec.id}|${spec.generationId}`)
 *
 * Purity rule (design-1 §6): pure TS, no Three.js, no DOM, no canvas.
 */

/** FNV-1a 32-bit string hash — the deterministic seed source for layout.
 * Same input -> same uint32 on every platform. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 seeded PRNG returning floats in [0, 1). Same seed -> same
 * sequence on every platform (deterministic replay). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
