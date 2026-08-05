/**
 * Replay-restore coupling tests — canonical-state restore + representation
 * switching invariants (Gate 3 closure, agent 07).
 *
 * The UI replay mechanism restores a trial's PARAMETERS (demo-store
 * TrialRecord.parameters → handleReplayTrial → runner.reset() + setParam;
 * honestly labeled in the replay banner). The engines additionally expose
 * full-state serializeState()/restoreState(). Both paths must reproduce the
 * SAME canonical engine visual state — the state the readouts, the 2D view
 * and the coupled 3D stage all read — otherwise a replay could show values
 * that differ from the recorded trial.
 *
 * What is verified:
 *  - full-state round trip: serializeState() → restoreState() reproduces
 *    getVisualState() and getReadouts() exactly, for all three coupled
 *    engines (orbits / charges / waves), and the restored module continues
 *    identically,
 *  - pointer-dragged charge positions survive the round trip (the drag is
 *    canonical body state, not a UI-side value),
 *  - the 2D consumer is read-only: draw() never mutates the canonical state
 *    (mounting or drawing a representation cannot create or destroy state —
 *    switching 3D ↔ 2D after manipulation therefore cannot change values),
 *  - parameter-only restore (the exact UI replay path: reset() + setParameter
 *    per key) reproduces the same canonical state as a from-scratch run with
 *    those parameters.
 */

import { describe, expect, it } from "vitest";
import { createModule } from "@/demonstrations/renderers/lumina-2d/registry";
import type {
  EngineVisualState,
  SimContext,
  SimPointer,
  SimulationModule,
} from "@/demonstrations/renderers/lumina-2d/types";

const COUPLED_IDS = ["orbits", "charges", "waves"] as const;

function makeCtx(w = 800, h = 600): SimContext {
  return { width: w, height: h, dpr: 1, time: 0 };
}

/** A no-op 2D context that every draw() implementation must tolerate. */
function stubCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const noop = () => gradient;
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, prop) => {
      if (prop === "canvas") return null;
      if (prop === "measureText") return () => ({ width: 0 });
      return noop;
    },
    set: () => true,
  });
}

type CanonicalModule = SimulationModule & {
  getVisualState(): EngineVisualState;
  pointer(p: SimPointer): void;
};

function makeModule(id: string, seed = 1): CanonicalModule {
  const m = createModule(id);
  if (!m) throw new Error(`module ${id} not created`);
  if (!m.getVisualState) throw new Error(`module ${id} has no getVisualState`);
  m.init(makeCtx());
  m.reset(seed);
  return m as CanonicalModule;
}

function visualState(m: SimulationModule): EngineVisualState {
  const s = m.getVisualState?.() ?? null;
  if (!s) throw new Error("module does not expose getVisualState");
  return s;
}

// ---------------------------------------------------------------------------
// Full-state replay: restoreState reproduces the canonical state exactly
// ---------------------------------------------------------------------------

describe("replay restores the canonical engine state (serialize → restore)", () => {
  it("orbits: bodies and readouts are identical after a full-state restore", () => {
    const a = makeModule("orbits");
    for (let i = 0; i < 120; i++) a.step(1 / 60); // ~60 s of sim time
    const snap = a.serializeState();
    const before = visualState(a);

    const b = makeModule("orbits");
    b.restoreState(snap);

    // The restored module exposes exactly the state the 3D stage + readouts
    // would have read on the original: the planet sits at the same engine
    // position with the same velocity-derived speed/distance/period.
    expect(b.getVisualState()).toEqual(before);
    expect(b.getReadouts()).toEqual(a.getReadouts());
    // And it continues identically from the restored point.
    for (let i = 0; i < 30; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(b.serializeState()).toEqual(a.serializeState());
  });

  it("charges: pointer-dragged positions and the field grid survive the round trip", () => {
    const a = makeModule("charges");
    // Drag the positive charge (charge1 at (330, 300) on the 800x600 canvas)
    // off the parameter axis — the drag is canonical body state.
    a.pointer({ x: 330, y: 300, type: "down", buttons: 1 });
    a.pointer({ x: 260, y: 180, type: "move", buttons: 1 });
    a.pointer({ x: 260, y: 180, type: "up", buttons: 0 });
    const snap = a.serializeState();
    const before = visualState(a);
    // Sanity: the drag actually moved the charge off the symmetric axis.
    expect(before.bodies!.charge1!.y).not.toBeCloseTo(0, 6);

    const b = makeModule("charges");
    b.restoreState(snap);

    // The field grid (which the 3D arrows sample and the readouts summarize)
    // is regenerated from the restored charges — byte-identical.
    expect(b.getVisualState()).toEqual(before);
    expect(b.getReadouts()).toEqual(a.getReadouts());
    for (let i = 0; i < 20; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(b.serializeState()).toEqual(a.serializeState());
  });

  it("waves: the full surface field and source bodies are identical after restore", () => {
    const a = makeModule("waves");
    for (let i = 0; i < 240; i++) a.step(1 / 60); // let the interference develop
    const snap = a.serializeState();
    const before = visualState(a);

    const b = makeModule("waves");
    b.restoreState(snap);

    // The 3D surface reads the restored u field 1:1; the sources sit at the
    // same driven rows.
    expect(b.getVisualState()).toEqual(before);
    expect(b.getReadouts()).toEqual(a.getReadouts());
    for (let i = 0; i < 30; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(b.serializeState()).toEqual(a.serializeState());
  });
});

// ---------------------------------------------------------------------------
// Representation switching: mounting/drawing a view never creates state
// ---------------------------------------------------------------------------

describe("representation switching cannot create or destroy canonical state", () => {
  it("draw() never mutates getVisualState for any coupled engine (2D consumer is read-only)", () => {
    for (const id of COUPLED_IDS) {
      const m = makeModule(id);
      for (let i = 0; i < 30; i++) m.step(1 / 60);
      const before = visualState(m);
      // Drawing the 2D view (the same canvas the runner clears/redraws at
      // ~60 Hz while the learner watches the 3D stage) must leave the
      // canonical state untouched — the view is a pure read.
      m.draw(stubCtx());
      m.draw(stubCtx());
      expect(visualState(m), id).toEqual(before);
    }
  });

  it("parameter-only restore (the UI replay path) reproduces a from-scratch run with those parameters", () => {
    const cases: Array<[string, Array<[string, number]>]> = [
      ["orbits", [["distance", 240], ["speed", 1.3]]],
      ["charges", [["q1", 2.5], ["q2", -1.5], ["separation", 280], ["fieldScale", 5]]],
      ["waves", [["separation", 100], ["wavelength", 24], ["frequency", 0.8]]],
    ];
    for (const [id, params] of cases) {
      // Path A — the UI replay path: runner.reset() then setParam per key
      // (demonstration-stage.tsx Lumina2DStage reset effect).
      const replayed = makeModule(id);
      replayed.reset(1);
      for (const [key, value] of params) replayed.setParameter(key, value);
      // Path B — a from-scratch run configured with the same parameters.
      const fresh = makeModule(id);
      for (const [key, value] of params) fresh.setParameter(key, value);

      // Same canonical state: bodies (and for charges the field grid, for
      // waves the source rows) are identical, and the readouts agree.
      expect(replayed.getVisualState(), id).toEqual(fresh.getVisualState());
      expect(replayed.getReadouts(), id).toEqual(fresh.getReadouts());
      // And the trajectories stay identical once both run.
      for (let i = 0; i < 40; i++) {
        replayed.step(1 / 60);
        fresh.step(1 / 60);
      }
      expect(replayed.getVisualState(), id).toEqual(fresh.getVisualState());
    }
  });
});
