/**
 * presentation-pipeline.test.ts — Wave-4b MUST-FIX 1 + 4 regression suite for
 * the WIRED presentation pipeline (the seam the red team found missing):
 *
 *   buildSceneGraph (deterministic layout) → runGeometryGate → checkScene
 *
 * exactly as the renderer runs it at setSpec (renderer-exact graphMode:
 * engine-coupled showcases are non-graph). Coverage:
 *
 *   1. Corpus pinning: every STRESS_CORPUS `expect` block is asserted against
 *      the ACTUAL runner output (critical/major/minor counts + reasons) —
 *      the corpus is the regression contract D1 demanded ("regenerated against
 *      pipeline output"), never a description of a pipeline that doesn't exist.
 *   2. Shipped content gate: all 10 conceptual templates + 3 showcases pass
 *      I1–I5 (critical/major = 0) through the wired gate — the e2e's pure gate
 *      run contract, unit-level.
 *   3. Red-team repro regressions (red-team-wave4.md W2–W6/W10/W11): each
 *      attack spec must be gate-clean or reach the documented degrade path
 *      (loud reasons — gate_I{n}_violations + gate_unverified — never silent).
 */

import { describe, expect, it } from "vitest";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { CONCEPTUAL_TEMPLATE_IDS } from "@/demonstrations/spec/demo-spec";
import { buildSceneGraph, isGraphLikeScene } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import { runGeometryGate } from "@/demonstrations/renderers/primitive-3d/presentation/pipeline";
import { engineMappingForSpec } from "@/demonstrations/showcases/coupling";
import { buildConceptualSpec } from "@/demonstrations/generation/offline/template-builder";
import { createDefaultPreferences } from "@/domain/learner";
import { buildOrbitsShowcase } from "@/demonstrations/showcases/orbits/build-spec";
import { buildElectricFieldShowcase } from "@/demonstrations/showcases/electric-fields/build-spec";
import { buildWaveInterferenceShowcase } from "@/demonstrations/showcases/wave-interference/build-spec";
import { makeSpec, STRESS_CORPUS } from "./presentation-gate.corpus";
import { nodeEnvelope, ENVELOPE_CLEARANCE } from "@/demonstrations/renderers/primitive-3d/geometry/envelopes";

// ---------------------------------------------------------------------------
// Harness — the renderer's exact setSpec path (renderer.ts setSpec)
// ---------------------------------------------------------------------------

function runPipeline(spec: DemoSpecV1) {
  const { graph, reasons } = buildSceneGraph(spec, { mobile: false });
  const graphMode =
    engineMappingForSpec(spec) === null && isGraphLikeScene(graph);
  const pres = runGeometryGate(graph, { graphMode });
  return { graph, graphMode, reasons, pres };
}

function majorViolations(pres: ReturnType<typeof runPipeline>["pres"]) {
  return pres.gate.violations.filter(
    (v) => v.severity === "critical" || v.severity === "major"
  );
}

// ---------------------------------------------------------------------------
// 1. Corpus pinned to the ACTUAL pipeline (MUST-FIX 1)
// ---------------------------------------------------------------------------

describe("stress corpus — pinned to the wired pipeline (MUST-FIX 1)", () => {
  for (const entry of STRESS_CORPUS) {
    it(`${entry.id}: pipeline outcome matches the pinned expectation`, () => {
      const { reasons, pres } = runPipeline(entry.spec);
      const critical = pres.gate.violations.filter((v) => v.severity === "critical").length;
      const major = pres.gate.violations.filter((v) => v.severity === "major").length;
      const minor = pres.gate.violations.filter((v) => v.severity === "minor").length;
      expect(critical).toBe(entry.expect.critical);
      expect(major).toBe(entry.expect.major);
      expect(minor).toBe(entry.expect.minor);
      // Every pinned reason surfaces in the gate violations OR the pipeline
      // reasons (the same contract D2's e2e gate run asserts).
      const gateReasons = new Set(pres.gate.violations.map((v) => v.reason));
      const pipelineReasons = new Set([...reasons, ...pres.reasons]);
      for (const reason of entry.expect.reasons) {
        expect(
          gateReasons.has(reason) || pipelineReasons.has(reason),
          `${entry.id}: expected reason "${reason}" to surface`,
        ).toBe(true);
      }
      // Unpinned documented limitations still fail loudly — never silent.
      if (entry.documentedLimitation) {
        const majors = majorViolations(pres);
        if (majors.length > 0) {
          expect(pres.reasons).toContain("gate_unverified");
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Shipped content: templates + showcases gate-clean through the wiring
// ---------------------------------------------------------------------------

describe("wired gate — shipped templates + showcases are gate-clean", () => {
  const specs = [
    ...CONCEPTUAL_TEMPLATE_IDS.map((id) =>
      buildConceptualSpec(id, id, id, createDefaultPreferences())
    ),
    buildOrbitsShowcase(),
    buildElectricFieldShowcase(),
    buildWaveInterferenceShowcase(),
  ];

  for (const spec of specs) {
    it(`${spec.id}: ok === true (no critical/major violations)`, () => {
      const { pres } = runPipeline(spec);
      const majors = majorViolations(pres);
      expect(
        majors.map((v) => `[${v.invariant}/${v.severity}] ${v.reason} (${v.id})`),
        `${spec.id} must pass I1–I5`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Red-team repro regressions (W2–W6, W10, W11)
// ---------------------------------------------------------------------------

const sphere = (
  id: string,
  x: number,
  y: number,
  z = 0,
  size = 1,
  label?: string
) => ({
  id,
  kind: "sphere" as const,
  position: { x, y, z },
  size,
  ...(label ? { label } : {}),
});

describe("red-team repro regressions (MUST-FIX 4/5 + in-scope items)", () => {
  it("W2: 7 coincident size-1 spheres resolve to gate-clean (was 2 residual I1)", () => {
    const spec = makeSpec(
      "w2_coincident7",
      [
        sphere("n1", 0, 0, 0), sphere("n2", 0, 0, 0), sphere("n3", 0, 0, 0),
        sphere("n4", 0, 0, 0), sphere("n5", 0, 0, 0), sphere("n6", 0, 0, 0),
        sphere("n7", 0, 0, 0),
      ],
      [{ id: "r1", type: "causes", from: "n1", to: "n2" }]
    );
    const { graph, pres, reasons } = runPipeline(spec);
    expect(majorViolations(pres)).toEqual([]);
    expect(reasons).toContain("layout_repaired");
    // I1 at the layout level: every pair clear of the envelope boundary.
    const nodes = graph.nodes.filter((n) => n.kind === "sphere");
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodeEnvelope(nodes[i]);
        const b = nodeEnvelope(nodes[j]);
        if (a.kind !== "sphere" || b.kind !== "sphere") continue;
        const gap =
          Math.hypot(
            a.center.x - b.center.x,
            a.center.y - b.center.y,
            a.center.z - b.center.z
          ) - (a.radius + b.radius);
        expect(gap).toBeGreaterThanOrEqual(ENVELOPE_CLEARANCE - 1e-4);
      }
    }
  });

  it("W3: 7 size-5 nodes at 1u spacing resolve to gate-clean (was 6 residual I1, penetration 2.45)", () => {
    const spec = makeSpec(
      "w3_size5_chain",
      [
        ...Array.from({ length: 7 }, (_, i) => sphere(`n${i}`, i - 3, 0, 0, 5)),
      ],
      [{ id: "r1", type: "causes", from: "n0", to: "n1" }]
    );
    const { graph, pres, reasons } = runPipeline(spec);
    expect(majorViolations(pres)).toEqual([]);
    // The grid fallback fired (7 stuck units ≥ GRID_FALLBACK_MIN_UNITS 4).
    expect(reasons).toContain("layout_grid_fallback");
    const nodes = graph.nodes.filter((n) => n.kind === "sphere");
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodeEnvelope(nodes[i]);
        const b = nodeEnvelope(nodes[j]);
        if (a.kind !== "sphere" || b.kind !== "sphere") continue;
        const gap =
          Math.hypot(
            a.center.x - b.center.x,
            a.center.y - b.center.y,
            a.center.z - b.center.z
          ) - (a.radius + b.radius);
        expect(gap).toBeGreaterThanOrEqual(ENVELOPE_CLEARANCE - 1e-4);
      }
    }
  });

  it("W4: 25-node 5×5 grid with 120-char labels reaches the documented degrade path (was 2 I1 + 15 I3)", () => {
    const spec = makeSpec(
      "w4_grid25",
      [
        ...Array.from({ length: 25 }, (_, i) =>
          sphere(`n${i}`, (i % 5) - 2, Math.floor(i / 5) - 2, 0, 1, "A".repeat(120))
        ),
      ],
      [{ id: "r1", type: "causes", from: "n0", to: "n1" }]
    );
    const { reasons, pres } = runPipeline(spec);
    // The degrade chain ran: grid reflow → shorten labels → suppress edge
    // labels → residual recorded — all surfaced loudly.
    expect(reasons).toContain("layout_grid_fallback");
    expect(reasons).toContain("layout_labels_shortened");
    expect(reasons).toContain("layout_edge_labels_suppressed");
    expect(reasons).toContain("layout_collision_remaining");
    expect(reasons).toContain("layout_iterations_capped");
    // The runner's I3 shorten+re-place degrade also ran (surfaced loudly).
    expect(pres.reasons).toContain("gate_label_shortened");
    // The residual is SURFACED loudly — never silent.
    const majors = majorViolations(pres);
    expect(majors.length).toBeGreaterThan(0);
    expect(pres.reasons).toContain("gate_unverified");
    const i1 = majors.filter((v) => v.invariant === "I1");
    const i3 = majors.filter((v) => v.invariant === "I3");
    expect(i1.length + i3.length).toBe(majors.length);
    // Pinned deterministic residuals (MUST-FIX 1 re-pin to the ACTUAL runner
    // output): 3 I1 pairs + 4 I3 label majors. The 1u grid exhausts every
    // anchor for the interior nodes (above/right/left/below all collide with
    // neighbor envelopes), and the shorten degrade cannot shrink a glyph
    // rect that is already at the sprite width cap — anchor exhaustion is
    // unrepairable by simplification at this density. The gate reports it
    // loudly (gate_I1_violations + gate_I3_violations + gate_unverified);
    // documented-limitation (authoring stress fixture, not shipped content —
    // all 10 shipped templates are gate-clean).
    expect(i1.length).toBe(3);
    expect(i3.length).toBe(4);
    expect(pres.reasons).toContain("gate_I1_violations");
    expect(pres.reasons).toContain("gate_I3_violations");
  });

  it("W5: orbit-target wedge — the movable moon escapes, the fixed star×planet residual surfaces loudly (was 3 I1 + I2 + I3)", () => {
    const spec = makeSpec(
      "w5_orbit_wedge",
      [
        { id: "star", kind: "sphere", position: { x: 0, y: 0, z: 0 }, size: 2 },
        { id: "planet", kind: "sphere", position: { x: 1, y: 0, z: 0 }, size: 1 },
        { id: "moon", kind: "sphere", position: { x: 0.2, y: 0, z: 0 }, size: 1 },
      ],
      [{ id: "rel", type: "orbits", from: "planet", to: "star" }],
      [
        {
          id: "a1", target: "planet", operator: "orbit",
          speed: 1, delayMs: 0, amplitude: 1, axis: "y",
        },
      ]
    );
    const { graph, reasons, pres } = runPipeline(spec);
    const majors = majorViolations(pres);
    // The wedge breaker (Phase C2) freed the moon — it must be clear of the
    // star and the planet (the movable that was stuck in net-zero repulsion).
    const moon = graph.nodes.find((n) => n.id === "moon")!;
    const star = graph.nodes.find((n) => n.id === "star")!;
    const planet = graph.nodes.find((n) => n.id === "planet")!;
    const moonEnv = nodeEnvelope(moon);
    const starEnv = nodeEnvelope(star);
    const planetEnv = nodeEnvelope(planet);
    if (moonEnv.kind === "sphere" && starEnv.kind === "sphere") {
      const d = Math.hypot(
        moonEnv.center.x - starEnv.center.x,
        moonEnv.center.y - starEnv.center.y
      );
      expect(d).toBeGreaterThanOrEqual(moonEnv.radius + starEnv.radius + ENVELOPE_CLEARANCE - 1e-4);
    }
    if (moonEnv.kind === "sphere" && planetEnv.kind === "sphere") {
      const d = Math.hypot(
        moonEnv.center.x - planetEnv.center.x,
        moonEnv.center.y - planetEnv.center.y
      );
      expect(d).toBeGreaterThanOrEqual(moonEnv.radius + planetEnv.radius + ENVELOPE_CLEARANCE - 1e-4);
    }
    // Physics bodies never move (fixed × fixed): the star×planet overlap is a
    // forbidden-repair residual — reported loudly, never a body move.
    expect(star.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(planet.position).toEqual({ x: 1, y: 0, z: 0 });
    const starPlanet = majors.filter(
      (v) => v.invariant === "I1" && (v.id === "star" || v.id === "planet")
    );
    expect(starPlanet.length).toBeGreaterThan(0);
    expect(pres.reasons).toContain("gate_unverified");
    expect(reasons).toContain("layout_iterations_capped");
    // No I2/I3 survivors from the wedge (the moon no longer sits on the
    // star→planet line).
    expect(majors.filter((v) => v.invariant === "I2" || v.invariant === "I3")).toEqual([]);
  });

  it("W6: 13-node chain + chained packets — short-edge I4 eliminated; residual I2 reaches the routing-bound degrade (was 4 I2 + 10 I3 + 17 I4)", () => {
    const spec = makeSpec(
      "w6_chain13",
      [
        ...Array.from({ length: 13 }, (_, i) => ({
          id: `pn${i}`,
          kind: "process_node" as const,
          position: { x: i - 6, y: 0, z: 0 },
          size: 1,
        })),
        { id: "ep1", kind: "energy_packet", position: { x: -6, y: 0, z: 0 }, size: 0.3 },
        { id: "ep2", kind: "energy_packet", position: { x: -6, y: 0, z: 0 }, size: 0.3 },
      ],
      [
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `f${i}`,
          type: "flows_to" as const,
          from: `pn${i}`,
          to: `pn${i + 1}`,
        })),
        { id: "pe1", type: "flows_to", from: "ep1", to: "pn1" },
        { id: "pe2", type: "flows_to", from: "ep2", to: "pn1" },
      ],
      [
        { id: "t1", target: "ep1", operator: "translate", speed: 1.5, delayMs: 0, amplitude: 1 },
        { id: "t2", target: "ep2", operator: "translate", speed: 1.5, delayMs: 200, amplitude: 1 },
      ]
    );
    const { pres } = runPipeline(spec);
    const majors = majorViolations(pres);
    // MUST-FIX 5: no arrowhead embeds a source (was 17 I4 majors).
    expect(majors.filter((v) => v.invariant === "I4")).toEqual([]);
    // MUST-FIX 4: label pile-up is gone (was 10 I3 majors).
    expect(majors.filter((v) => v.invariant === "I3")).toEqual([]);
    // Routing-bound residual (waypoint budget): surfaced loudly, never silent.
    const i2 = majors.filter((v) => v.invariant === "I2");
    expect(i2.length).toBeGreaterThan(0);
    // edge_unroutable is emitted by the ROUTING stage inside the runner
    // (edges.ts routeEdgeWithReasons), so it rides the runner's reason list
    // (pres.reasons), not the buildSceneGraph reason list — pinned to the
    // actual contract (MUST-FIX 1 re-pin).
    expect(pres.reasons).toContain("edge_unroutable");
    expect(pres.reasons).toContain("gate_I2_violations");
    expect(pres.reasons).toContain("gate_unverified");
  });

  it("W10: >2 co-slotted packets are capped at 2 slots with a loud reason (in-scope pile-up)", () => {
    const spec = makeSpec(
      "w10_packets6",
      [
        { id: "src", kind: "sphere", position: { x: 0, y: 0, z: 0 }, size: 2 },
        { id: "dst", kind: "sphere", position: { x: 1.6, y: 0, z: 0 }, size: 2 },
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `ep${i}`,
          kind: "energy_packet" as const,
          position: { x: 0, y: 0, z: 0 },
          size: 0.3,
        })),
      ],
      [
        { id: "t1", type: "transfers_to", from: "src", to: "dst" },
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `pe${i}`,
          type: "transfers_to" as const,
          from: `ep${i}`,
          to: "dst",
        })),
      ],
      [
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `a${i}`,
          target: `ep${i}`,
          operator: "translate" as const,
          speed: 1.2,
          delayMs: i * 100,
          amplitude: 1,
        })),
      ]
    );
    const { graph, reasons, pres } = runPipeline(spec);
    expect(majorViolations(pres)).toEqual([]);
    expect(reasons).toContain("layout_packet_slots_capped");
    // No packet may stagger past the destination surface (was ep4–ep6 beyond
    // the dst center): every packet snap stays within the src→dst span.
    const dst = graph.nodes.find((n) => n.id === "dst")!;
    for (const n of graph.nodes) {
      if (!n.id.startsWith("ep")) continue;
      expect(n.position.x).toBeGreaterThan(-3);
      expect(n.position.x).toBeLessThanOrEqual(dst.position.x);
    }
  });

  it("W11: a packet with its own outgoing flow edge snaps ON the source surface, not 0.25 inside (in-scope)", () => {
    const spec = makeSpec(
      "w11_packet_selfchain",
      [
        { id: "pn1", kind: "process_node", position: { x: -3, y: 0, z: 0 }, size: 1 },
        { id: "pn2", kind: "process_node", position: { x: 0, y: 0, z: 0 }, size: 1 },
        { id: "pn3", kind: "process_node", position: { x: 3, y: 0, z: 0 }, size: 1 },
        { id: "ep1", kind: "energy_packet", position: { x: -3, y: 0, z: 0 }, size: 0.3 },
      ],
      [
        { id: "f1", type: "flows_to", from: "pn1", to: "pn2" },
        { id: "f2", type: "flows_to", from: "pn2", to: "pn3" },
        { id: "r0", type: "flows_to", from: "ep1", to: "pn2" },
      ],
      [
        { id: "a1", target: "ep1", operator: "translate", speed: 1.5, delayMs: 0, amplitude: 1 },
      ]
    );
    const { graph, pres } = runPipeline(spec);
    expect(majorViolations(pres)).toEqual([]);
    const ep1 = graph.nodes.find((n) => n.id === "ep1")!;
    const pn1 = graph.nodes.find((n) => n.id === "pn1")!;
    const d = Math.hypot(
      ep1.position.x - pn1.position.x,
      ep1.position.y - pn1.position.y,
      ep1.position.z - pn1.position.z
    );
    // pn1 exit surface: r_src + r_pkt + PATH_CLEARANCE = 0.75 — the packet
    // envelope sits ON the source surface (never inside it).
    expect(d).toBeCloseTo(0.5 + 0.15 + 0.1, 9);
    expect(ep1.position.x).toBeGreaterThan(pn1.position.x);
  });
});
