/**
 * debug-seam.ts — the Wave-2 browser test seam (e2e/orbit-learning.spec.ts,
 * dependency #1): `window.__unseenlabScene`, a read-only handle updated at
 * <=10Hz while a primitive_3d / hybrid stage is mounted on /demos/[id].
 *
 * Shape (exact contract consumed by the spec):
 *   {
 *     trail:  { points: {x,y,z}[],        // world-space history ring
 *               epoch: number },          // ++ on every re-aim/clear (T2)
 *     objects: [{ id, label,              // "star"/"planet", labels
 *                 projected: {x,y},       // CSS px, canvas coords
 *                 projectedRadiusPx }],   // C1
 *     camera: { reframed: boolean, reframeCount: number },   // C4
 *     engine: { classification: "bound" | "escape" | null }, // P6
 *   }
 *
 * The renderer composes the payload (it owns the trail runtimes, the label
 * projections, the camera status and the engine state); this module owns the
 * window handle, the <=10Hz poll cadence and the pure physics-honesty
 * classification (root-cause §6: honest escape labeling — an escape is never
 * presented as a bound orbit).
 */

import type { EngineVisualState } from "@/demonstrations/renderers/lumina-2d/types";

/** Update cadence: 100ms -> at most 10 writes/second (e2e contract). */
export const SEAM_INTERVAL_MS = 100;

/**
 * The engine's escape regime (root-cause §2/P2, PIN): launch speed >= sqrt(2)
 * is a TRUE escape — the engine never clamps, so the regime is exact for the
 * curated and the AI-composed path alike.
 */
export const ESCAPE_SPEED_MIN = Math.SQRT2;

/** Radial-growth tolerance in engine units. Bound orbits never exceed their
 * launch (apoapsis) distance; an escape at the curated regime grows ~12
 * engine units/s, so a 0.5-unit margin is far below honest escape motion and
 * far above numerical wobble. */
const RADIAL_GROWTH_EPS = 0.5;

// ---------------------------------------------------------------------------
// Seam types (mirror the e2e contract exactly)
// ---------------------------------------------------------------------------

export interface SceneSeamTrail {
  /** World-space history ring of the primary (engine-coupled) body. */
  points: Array<{ x: number; y: number; z: number }>;
  /** Monotone re-aim epoch — ++ on every re-aim/clear (T2). */
  epoch: number;
}

export interface SceneSeamObject {
  id: string;
  label: string;
  /** Projected anchor in canvas CSS px (y down) — the label overlay anchor. */
  projected: { x: number; y: number };
  /**
   * E1 (final gate, additive): the OBJECT BODY's projected position in canvas
   * CSS px (y down) — the runtime node's world position through the live
   * camera, i.e. exactly where the mesh renders. The label anchor (`projected`)
   * flips above/right/left/below and is NOT a hover target; `body` is (the
   * e2e hover probes track it). Absent when the body is outside the frustum.
   */
  body?: { x: number; y: number };
  /** The object's world radius projected to CSS px at the live camera. */
  projectedRadiusPx: number;
}

export interface SceneSeamCamera {
  reframed: boolean;
  reframeCount: number;
  /**
   * The CURRENT perspective orbit distance (world units) of the live camera —
   * the engine-anchored frame the renderer applied (Wave-4b P2-1): the build
   * frame after setSpec and every engine-state/reframe push. Exposed so the
   * product's ACTUAL initial frame can be pinned (the A22 hostile Q1 floor
   * test runs the real setSpec → buildScene → frameCamera path and asserts
   * the orbit disc >= 5% contract on this distance). Additive: existing
   * consumers read only reframed/reframeCount.
   */
  distance: number;
}

export interface SceneSeamEngine {
  /**
   * Honest bound/escape classification, or null when the seam cannot know
   * (no engine state / no speed parameter — the UI stays honestly silent).
   * An escape is never labeled "bound"/orbiting.
   */
  classification: "bound" | "escape" | null;
}

export interface SceneSeam {
  trail: SceneSeamTrail;
  objects: SceneSeamObject[];
  camera: SceneSeamCamera;
  engine: SceneSeamEngine;
}

declare global {
  interface Window {
    /** Read-only browser-test seam (set while a 3D stage is mounted). */
    __unseenlabScene?: SceneSeam;
  }
}

// ---------------------------------------------------------------------------
// Bound/escape classification (pure; root-cause §6 — honest escape)
// ---------------------------------------------------------------------------
//
// Rule (conservative and honest): "escape" requires BOTH that the engine is
// in its escape regime (launch-speed parameter >= sqrt(2) — a true escape,
// physics PIN) AND that the body's radial distance is observed growing
// monotonically past the launch distance (a bound orbit never exceeds its
// apoapsis; an escape grows past it). Regime reached but outward growth not
// yet observed -> null (honest unknown — never a premature "bound"). Regime
// not reached -> "bound". Missing regime data -> null.

/** Per-renderer radial-distance tracker for the classification. */
export interface EscapeTracker {
  /** Engine epoch the tracker is calibrated on (null = unknown). */
  epoch: number | null;
  /** Radial distance at the last re-aim (launch distance, engine units). */
  launchDistance: number | null;
  /** Radial distance at the previous sample (monotonicity check). */
  prevDistance: number | null;
  /** Farthest radial distance seen in the current epoch. */
  maxDistance: number | null;
  /** False once a sample dropped below the previous one (bound oscillation). */
  monotone: boolean;
}

export function createEscapeTracker(): EscapeTracker {
  return {
    epoch: null,
    launchDistance: null,
    prevDistance: null,
    maxDistance: null,
    monotone: true,
  };
}

/**
 * Classify the engine's trajectory as bound or escaping. `tracker` holds the
 * radial-distance series across polls and is (re-)calibrated whenever the
 * engine epoch flips (a re-aim resets the launch distance).
 */
export function classifyOrbitEscape(
  state: EngineVisualState | null,
  tracker: EscapeTracker
): "bound" | "escape" | null {
  const bodies = state?.bodies;
  if (!bodies) return null;
  // The primary moving body: "planet" when present, else any non-star body.
  const bodyKey = bodies["planet"]
    ? "planet"
    : Object.keys(bodies).find((k) => k !== "star");
  if (!bodyKey) return null;
  const body = bodies[bodyKey];
  if (!body) return null;
  // Radial distance relative to the star body (the star drifts slightly —
  // the two bodies orbit the shared barycenter).
  const star = bodies["star"];
  const rx = star ? body.x - star.x : body.x;
  const ry = star ? body.y - star.y : body.y;
  const radial = Math.hypot(rx, ry);
  const epoch = typeof state.epoch === "number" ? state.epoch : null;
  const calibrated = tracker.prevDistance !== null;
  if (!calibrated || (epoch !== null && epoch !== tracker.epoch)) {
    // (Re-)calibrate on the current epoch: the launch distance is the
    // engine's distance parameter at the last re-aim.
    tracker.epoch = epoch;
    tracker.launchDistance =
      typeof state.distance === "number" ? state.distance : radial;
    tracker.prevDistance = radial;
    tracker.maxDistance = radial;
    tracker.monotone = true;
  } else {
    if (radial < (tracker.prevDistance ?? radial) - RADIAL_GROWTH_EPS) {
      tracker.monotone = false;
    }
    tracker.prevDistance = radial;
    tracker.maxDistance = Math.max(tracker.maxDistance ?? radial, radial);
  }
  const speed = typeof state.speed === "number" ? state.speed : null;
  if (speed === null) return null; // regime unknown — honest absence
  if (speed < ESCAPE_SPEED_MIN) return "bound";
  if (
    tracker.monotone &&
    tracker.maxDistance !== null &&
    tracker.launchDistance !== null &&
    tracker.maxDistance > tracker.launchDistance + RADIAL_GROWTH_EPS
  ) {
    return "escape";
  }
  // The regime says escape is in progress but outward growth is not yet
  // observed — honest "unknown" (never label it a bound orbit).
  return null;
}

// ---------------------------------------------------------------------------
// Window handle installation (<=10Hz poll)
// ---------------------------------------------------------------------------

/** The renderer surface the seam polls (structural — no renderer import). */
export interface SceneSeamSource {
  getSceneSeam(): SceneSeam | null;
}

/**
 * Install the debug seam: poll the renderer at <=10Hz and mirror its payload
 * onto `window.__unseenlabScene`. Returns a detach that stops the poller and
 * removes the handle (the renderer calls this on dispose).
 *
 * Timer-based (setInterval), NOT rAF: the unit suites drive the renderer
 * through a fake rAF queue where one callback is shifted per "frame" — a
 * seam callback in that queue would steal the renderer's own frame tick and
 * freeze animation (renderer-coupling pin). A 100ms interval is independent
 * of the fake queue, cheap (the payload is null while no scene is ready),
 * and always cleared by the detach. Never throws.
 */
export function installSceneSeam(source: SceneSeamSource): () => void {
  if (typeof window === "undefined") return () => {};
  let disposed = false;
  // window.setInterval returns a number in the DOM lib (the Node global
  // returns Timeout) — pin the DOM form explicitly.
  let timerId: number | null = null;

  const write = () => {
    if (disposed) return;
    const seam = source.getSceneSeam();
    if (seam) window.__unseenlabScene = seam;
  };

  // Prime the handle immediately (the stage builds the scene synchronously
  // after constructing the renderer, so the first poll sees it).
  write();
  timerId = window.setInterval(write, SEAM_INTERVAL_MS);

  return () => {
    disposed = true;
    if (timerId !== null) window.clearInterval(timerId);
    timerId = null;
    delete window.__unseenlabScene;
  };
}
