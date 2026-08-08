/**
 * pipeline.test.ts — unit tests for the PRODUCTION geometry-gate runner
 * (Wave-4b MUST-FIX 1; src/…/primitive-3d/presentation/pipeline.ts).
 *
 * runGeometryGate is the production seam the renderer invokes at setSpec and
 * the 2D surface invokes at resolveLayout consumption:
 *
 *   buildSceneGraph (deterministic layout) → runGeometryGate → checkScene
 *
 * Coverage (design-2 §7.2 / MUST-FIX 1):
 *   1. clean scene → gate-clean, no gate reasons, no `gate_unverified`;
 *   2. repairable I3 (anchor-exhausted node labels) → shorten + re-place
 *      degrade fires (`gate_label_shortened`) and the gate passes — the
 *      degrade path the design calls "degrade by simplification";
 *   3. unrepairable I1/I5 stress fixtures → surfaced codes
 *      (`gate_I{n}_violations` + `gate_unverified`) — fail loudly, never a
 *      silent pass;
 *   4. corpus expectations match the runner output (every STRESS_CORPUS
 *      `expect` block asserted through runGeometryGate, the exact production
 *      entry — not a hand-built scene);
 *   5. `degrade: false` (the 2D surface's call) surfaces the same verdict
 *      without mutating the graph's labels.
 *
 * PURE pipeline runs — no Three.js, no DOM (the renderer harness lives in
 * presentation-pipeline.test.ts; this file tests the runner contract itself).
 */

import { describe, expect, it } from "vitest";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { buildSceneGraph, isGraphLikeScene } from "@/demonstrations/renderers/primitive-3d/scene-graph";
import {
  REASON_GATE_I1,
  REASON_GATE_I3,
  REASON_GATE_LABEL_SHORTENED,
  REASON_GATE_UNVERIFIED,
  runGeometryGate,
} from "@/demonstrations/renderers/primitive-3d/presentation/pipeline";
import { engineMappingForSpec } from "@/demonstrations/showcases/coupling";
import { makeSpec, STRESS_CORPUS } from "../../presentation-gate.corpus";

// ---------------------------------------------------------------------------
// Harness — the renderer's exact setSpec derivation (renderer.ts setSpec)
// ---------------------------------------------------------------------------

function runPipeline(spec: DemoSpecV1, opts?: { degrade?: boolean }) {
  const { graph, reasons } = buildSceneGraph(spec, { mobile: false });
  const graphMode =
    engineMappingForSpec(spec) === null && isGraphLikeScene(graph);
  const run = runGeometryGate(graph, {
    graphMode,
    ...(opts?.degrade !== undefined ? { degrade: opts.degrade } : {}),
  });
  return { graph, graphMode, reasons, run };
}

function majors(run: ReturnType<typeof runPipeline>["run"]) {
  return run.violations.filter(
    (v) => v.severity === "critical" || v.severity === "major"
  );
}

const sphere = (
  id: string,
  x: number,
  y: number,
  size = 1,
  label?: string
) => ({
  id,
  kind: "sphere" as const,
  position: { x, y, z: 0 },
  size,
  ...(label ? { label } : {}),
});

// ---------------------------------------------------------------------------
// 1. Clean scene — no reasons
// ---------------------------------------------------------------------------

describe("runGeometryGate — clean scene", () => {
  it("returns ok, no gate reasons, no gate_unverified", () => {
    const spec = makeSpec(
      "clean_pair",
      [sphere("a", -2, 0), sphere("b", 2, 0)],
      [{ id: "r1", type: "causes", from: "a", to: "b" }]
    );
    const { reasons, run } = runPipeline(spec);
    expect(run.ok).toBe(true);
    expect(majors(run)).toEqual([]);
    expect(run.reasons).not.toContain(REASON_GATE_I1);
    expect(run.reasons).not.toContain(REASON_GATE_I3);
    expect(run.reasons).not.toContain(REASON_GATE_UNVERIFIED);
    // Clean scenes are reason-free on the gate channel (no degrade fired).
    expect(run.reasons.filter((r) => r.startsWith("gate_"))).toEqual([]);
    expect(reasons).not.toContain("layout_repaired");
  });
});

// ---------------------------------------------------------------------------
// 2. Repairable I3 — shorten + re-place degrade repairs, reason emitted
// ---------------------------------------------------------------------------

describe("runGeometryGate — repairable I3 degrades by simplification", () => {
  it("shortens anchor-exhausted labels, re-places, and passes with gate_label_shortened", () => {
    // 5×5 grid at 1.5u with 24-char labels: the interior nodes' labels
    // cannot find a collision-free anchor at full glyph width, so the
    // placement falls back with `label_anchor_fallback` (I3 majors BEFORE
    // the degrade). The runner's shorten+re-place halving shrinks the glyph
    // rects until an anchor clears — the gate then passes (verified
    // empirically as the minimal deterministic repair case; counts pinned).
    const spec = makeSpec(
      "repairable_i3_grid",
      Array.from({ length: 25 }, (_, i) =>
        sphere(
          `n${i}`,
          (i % 5 - 2) * 1.5,
          (Math.floor(i / 5) - 2) * 1.5,
          1,
          "A".repeat(24)
        )
      ),
      [{ id: "r1", type: "causes", from: "n0", to: "n1" }]
    );
    const { run } = runPipeline(spec);
    // The degrade ran and surfaced its reason (never silent).
    expect(run.reasons).toContain(REASON_GATE_LABEL_SHORTENED);
    // The repairable class is resolved: gate-clean, no gate_unverified.
    expect(run.ok).toBe(true);
    expect(majors(run)).toEqual([]);
    expect(run.reasons).not.toContain(REASON_GATE_UNVERIFIED);
    expect(run.reasons).not.toContain(REASON_GATE_I3);
  });
});

// ---------------------------------------------------------------------------
// 3. Unrepairable — surfaced codes + gate_unverified (fail loudly)
// ---------------------------------------------------------------------------

describe("runGeometryGate — unrepairable fixtures fail loudly", () => {
  it("dense_80_lattice: mass I1 → gate_I1_violations + gate_unverified", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "dense_80_lattice")!.spec;
    const { run } = runPipeline(spec);
    expect(run.ok).toBe(false);
    const i1 = majors(run).filter((v) => v.invariant === "I1");
    expect(i1.length).toBeGreaterThan(0);
    expect(run.reasons).toContain(REASON_GATE_I1);
    expect(run.reasons).toContain(REASON_GATE_UNVERIFIED);
  });

  it("outlier_crush: unframable I5 → gate_I5_violations + gate_unverified", () => {
    const spec = STRESS_CORPUS.find((c) => c.id === "outlier_crush")!.spec;
    const { run } = runPipeline(spec);
    expect(run.ok).toBe(false);
    expect(majors(run).some((v) => v.invariant === "I5")).toBe(true);
    expect(run.reasons).toContain("gate_I5_violations");
    expect(run.reasons).toContain(REASON_GATE_UNVERIFIED);
  });
});

// ---------------------------------------------------------------------------
// 4. Corpus expectations match the runner output (the production entry)
// ---------------------------------------------------------------------------

describe("runGeometryGate — corpus expectations match the runner output", () => {
  for (const entry of STRESS_CORPUS) {
    it(`${entry.id}: pinned counts + reasons surface through the runner`, () => {
      const { reasons, run } = runPipeline(entry.spec);
      const critical = run.violations.filter((v) => v.severity === "critical").length;
      const major = run.violations.filter((v) => v.severity === "major").length;
      const minor = run.violations.filter((v) => v.severity === "minor").length;
      expect(critical).toBe(entry.expect.critical);
      expect(major).toBe(entry.expect.major);
      expect(minor).toBe(entry.expect.minor);
      // Same contract as presentation-pipeline.test.ts: every pinned reason
      // surfaces in the gate violations OR the pipeline reasons (buildSceneGraph
      // reasons + runner reasons — the two channels production surfaces).
      const gateReasons = new Set(run.violations.map((v) => v.reason));
      const pipelineReasons = new Set([...reasons, ...run.reasons]);
      for (const reason of entry.expect.reasons) {
        expect(
          gateReasons.has(reason) || pipelineReasons.has(reason),
          `${entry.id}: expected reason "${reason}" to surface`,
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 5. degrade: false — the 2D surface's call (same verdict, no mutation)
// ---------------------------------------------------------------------------

describe("runGeometryGate — degrade: false (2D surface parity)", () => {
  it("surfaces the same gate verdict without shortening the graph's labels", () => {
    const spec = makeSpec(
      "repairable_i3_grid",
      Array.from({ length: 25 }, (_, i) =>
        sphere(
          `n${i}`,
          (i % 5 - 2) * 1.5,
          (Math.floor(i / 5) - 2) * 1.5,
          1,
          "A".repeat(24)
        )
      ),
      [{ id: "r1", type: "causes", from: "n0", to: "n1" }]
    );
    // non-degraded run on a FRESH graph (the 2D surface consumes its own
    // laid-out graph — mutation must not leak into it)
    const { graph } = buildSceneGraph(spec, { mobile: false });
    const graphMode =
      engineMappingForSpec(spec) === null && isGraphLikeScene(graph);
    const noDegrade = runGeometryGate(graph, { graphMode, degrade: false });

    // The 2D surface's call does NOT shorten labels (its own spread handles
    // 2D projection residuals; 2D geometry behavior is unchanged).
    const longLabels = graph.nodes.filter((n) => n.label?.length === 24);
    expect(longLabels.length).toBe(25);

    // Same verdict shape as the renderer path, but the repairable I3 class
    // is NOT repaired (no mutation → placement stays colliding) and the
    // residual is surfaced loudly — the 2D surface reports what the 3D
    // surface degrades.
    expect(noDegrade.reasons).not.toContain(REASON_GATE_LABEL_SHORTENED);
    expect(noDegrade.ok).toBe(false);
    expect(noDegrade.reasons).toContain(REASON_GATE_I3);
    expect(noDegrade.reasons).toContain(REASON_GATE_UNVERIFIED);
  });
});
