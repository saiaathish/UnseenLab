/**
 * showcases — curated Level 1 demonstration family for the "Enter
 * demonstration" flow.
 *
 * Every showcase is a DemoSpecV1 fixture built by a deterministic builder,
 * validated with validateDemoSpec, coupled to a verified lumina-2d engine
 * (orbits / charges / waves) for truthful readouts, and rendered through the
 * primitive-3d stage (renderer.kind "hybrid").
 *
 * SHOWCASE_QUERIES lets the shell offer showcases directly from a user query:
 * the key is a query string (or a topic keyword) and the value carries the
 * showcase id and its builder.
 */
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { buildOrbitsShowcase } from "./orbits/build-spec";
import { buildElectricFieldShowcase } from "./electric-fields/build-spec";
import { buildWaveInterferenceShowcase } from "./wave-interference/build-spec";

export { buildOrbitsShowcase } from "./orbits/build-spec";
export { buildElectricFieldShowcase } from "./electric-fields/build-spec";
export { buildWaveInterferenceShowcase } from "./wave-interference/build-spec";
export {
  ORBITS_SHOWCASE_ID,
  ORBITS_SHOWCASE_QUERY,
} from "./orbits/build-spec";
export {
  ELECTRIC_FIELDS_SHOWCASE_ID,
  ELECTRIC_FIELDS_SHOWCASE_QUERY,
} from "./electric-fields/build-spec";
export {
  WAVE_INTERFERENCE_SHOWCASE_ID,
  WAVE_INTERFERENCE_SHOWCASE_QUERY,
} from "./wave-interference/build-spec";

/** Builder options shared by every showcase builder. */
export interface ShowcasePrefs {
  /** Respect prefers-reduced-motion: static stage, discrete steps only. */
  reducedMotion?: boolean;
  /** Mobile device: particle budgets and limits drop to the mobile caps. */
  mobile?: boolean;
}

export type ShowcaseId = "orbits" | "electric-fields" | "wave-interference";

export interface ShowcaseEntry {
  id: ShowcaseId;
  title: string;
  build: (prefs?: ShowcasePrefs) => DemoSpecV1;
}

/**
 * Query -> showcase map. Keys are exact query strings or topic keywords; the
 * shell can scan this map to offer a showcase without the generation path.
 */
export const SHOWCASE_QUERIES: Record<string, ShowcaseEntry> = {
  "Show why planets stay in orbit.": {
    id: "orbits",
    title: "Gravity & Orbits",
    build: buildOrbitsShowcase,
  },
  orbit: { id: "orbits", title: "Gravity & Orbits", build: buildOrbitsShowcase },
  orbits: { id: "orbits", title: "Gravity & Orbits", build: buildOrbitsShowcase },
  gravity: { id: "orbits", title: "Gravity & Orbits", build: buildOrbitsShowcase },
  planet: { id: "orbits", title: "Gravity & Orbits", build: buildOrbitsShowcase },
  "solar system": {
    id: "orbits",
    title: "Gravity & Orbits",
    build: buildOrbitsShowcase,
  },

  "Why do opposite charges attract?": {
    id: "electric-fields",
    title: "Electric Fields",
    build: buildElectricFieldShowcase,
  },
  charge: {
    id: "electric-fields",
    title: "Electric Fields",
    build: buildElectricFieldShowcase,
  },
  charges: {
    id: "electric-fields",
    title: "Electric Fields",
    build: buildElectricFieldShowcase,
  },
  "electric field": {
    id: "electric-fields",
    title: "Electric Fields",
    build: buildElectricFieldShowcase,
  },
  dipole: {
    id: "electric-fields",
    title: "Electric Fields",
    build: buildElectricFieldShowcase,
  },
  coulomb: {
    id: "electric-fields",
    title: "Electric Fields",
    build: buildElectricFieldShowcase,
  },

  "How do ripples create interference patterns?": {
    id: "wave-interference",
    title: "Waves & Interference",
    build: buildWaveInterferenceShowcase,
  },
  wave: { id: "wave-interference", title: "Waves & Interference", build: buildWaveInterferenceShowcase },
  waves: { id: "wave-interference", title: "Waves & Interference", build: buildWaveInterferenceShowcase },
  interference: {
    id: "wave-interference",
    title: "Waves & Interference",
    build: buildWaveInterferenceShowcase,
  },
  ripple: { id: "wave-interference", title: "Waves & Interference", build: buildWaveInterferenceShowcase },
  "double slit": {
    id: "wave-interference",
    title: "Waves & Interference",
    build: buildWaveInterferenceShowcase,
  },
};

/** Normalize a query for matching: lowercase, letters/digits/spaces only. */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Match a free-form user query to a showcase. Exact (normalized) key match
 * wins; otherwise the shortest key contained in the query wins, so "show me
 * waves interference" resolves to the waves showcase.
 */
export function matchShowcase(query: string): ShowcaseEntry | null {
  const q = normalizeQuery(query);
  if (!q) return null;
  for (const [key, entry] of Object.entries(SHOWCASE_QUERIES)) {
    if (normalizeQuery(key) === q) return entry;
  }
  let best: ShowcaseEntry | null = null;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const [key, entry] of Object.entries(SHOWCASE_QUERIES)) {
    const nk = normalizeQuery(key);
    if (nk.length > 0 && q.includes(nk) && nk.length < bestLen) {
      best = entry;
      bestLen = nk.length;
    }
  }
  return best;
}

/** The canonical showcase entry per showcase id (for direct offering). */
export function showcaseById(id: ShowcaseId): ShowcaseEntry | null {
  for (const entry of Object.values(SHOWCASE_QUERIES)) {
    if (entry.id === id) return entry;
  }
  return null;
}
