/**
 * showcases.test.ts — curated 3D showcase family tests.
 *
 * Every showcase fixture must:
 *   - pass validateDemoSpec with status "valid" (no repairs, no rejections),
 *   - stay inside SPEC_LIMITS and its own declared limits,
 *   - couple only to the ENGINE_CATALOG parameter/readout keys of its engine,
 *   - carry a prediction whose correctIndex is a physical fact verified by
 *     running the actual lumina-2d engine module with the fixture parameters,
 *   - expose reduced-motion variants with no orbit/oscillate/pulse animation,
 *   - keep mobile particle budgets at or below 500.
 */
import { describe, expect, it } from "vitest";
import {
  buildOrbitsShowcase,
  buildElectricFieldShowcase,
  buildWaveInterferenceShowcase,
  SHOWCASE_QUERIES,
  matchShowcase,
} from "@/demonstrations/showcases";
import { validateDemoSpec, SPEC_LIMITS } from "@/demonstrations/validation";
import { ENGINE_CATALOG } from "@/demonstrations/spec/demo-spec";
import type {
  DemoSpecV1,
  PrimitiveKind,
} from "@/demonstrations/spec/demo-spec";
import { createModule } from "@/demonstrations/renderers/lumina-2d/registry";
import type { SimulationModule } from "@/demonstrations/renderers/lumina-2d/types";
import {
  WAVE_GRID_W,
  WAVE_GRID_H,
} from "@/demonstrations/renderers/lumina-2d/engines/waves";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BUILDERS = [
  { id: "orbits", build: buildOrbitsShowcase },
  { id: "electric-fields", build: buildElectricFieldShowcase },
  { id: "waves", build: buildWaveInterferenceShowcase },
] as const;

/** The three showcase builders must produce specs that validate as "valid"
 * (never "repaired" — curated fixtures must be within bounds from the start). */
function expectValid(spec: DemoSpecV1): DemoSpecV1 {
  const outcome = validateDemoSpec(spec);
  expect(outcome.status, JSON.stringify(outcome.reasons)).toBe("valid");
  expect(outcome.spec).toBeDefined();
  return outcome.spec!;
}

function engineModule(engineId: string): SimulationModule {
  const m = createModule(engineId);
  expect(m, `engine ${engineId} must be registered`).not.toBeNull();
  m!.init({ width: 800, height: 600, dpr: 1, time: 0 });
  m!.reset(20260804);
  return m!;
}

/** Drive an engine module with the exact parameters from a showcase spec. */
function applyParameters(m: SimulationModule, spec: DemoSpecV1): void {
  for (const p of spec.simulation!.parameters) {
    m.setParameter(p.key, p.value);
  }
}

function readoutOf(m: SimulationModule, label: string): number {
  const r = m.getReadouts().find((x) => x.label === label);
  expect(r, `readout ${label} must exist`).toBeDefined();
  return parseFloat(r!.value);
}

function readoutLabels(m: SimulationModule): string[] {
  return m.getReadouts().map((r) => r.label);
}

/** Orbit period measured from the engine (sim seconds for a full 2*pi sweep). */
function orbitPeriod(m: SimulationModule, maxSteps = 6000): number {
  const st = m.serializeState() as { simTime: number; thetaAccum: number };
  for (let i = 0; i < maxSteps && st.thetaAccum < 2 * Math.PI; i++) {
    m.step(1 / 60);
    Object.assign(st, m.serializeState());
  }
  expect(st.thetaAccum).toBeGreaterThanOrEqual(2 * Math.PI);
  return st.simTime;
}

/** Max planet-star distance over a run of `steps` frames (engine units). */
function orbitMaxDistance(m: SimulationModule, steps: number): number {
  let maxD = 0;
  for (let i = 0; i < steps; i++) {
    m.step(1 / 60);
    const st = m.serializeState() as {
      bodies: Array<{ x: number; y: number }>;
    };
    const p = st.bodies[1];
    maxD = Math.max(maxD, Math.hypot(p.x, p.y));
  }
  return maxD;
}

const WAVE_SX = Math.floor(WAVE_GRID_W * 0.28);
const WAVE_MID_J = WAVE_GRID_H / 2;

/**
 * Count the bright interference lobes between the two wave sources: local
 * maxima of |u| along the source column between the source rows. Verified
 * monotone: separation 40 -> 2-4 lobes, separation 110 -> 10-15 lobes.
 */
function countBetweenSourceLobes(u: number[], half: number): number {
  const line: number[] = [];
  for (let j = WAVE_MID_J - half + 1; j <= WAVE_MID_J + half - 1; j++) {
    line.push(Math.abs(u[j * WAVE_GRID_W + WAVE_SX]));
  }
  const maxV = Math.max(...line);
  let peaks = 0;
  for (let i = 1; i < line.length - 1; i++) {
    if (
      line[i] >= line[i - 1] &&
      line[i] > line[i + 1] &&
      line[i] > 0.3 * maxV
    ) {
      peaks++;
    }
  }
  return peaks;
}

function runWavesGrid(separation: number, wavelength: number, steps = 4000): number[] {
  const m = engineModule("waves");
  m.setParameter("frequency", 0.5);
  m.setParameter("wavelength", wavelength);
  m.setParameter("amplitude", 0.6);
  m.setParameter("separation", separation);
  m.setParameter("phase", 0);
  for (let i = 0; i < steps; i++) m.step(1 / 60);
  return (m.serializeState() as { u: number[] }).u;
}

const KNOWN_PRIMITIVES = new Set<PrimitiveKind>([
  "sphere", "box", "plane", "ring", "arrow", "line", "trail", "label",
  "particle_field", "vector_field", "orbit_path", "wave_surface",
  "graph_surface", "process_node", "process_edge", "energy_packet",
  "camera_marker", "group",
]);

type RepresentationKind = DemoSpecV1["representations"][number]["kind"];

const KNOWN_REPRESENTATIONS = new Set<RepresentationKind>([
  "stage_2d", "stage_3d", "diagram", "graph", "table", "timeline",
  "text_sequence", "causal_map",
]);

/** Structural checks every showcase must satisfy (all variants). */
function expectShowcaseStructure(spec: DemoSpecV1): void {
  // --- trust / provenance ---
  expect(spec.trust.level).toBe("verified_simulation");
  expect(spec.provenance.source).toBe("curated_engine");
  expect(spec.provenance.templateIds).toEqual([]);
  expect(spec.renderer.kind).toBe("hybrid");
  expect(spec.simulation).toBeDefined();
  expect(spec.trust.engineId).toBe(spec.simulation!.engineId);
  expect(spec.trust.engineVersion).toBe(spec.simulation!.engineVersion);

  // --- engine coupling: parameter/readout keys come only from the catalog ---
  const capability = ENGINE_CATALOG[spec.simulation!.engineId];
  expect(capability).toBeDefined();
  const paramKeys = spec.simulation!.parameters.map((p) => p.key);
  const readoutKeys = spec.simulation!.readouts.map((r) => r.key);
  for (const key of paramKeys) expect(capability.parameterKeys).toContain(key);
  for (const key of readoutKeys) expect(capability.readoutKeys).toContain(key);
  expect(paramKeys.length).toBeGreaterThan(0);
  expect(readoutKeys.length).toBeGreaterThan(0);
  for (const p of spec.simulation!.parameters) {
    expect(p.value).toBeGreaterThanOrEqual(p.min);
    expect(p.value).toBeLessThanOrEqual(p.max);
  }

  // --- prediction: graded and pointing inside the option list ---
  expect(spec.prediction.correctIndex).toBeDefined();
  expect(spec.prediction.correctIndex!).toBeLessThan(spec.prediction.options.length);
  for (const option of spec.prediction.options) expect(option.length).toBeGreaterThan(0);

  // --- limits: declared counts are a promise, never above SPEC_LIMITS ---
  expect(spec.controls.length).toBeLessThanOrEqual(SPEC_LIMITS.maxControls);
  expect(spec.controls.length).toBeLessThanOrEqual(spec.limits.maxControls);
  expect(spec.limits.maxControls).toBeLessThanOrEqual(SPEC_LIMITS.maxControls);
  expect(spec.limits.maxObjects).toBeLessThanOrEqual(SPEC_LIMITS.maxObjects);

  // --- scene objects: ids unique, kinds known, refs resolve, budgets hold ---
  const objects = spec.scene3d!.objects;
  const ids = objects.map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(objects.length).toBeLessThanOrEqual(spec.limits.maxObjects);
  for (const o of objects) expect(KNOWN_PRIMITIVES.has(o.kind)).toBe(true);
  const labelCount = objects.filter((o) => o.kind === "label").length;
  expect(labelCount).toBeLessThanOrEqual(SPEC_LIMITS.maxLabels);
  const maxParticles = Math.max(0, ...objects.map((o) => o.particleCount ?? 0));
  expect(maxParticles).toBeLessThanOrEqual(spec.limits.maxParticles);
  expect(maxParticles).toBeLessThanOrEqual(SPEC_LIMITS.maxParticlesDesktop);

  const relationships = spec.scene3d!.relationships;
  expect(relationships.length).toBeLessThanOrEqual(SPEC_LIMITS.maxRelationships);
  for (const rel of relationships) {
    expect(ids).toContain(rel.from);
    expect(ids).toContain(rel.to);
  }

  const animations = spec.scene3d!.animations;
  for (const a of animations) expect(ids).toContain(a.target);

  // --- timeline within limits ---
  const events = spec.timeline?.events ?? [];
  expect(events.length).toBeLessThanOrEqual(spec.limits.maxTimelineEvents);
  expect(events.length).toBeLessThanOrEqual(SPEC_LIMITS.maxTimelineEvents);

  // --- representations: unique ids, known kinds, at most 5 ---
  const repIds = spec.representations.map((r) => r.id);
  expect(new Set(repIds).size).toBe(repIds.length);
  expect(spec.representations.length).toBeLessThanOrEqual(SPEC_LIMITS.maxRepresentations);
  for (const r of spec.representations) expect(KNOWN_REPRESENTATIONS.has(r.kind)).toBe(true);

  // --- controls: unique ids, sane ranges ---
  const controlIds = spec.controls.map((c) => c.id);
  expect(new Set(controlIds).size).toBe(controlIds.length);
  const parameterKeys = new Set(paramKeys);
  const animationIds = new Set(animations.map((a) => a.id));
  for (const c of spec.controls) {
    if (c.target.kind === "parameter") expect(parameterKeys.has(c.target.ref)).toBe(true);
    if (c.target.kind === "animation") expect(animationIds.has(c.target.ref)).toBe(true);
    if (c.min !== undefined && c.max !== undefined) {
      expect(c.min).toBeLessThanOrEqual(c.max);
      if (c.step !== undefined) expect((c.max - c.min) / c.step).toBeLessThanOrEqual(10_000);
      if (typeof c.defaultValue === "number") {
        expect(c.defaultValue).toBeGreaterThanOrEqual(c.min);
        expect(c.defaultValue).toBeLessThanOrEqual(c.max);
      }
    }
  }
  expect(spec.observationPrompts.length).toBeLessThanOrEqual(SPEC_LIMITS.maxObservationPrompts);
}

// ---------------------------------------------------------------------------
// 1. All three showcases validate and stay in bounds
// ---------------------------------------------------------------------------

describe("showcase fixtures", () => {
  for (const { id, build } of BUILDERS) {
    it(`${id}: validates as a curated Level 1 hybrid spec`, () => {
      const spec = expectValid(build());
      expectShowcaseStructure(spec);
      expect(spec.trust.limitations.length).toBeGreaterThanOrEqual(1);
      expect(spec.trust.limitations.length).toBeLessThanOrEqual(4);
    });

    it(`${id}: reduced-motion variant validates and drops continuous motion`, () => {
      const spec = expectValid(build({ reducedMotion: true }));
      expectShowcaseStructure(spec);
      const operators = spec.scene3d!.animations.map((a) => a.operator);
      expect(operators).not.toContain("orbit");
      expect(operators).not.toContain("oscillate");
      expect(operators).not.toContain("pulse");
      // the reduced stage is limited to discrete/stepped operators
      for (const op of operators) {
        expect(["reveal", "scale", "translate"]).toContain(op);
      }
      expect(
        spec.trust.limitations.some((l) => l.toLowerCase().includes("reduced"))
      ).toBe(true);
    });

    it(`${id}: mobile + reduced-motion variants validate`, () => {
      expectValid(build({ mobile: true }));
      expectValid(build({ mobile: true, reducedMotion: true }));
    });
  }

  it("orbits: mobile variant keeps the particle budget at or below 500", () => {
    const spec = expectValid(buildOrbitsShowcase({ mobile: true }));
    const particles = spec.scene3d!.objects.filter(
      (o) => o.kind === "particle_field"
    );
    expect(particles.length).toBeGreaterThan(0);
    for (const p of particles) {
      expect(p.particleCount!).toBeLessThanOrEqual(500);
      expect(p.particleCount!).toBeLessThanOrEqual(spec.limits.maxParticles);
    }
    expect(spec.limits.maxParticles).toBeLessThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------
// 2. Physics: prediction correctness verified against the coupled engines
// ---------------------------------------------------------------------------

describe("orbits showcase physics (coupled lumina-2d engine)", () => {
  it("raising Launch speed makes the planet speed up and swing outward — the graded claim", () => {
    const spec = expectValid(buildOrbitsShowcase());
    const m = engineModule("orbits");
    applyParameters(m, spec);

    const baselineSpeed = readoutOf(m, "Speed");
    m.setParameter("speed", 1.15);
    const boostedSpeed = readoutOf(m, "Speed");
    expect(boostedSpeed).toBeGreaterThan(baselineSpeed);
    expect(boostedSpeed / baselineSpeed).toBeCloseTo(1.15, 1);

    // swing outward: the launch point becomes the ellipse's periapsis
    const m1 = engineModule("orbits");
    applyParameters(m1, spec);
    const m115 = engineModule("orbits");
    applyParameters(m115, spec);
    m115.setParameter("speed", 1.15);
    const maxD1 = orbitMaxDistance(m1, 900);
    const maxD115 = orbitMaxDistance(m115, 900);
    expect(maxD1).toBeLessThan(155); // circular orbit stays at ~150
    expect(maxD115).toBeGreaterThan(maxD1 * 1.2); // swings outward well beyond 150
    expect(maxD115).toBeGreaterThan(250);

    // the graded option describes exactly the measured behaviour
    const correct = spec.prediction.options[spec.prediction.correctIndex!];
    expect(correct).toMatch(/speeds up/i);
    expect(correct).toMatch(/swing(s)? outward/i);
  });

  it("curated defaults reproduce Kepler's third law (T^2 ~ a^3)", () => {
    const spec = expectValid(buildOrbitsShowcase());
    const periodOf = (distance: number) => {
      const m = engineModule("orbits");
      applyParameters(m, spec);
      m.setParameter("distance", distance);
      return orbitPeriod(m);
    };
    const t150 = periodOf(150);
    const t300 = periodOf(300);
    const ratio = t300 / t150;
    // T(300)/T(150) = (300/150)^(3/2) = sqrt(8)
    expect(Math.abs(ratio - Math.sqrt(8)) / Math.sqrt(8)).toBeLessThan(0.05);
  });

  it("engine readout keys line up with the showcase readouts", () => {
    const spec = expectValid(buildOrbitsShowcase());
    const m = engineModule("orbits");
    applyParameters(m, spec);
    const labels = readoutLabels(m);
    expect(labels).toContain("Period");
    expect(labels).toContain("Speed");
    expect(labels).toContain("Distance");
    expect(spec.simulation!.readouts.map((r) => r.label)).toEqual(labels);
  });
});

describe("electric-fields showcase physics (coupled lumina-2d engine)", () => {
  it("dipole midpoint potential is exactly zero while the field is non-zero — the graded claim", () => {
    const spec = expectValid(buildElectricFieldShowcase());
    const m = engineModule("charges");
    applyParameters(m, spec);

    const potential = readoutOf(m, "Potential");
    const field = readoutOf(m, "Field strength");
    expect(Math.abs(potential)).toBeLessThan(1e-9); // 1/77 - 1/77 = 0 exactly
    expect(field).toBeGreaterThan(0); // softened midpoint field, non-zero

    const correct = spec.prediction.options[spec.prediction.correctIndex!];
    expect(correct).toMatch(/zero/i);
    expect(correct).toMatch(/cancel/i);
  });

  it("same-sign charges put a true null point at the midpoint (field 0, potential > 0)", () => {
    const spec = expectValid(buildElectricFieldShowcase());
    const m = engineModule("charges");
    applyParameters(m, spec);
    m.setParameter("q2", 1); // dipole preset off: q1 = q2 = +1

    const field = readoutOf(m, "Field strength");
    const potential = readoutOf(m, "Potential");
    expect(field).toBe(0); // symmetric fields cancel exactly at the midpoint
    expect(potential).toBeGreaterThan(0.01); // 2/(70+7) = 0.026
  });

  it("increasing separation weakens the midpoint field", () => {
    const spec = expectValid(buildElectricFieldShowcase());
    const m = engineModule("charges");
    applyParameters(m, spec);
    const field140 = readoutOf(m, "Field strength");
    m.setParameter("separation", 280);
    const field280 = readoutOf(m, "Field strength");
    expect(field140).toBeGreaterThan(0);
    expect(field280).toBeGreaterThan(0);
    expect(field280).toBeLessThan(field140);
  });
});

describe("wave-interference showcase physics (coupled lumina-2d engine)", () => {
  it("more separation packs more bright lobes between the sources — the graded claim", () => {
    const spec = expectValid(buildWaveInterferenceShowcase());
    const u40 = runWavesGrid(40, 14);
    const u110 = runWavesGrid(110, 14);
    const lobes40 = countBetweenSourceLobes(u40, 20);
    const lobes110 = countBetweenSourceLobes(u110, 55);
    expect(lobes40).toBeGreaterThanOrEqual(1);
    expect(lobes110).toBeGreaterThan(lobes40 + 3);

    const correct = spec.prediction.options[spec.prediction.correctIndex!];
    expect(correct).toMatch(/lobes/i);
  });

  it("smaller wavelength also packs more lobes (fringe spacing ~ wavelength)", () => {
    const u8 = runWavesGrid(80, 8);
    const u24 = runWavesGrid(80, 24);
    const lobes8 = countBetweenSourceLobes(u8, 40);
    const lobes24 = countBetweenSourceLobes(u24, 40);
    expect(lobes8).toBeGreaterThan(lobes24 + 3);
  });

  it("engine readout keys line up with the showcase readouts", () => {
    const spec = expectValid(buildWaveInterferenceShowcase());
    const m = engineModule("waves");
    applyParameters(m, spec);
    expect(readoutLabels(m)).toEqual(
      spec.simulation!.readouts.map((r) => r.label)
    );
  });
});

// ---------------------------------------------------------------------------
// 3. SHOWCASE_QUERIES routing
// ---------------------------------------------------------------------------

describe("SHOWCASE_QUERIES", () => {
  it("every entry builds a valid showcase of its own engine", () => {
    const seen = new Set<string>();
    for (const entry of Object.values(SHOWCASE_QUERIES)) {
      seen.add(entry.id);
      const spec = expectValid(entry.build());
      expectShowcaseStructure(spec);
      expect(spec.id).toBe(`showcase-${entry.id}`);
    }
    expect(seen).toEqual(
      new Set(["orbits", "electric-fields", "wave-interference"])
    );
  });

  it("matchShowcase resolves exact queries and topic keywords", () => {
    expect(matchShowcase("Show why planets stay in orbit.")?.id).toBe("orbits");
    expect(matchShowcase("orbit")?.id).toBe("orbits");
    expect(matchShowcase("gravity")?.id).toBe("orbits");
    expect(matchShowcase("Why do opposite charges attract?")?.id).toBe(
      "electric-fields"
    );
    expect(matchShowcase("electric field")?.id).toBe("electric-fields");
    expect(matchShowcase("dipole")?.id).toBe("electric-fields");
    expect(matchShowcase("How do ripples create interference patterns?")?.id).toBe(
      "wave-interference"
    );
    expect(matchShowcase("show me waves interference")?.id).toBe(
      "wave-interference"
    );
    expect(matchShowcase("double slit")?.id).toBe("wave-interference");
  });

  it("matchShowcase returns null for empty or unmatched queries", () => {
    expect(matchShowcase("")).toBeNull();
    expect(matchShowcase("   ")).toBeNull();
    expect(matchShowcase("quantum chromodynamics")).toBeNull();
  });
});
