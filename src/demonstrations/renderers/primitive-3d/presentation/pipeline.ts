/**
 * presentation/pipeline.ts — the PRODUCTION geometry-gate runner
 * (Wave-4b MUST-FIX 1; design-2 §7.2; PROGRAM.md "fail loudly / degrade by
 * simplification").
 *
 * The single production entry point for the gate:
 *
 *   buildSceneGraph (deterministic layout) → runGeometryGate → checkScene
 *
 * runGeometryGate(graph, opts) → { violations, reasons }
 *
 *   1. DEGRADE-BY-SIMPLIFICATION first (deterministic, reason-carrying):
 *      - I3 repairable: node-label overlaps → shorten the violating labels
 *        and re-place (bounded passes; `shortenGateLabels`). Labels that
 *        still collide keep rendering (labels.test.ts pins that policy) and
 *        the residual is reported by the gate, never silent.
 *      - I4 repairable: edges shorter than r_s + r_t + headLen have their
 *        arrowheads suppressed with `edge_head_suppressed_short_edge`
 *        (edges.ts / F2's edge handling; the I4 checker skips suppressed
 *        heads — the suppression reason is the loud surface).
 *   2. ASSEMBLE the GateScene exactly as the renderer renders it
 *      (resolvePresentation: node-label placement → edge routing →
 *      edge-label placement → camera framing) and run checkScene (I1–I5 +
 *      informational checkers) on the laid-out scene.
 *   3. SURFACE the verdict: placement reasons (ellipsis, anchor fallbacks,
 *      edge-label skips/density, routing blocks) joined with violation-
 *      derived gate codes — one `gate_I{n}_violations` per invariant with
 *      any critical/major breach (never silent).
 *   4. UNREPAIRABLE residuals emit `gate_unverified` — the scene renders
 *      with a documented residual, never a silent pass.
 *
 * The renderer calls this at setSpec (before buildScene so the built scene
 * carries the degraded labels) and joins `.reasons` into its lastReasons
 * surface; the 2D surface calls it with `degrade: false` (same verdict,
 * no label mutation — its own spread handles 2D projection residuals).
 *
 * PURE TS: no Three.js, no DOM. The graph is READ-ONLY unless `degrade` is
 * true (the I3 shorten step mutates the labels of the graph the caller is
 * about to build — the renderer's contract).
 */

import type { SceneGraph } from "../types";
import {
  REASON_GATE_LABEL_SHORTENED,
  resolvePresentation,
  shortenGateLabels,
  type PresentationOptions,
} from "./resolve-presentation";
import { isGraphLikeScene } from "../scene-graph";
import {
  REASON_GATE_I1,
  REASON_GATE_I2,
  REASON_GATE_I3,
  REASON_GATE_I4,
  REASON_GATE_I5,
  REASON_GATE_UNVERIFIED,
  type GateResult,
  type GateScene,
  type Violation,
} from "../geometry-gate";

export interface GeometryGateRunOptions {
  /** Graph mode (derived from the graph when omitted). */
  graphMode?: boolean;
  /** Build-time aspect (defaults to the stage-enforced 4/3). */
  aspect?: number;
  /**
   * Run the repairable-I3 shorten/re-place degrade before the verdict.
   * Default TRUE (the renderer path — the built scene must carry the
   * shortened labels). The 2D surface passes `false`: it surfaces the same
   * gate verdict without mutating its laid-out graph.
   */
  degrade?: boolean;
  /** MUST-FIX 5 parity: mark short edges headSuppressed (default true). */
  suppressShortHeads?: boolean;
}

export interface GeometryGateRun {
  /** All checkScene violations (I1–I5 + INFO), sorted (invariant, severity). */
  violations: Violation[];
  /** Placement + gate-derived reasons in pipeline order, deduped per code
   * where the pipeline emits one code per event (violation-derived codes are
   * emitted once per invariant). `gate_unverified` present iff any
   * critical/major violation remains after the degrade steps. */
  reasons: string[];
  /** true iff checkScene passes every invariant (I1–I5, no critical/major). */
  ok: boolean;
  /** The assembled gate scene (design-2 §7.1) the verdict was computed on. */
  scene: GateScene;
  /** The raw checkScene result. */
  gate: GateResult;
  graphMode: boolean;
}

/**
 * The production gate runner (see file header). Runs the repairable degrades,
 * assembles the GateScene exactly as the renderer renders it, runs checkScene,
 * and returns the surfaced verdict.
 */
export function runGeometryGate(
  graph: SceneGraph,
  opts?: GeometryGateRunOptions
): GeometryGateRun {
  const graphMode = opts?.graphMode ?? isGraphLikeScene(graph);
  const aspect = opts?.aspect;
  const degrade = opts?.degrade !== false;
  const suppressShortHeads = opts?.suppressShortHeads ?? true;

  const reasons: string[] = [];
  if (degrade) {
    // I3 repairable: shorten + re-place colliding node labels. Must run
    // before the gate verdict AND before the caller builds its scene.
    reasons.push(...shortenGateLabels(graph, graphMode));
  }

  const pres = resolvePresentation(graph, {
    graphMode,
    ...(aspect !== undefined ? { aspect } : {}),
    suppressShortHeads,
  });
  reasons.push(...pres.reasons);

  return {
    violations: pres.gate.violations,
    reasons,
    ok: pres.gate.ok,
    scene: pres.scene,
    gate: pres.gate,
    graphMode,
  };
}

export {
  REASON_GATE_I1,
  REASON_GATE_I2,
  REASON_GATE_I3,
  REASON_GATE_I4,
  REASON_GATE_I5,
  REASON_GATE_UNVERIFIED,
  REASON_GATE_LABEL_SHORTENED,
};
