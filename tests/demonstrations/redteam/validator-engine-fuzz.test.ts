/**
 * RED-TEAM — validator-vs-engine consistency fuzzing.
 *
 * Take valid showcase/generated specs and mutate them the way a hostile or
 * confused model would: drop required fields, swap engines, inject foreign
 * readouts, break prediction indices, overflow option counts, negate seeds.
 * Every mutation must be REJECTED or REPAIRED with a safe reason — and any
 * spec that does survive (repair path) must never throw in the renderer layer.
 */

import { describe, expect, it } from "vitest";
import { validateDemoSpec } from "@/demonstrations/validation";
import { generateOfflineDemo } from "@/demonstrations/generation/offline/generator";
import { buildOrbitsShowcase, buildElectricFieldShowcase, buildWaveInterferenceShowcase } from "@/demonstrations/showcases";
import { buildSceneGraph } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import { createDefaultPreferences } from "@/domain/learner";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";

const prefs = createDefaultPreferences();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function generatedSpecs(): DemoSpecV1[] {
  const out: DemoSpecV1[] = [];
  for (const query of [
    "Show why planets stay in orbit.",
    "Show me a pendulum",
    "Show me gas particles moving.",
    "Explain cause and effect",
    "Show me mitosis",
  ]) {
    const r = generateOfflineDemo(query, prefs);
    if (r.status !== "spec" || !r.spec) throw new Error(`no spec for ${query}`);
    out.push(clone(r.spec));
  }
  return out;
}

function showcaseSpecs(): DemoSpecV1[] {
  return [
    buildOrbitsShowcase(),
    buildElectricFieldShowcase(),
    buildWaveInterferenceShowcase(),
  ].map(clone);
}

interface Mutation {
  name: string;
  /** Whether the mutation needs a simulation block to exist. */
  needsSimulation: boolean;
  apply: (spec: DemoSpecV1) => void;
  /** Reason-code prefixes the validator must produce (any-of match). */
  expectedReasonPrefixes: string[];
}

const MUTATIONS: Mutation[] = [
  {
    name: "drop required field: title",
    needsSimulation: false,
    apply: (s) => { delete (s as Partial<DemoSpecV1>).title; },
    expectedReasonPrefixes: ["invalid_type", "empty_field"],
  },
  {
    name: "drop required field: prediction",
    needsSimulation: false,
    apply: (s) => { delete (s as Partial<DemoSpecV1>).prediction; },
    expectedReasonPrefixes: ["invalid_type"],
  },
  {
    name: "drop simulation from a Level 1 spec",
    needsSimulation: true, // only meaningful for seeds that carry a simulation
    apply: (s) => {
      delete s.simulation;
      // Parameter-driven controls become unresolvable once the simulation is
      // gone; both rejection paths are legitimate defences.
      s.controls = [
        { id: "play_pause", type: "play_pause", label: "Play / Pause", target: { kind: "scene", ref: "play_pause" } },
      ];
    },
    expectedReasonPrefixes: ["science_policy:level1_simulation", "invalid_control_target"],
  },
  {
    name: "swap engine id without changing params",
    needsSimulation: true,
    apply: (s) => {
      s.simulation!.engineId = s.simulation!.engineId === "orbits" ? "pendulum" : "orbits";
      if (s.trust.engineId) s.trust.engineId = s.simulation!.engineId;
    },
    expectedReasonPrefixes: ["incompatible_engine"],
  },
  {
    name: "add a readout not in the engine catalog",
    needsSimulation: true,
    apply: (s) => {
      s.simulation!.readouts.push({ key: "fakeReadout", label: "Fake", format: "raw" });
    },
    expectedReasonPrefixes: ["incompatible_engine"],
  },
  {
    name: "add a parameter not in the engine catalog",
    needsSimulation: true,
    apply: (s) => {
      s.simulation!.parameters.push({ key: "joule", label: "Joule", min: 0, max: 1, step: 0.1, value: 0.5 });
    },
    expectedReasonPrefixes: ["incompatible_engine"],
  },
  {
    name: "correctIndex out of range",
    needsSimulation: false,
    apply: (s) => { s.prediction.correctIndex = 9; },
    expectedReasonPrefixes: ["range_exceeded", "invalid_prediction_index"],
  },
  {
    name: "prediction options > 4",
    needsSimulation: false,
    apply: (s) => { s.prediction.options.push("A fifth option", "A sixth option"); },
    expectedReasonPrefixes: ["count_exceeded"],
  },
  {
    name: "negative seed",
    needsSimulation: true,
    apply: (s) => { s.simulation!.seed = -5; },
    expectedReasonPrefixes: ["range_exceeded", "invalid_type"],
  },
  {
    name: "non-integer seed",
    needsSimulation: true,
    apply: (s) => { s.simulation!.seed = 3.7; },
    expectedReasonPrefixes: ["invalid_type", "range_exceeded", "not_multiple_of"],
  },
  {
    name: "min > max on an engine parameter",
    needsSimulation: true,
    apply: (s) => {
      const p = s.simulation!.parameters[0];
      p.min = 10;
      p.max = 1;
    },
    expectedReasonPrefixes: ["unsafe_value"],
  },
  {
    name: "parameter value outside [min, max]",
    needsSimulation: true,
    apply: (s) => {
      const p = s.simulation!.parameters[0];
      p.value = p.max + 1;
    },
    expectedReasonPrefixes: ["repaired", "unsafe_value"],
  },
  {
    name: "control target references a nonexistent parameter",
    needsSimulation: false,
    apply: (s) => {
      s.controls.push({
        id: "evil-control",
        type: "slider",
        label: "Ghost",
        target: { kind: "parameter", ref: "does_not_exist" },
      });
    },
    expectedReasonPrefixes: ["invalid_control_target"],
  },
  {
    name: "control target references a nonexistent animation",
    needsSimulation: false,
    apply: (s) => {
      s.controls.push({
        id: "evil-anim-control",
        type: "slider",
        label: "Ghost anim",
        target: { kind: "animation", ref: "ghost-animation" },
      });
    },
    expectedReasonPrefixes: ["invalid_control_target"],
  },
  {
    name: "declared limits.maxObjects lies below actual object count",
    needsSimulation: false,
    apply: (s) => {
      s.scene3d = {
        objects: Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, kind: "sphere" as const })),
        relationships: [],
        animations: [],
      };
      s.limits.maxObjects = 1;
    },
    expectedReasonPrefixes: ["count_exceeded"],
  },
  {
    name: "trust.engineId disagrees with simulation.engineId",
    needsSimulation: true,
    apply: (s) => {
      s.trust.engineId = s.simulation!.engineId === "orbits" ? "pendulum" : "orbits";
    },
    expectedReasonPrefixes: ["inconsistent_engine", "incompatible_engine"],
  },
  {
    name: "NaN in a numeric field (object form; JSON cannot carry NaN)",
    needsSimulation: false,
    apply: (s) => {
      (s.renderer as unknown as { preferredAspectRatio: number }).preferredAspectRatio = Number.NaN;
    },
    expectedReasonPrefixes: ["invalid_type", "range_exceeded"],
  },
];

describe("RED-TEAM: every hostile mutation is rejected or repaired with a reason", () => {
  it.each(showcaseSpecs().map((s, i) => [i, s] as const))(
    "showcase #%i is a clean baseline (validates)",
    (_i, spec) => {
      const outcome = validateDemoSpec(spec);
      expect(["valid", "repaired"]).toContain(outcome.status);
    },
  );

  it.each(MUTATIONS)("mutation '$name' is rejected or repaired with a reason", ({ needsSimulation, apply, expectedReasonPrefixes }) => {
    const seeds = [...generatedSpecs(), ...showcaseSpecs()].filter(
      (s) => !needsSimulation || s.simulation !== undefined,
    );
    expect(seeds.length).toBeGreaterThanOrEqual(3);
    for (const seed of seeds) {
      const spec = clone(seed);
      apply(spec);
      const outcome = validateDemoSpec(spec);
      expect(["rejected", "repaired"]).toContain(outcome.status);
      expect(outcome.reasons.length).toBeGreaterThan(0);
      const hit = outcome.reasons.some((r) =>
        expectedReasonPrefixes.some((prefix) => r === prefix || r.startsWith(`${prefix}:`)),
      );
      expect(hit).toBe(true);
    }
  });

  it("mutated specs never crash the scene-graph builder (repair path is safe)", () => {
    for (const { needsSimulation, apply } of MUTATIONS) {
      const seeds = [...generatedSpecs(), ...showcaseSpecs()].filter(
        (s) => !needsSimulation || s.simulation !== undefined,
      );
      for (const seed of seeds) {
        const spec = clone(seed);
        apply(spec);
        const outcome = validateDemoSpec(spec);
        if (outcome.spec) {
          expect(() => buildSceneGraph(outcome.spec!)).not.toThrow();
          const { graph, reasons } = buildSceneGraph(outcome.spec!);
          expect(graph).toBeDefined();
          expect(Array.isArray(reasons)).toBe(true);
        }
      }
    }
  });

  it("repaired specs round-trip through validateDemoSpec (idempotent repair)", () => {
    const spec = clone(generatedSpecs()[0]);
    spec.simulation!.parameters[0].value = 1e9; // needs repair
    const first = validateDemoSpec(spec);
    expect(first.status).toBe("repaired");
    const second = validateDemoSpec(first.spec!);
    expect(["valid", "repaired"]).toContain(second.status);
  });
});

describe("RED-TEAM: showcases render into scene graphs", () => {
  it("every showcase (Level 1, hybrid, scene3d) builds a graph", () => {
    for (const spec of showcaseSpecs()) {
      const { graph, reasons } = buildSceneGraph(spec);
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.limits.maxObjects).toBeGreaterThan(0);
      expect(Array.isArray(reasons)).toBe(true);
    }
  });

  it("buildSceneGraph never throws on hostile-but-plausible input", () => {
    const hostile: DemoSpecV1 = {
      ...clone(generatedSpecs()[0]),
      scene3d: {
        objects: [
          {
            id: "a",
            kind: "sphere",
            color: "url(javascript:alert(1))",
            position: { x: 1e12, y: -1e12, z: Number.NaN },
          },
        ],
        relationships: [{ id: "r", type: "attracts", from: "missing", to: "a" }],
        animations: [{ id: "an", target: "ghost", operator: "rotate", speed: 1e9, axis: "w" as never }],
      },
    };
    expect(() => buildSceneGraph(hostile)).not.toThrow();
    const { graph, reasons } = buildSceneGraph(hostile);
    expect(graph).toBeDefined();
    expect(reasons.length).toBeGreaterThan(0); // hostile input must produce reasons
  });
});
