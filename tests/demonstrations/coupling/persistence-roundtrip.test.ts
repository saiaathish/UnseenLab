/**
 * Persistence + second-trial coupling tests — Phase 5 (canonical-state proof,
 * persistence column). Closes two real gaps found while verifying the
 * Phase-5 manipulation matrix:
 *
 *  1. SECOND TRIAL: no test recorded two trials in one session and asserted
 *     the per-trial numbering and the INDEPENDENCE of the parameter
 *     snapshots (demo-store assigns trial = trials.length + 1 and each
 *     recordTrial call carries its own parameter snapshot — the page mirrors
 *     this at demonstration-page.tsx:270-277, 296-303, 336-342).
 *
 *  2. MANIPULATE -> RELOAD (device round trip): no test proved that a
 *     MANIPULATED parameter snapshot survives
 *       trial.parameters -> demo-store -> saveToDevice (localStorage)
 *       -> loadFromDevice -> replay (reset + setParam per key)
 *     and reproduces the CANONICAL ENGINE STATE (getVisualState +
 *     getReadouts) for the three showcase engines. This is the exact chain
 *     the page wires:
 *       - snapshot:   demonstration-page.tsx:270-277 (handlePredictionSubmit)
 *       - store:      demo-store.ts:83-91 (recordTrial)
 *       - device:     demo-store.ts:111-126 (saveToDevice)
 *       - boot load:  demonstration-page.tsx:59 -> demo-store.ts:128-140
 *       - replay:     demonstration-page.tsx:348-352 (setParameters +
 *                     resetSignal++) -> stage.tsx:185-194 (runner.reset() +
 *                     setParam per key) -> runner.ts:307-313 -> engine
 *       - 3D surface: stage.tsx:286-293 re-applies the emitted state.
 *
 * The honest boundary is also pinned: the persisted snapshot holds PARAMETER
 * keys only — a pointer-dragged charge position is canonical body state but
 * is NOT in the parameter snapshot, so after reload+replay the body returns
 * to its parameter-defined position (the replay banner says exactly this:
 * demonstration-shell.tsx:271-273 "past simulation state (positions, time)
 * is not restored").
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  buildElectricFieldShowcase,
  buildOrbitsShowcase,
  buildWaveInterferenceShowcase,
} from "@/demonstrations/showcases";
import { createModule } from "@/demonstrations/renderers/lumina-2d/registry";
import type {
  EngineVisualState,
  SimPointer,
  SimulationModule,
} from "@/demonstrations/renderers/lumina-2d/types";
import { demoStore } from "@/demonstrations/state/demo-store";

/** The showcase seed is fixed (20260804) so the engine is deterministic. */
const SHOWCASE_SEED = 20260804;

const SHOWCASES = [
  { id: "orbits", build: buildOrbitsShowcase },
  { id: "electric-fields", build: buildElectricFieldShowcase },
  { id: "waves", build: buildWaveInterferenceShowcase },
] as const;

/**
 * A manipulated parameter map: every spec parameter key (the page lifts the
 * full map at demonstration-page.tsx:213-219), with one or two values moved
 * off their defaults — inside the control ranges of the showcase specs.
 */
const MANIPULATED: Record<string, Record<string, number>> = {
  orbits: { g: 12, speed: 1.15 },
  "electric-fields": { q1: 1.5, q2: -2, separation: 200, fieldScale: 5 },
  waves: { frequency: 0.8, wavelength: 20, separation: 60 },
};

function makeModule(
  engineId: string,
): SimulationModule & {
  getVisualState(): EngineVisualState;
  pointer(p: SimPointer): void;
} {
  const m = createModule(engineId);
  if (!m) throw new Error(`engine ${engineId} not registered`);
  m.init({ width: 800, height: 600, dpr: 1, time: 0 });
  return m as SimulationModule & {
    getVisualState(): EngineVisualState;
    pointer(p: SimPointer): void;
  };
}

function visualState(m: SimulationModule) {
  const s = m.getVisualState?.();
  if (!s) throw new Error("module does not expose getVisualState");
  return s;
}

/** Mirror the page's readout snapshot (label/value display strings). */
function readoutSnapshot(m: SimulationModule) {
  return m.getReadouts().map((r) => ({ label: r.label, value: r.value }));
}

function resetStore() {
  demoStore.clear();
  localStorage.clear();
}

afterEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// 1. Second trial — per-trial numbering and independent parameter snapshots
// ---------------------------------------------------------------------------

describe("second trial", () => {
  it("records two trials with incrementing numbers and independent parameter snapshots", () => {
    const spec = buildOrbitsShowcase();
    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");

    demoStore.recordTrial({
      predictionIndex: 0,
      parameters: { ...spec.simulation!.parameters.map((p) => [p.key, p.value]).reduce(
        (acc, [k, v]) => ({ ...acc, [k]: v }),
        {}
      ), speed: 1.15 },
      readouts: [{ label: "Period", value: "120.4" }],
      controls: { playing: true, speed: 1 },
      adaptations: [],
    });

    demoStore.recordTrial({
      predictionIndex: null,
      parameters: { ...spec.simulation!.parameters.map((p) => [p.key, p.value]).reduce(
        (acc, [k, v]) => ({ ...acc, [k]: v }),
        {}
      ), speed: 0.8 },
      readouts: [{ label: "Period", value: "90.1" }],
      controls: { playing: false, speed: 1 },
      adaptations: [],
    });

    const trials = demoStore.getTrials();
    expect(trials).toHaveLength(2);
    // Numbering assigned by the store, not by the caller.
    expect(trials[0].trial).toBe(1);
    expect(trials[1].trial).toBe(2);
    // Each entry keeps its own manipulated snapshot.
    expect(trials[0].parameters.speed).toBe(1.15);
    expect(trials[1].parameters.speed).toBe(0.8);
    expect(trials[0].readouts).toEqual([{ label: "Period", value: "120.4" }]);
    expect(trials[1].readouts).toEqual([{ label: "Period", value: "90.1" }]);
    expect(trials[1].controls.playing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Manipulate -> reload (device round trip) reproduces canonical state
// ---------------------------------------------------------------------------

describe("device round trip (manipulate -> save -> reload -> replay)", () => {
  for (const showcase of SHOWCASES) {
    it(`${showcase.id}: the manipulated parameter snapshot survives the localStorage round trip and the replay re-derives the exact canonical state`, () => {
      const spec = showcase.build();
      const engineId = spec.simulation!.engineId;
      const overrides = MANIPULATED[showcase.id];

      // The page's lifted parameter map: every spec parameter + manipulation.
      const manipulatedParams: Record<string, number> = {};
      for (const p of spec.simulation!.parameters) {
        manipulatedParams[p.key] = p.value;
      }
      for (const [k, v] of Object.entries(overrides)) {
        manipulatedParams[k] = v;
      }

      // Run A — the manipulated session (runner.setScene -> setParam path).
      const a = makeModule(engineId);
      a.reset(SHOWCASE_SEED);
      for (const [key, value] of Object.entries(manipulatedParams)) {
        a.setParameter(key, value);
      }
      const canonicalBefore = visualState(a);
      const readoutsBefore = readoutSnapshot(a);

      // Persist exactly what the page records in a trial entry.
      demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
      demoStore.recordTrial({
        predictionIndex: 1,
        parameters: { ...manipulatedParams },
        readouts: readoutsBefore,
        controls: { playing: true, speed: 1 },
        adaptations: [],
      });
      expect(demoStore.saveToDevice()).toBe(true);

      // Reload: a fresh page boot restores the session from localStorage.
      demoStore.clear();
      const restored = demoStore.loadFromDevice(spec.id);
      expect(restored).not.toBeNull();
      expect(restored!.trials).toHaveLength(1);
      expect(restored!.trials[0].parameters).toEqual(manipulatedParams);
      expect(restored!.trials[0].readouts).toEqual(readoutsBefore);

      // Replay: handleReplayTrial (demo-page.tsx:348-352) -> the 2D stage
      // reset effect (stage.tsx:185-194) -> runner.reset() + setParam per key
      // (runner.ts:307-313, 293-295) -> the engine re-derives its state.
      const b = makeModule(engineId);
      b.reset(SHOWCASE_SEED);
      for (const [key, value] of Object.entries(restored!.trials[0].parameters)) {
        b.setParameter(key, value);
      }

      // Same canonical state the 3D stage, 2D view and readouts all read.
      expect(visualState(b)).toEqual(canonicalBefore);
      expect(readoutSnapshot(b)).toEqual(readoutsBefore);

      // And the trajectories stay identical once both run (deterministic).
      for (let i = 0; i < 30; i++) {
        a.step(1 / 60);
        b.step(1 / 60);
      }
      expect(visualState(b)).toEqual(visualState(a));
      expect(readoutSnapshot(b)).toEqual(readoutSnapshot(a));
    });
  }

  it("charges: the honest boundary — a pointer-dragged body position is canonical but NOT in the persisted parameter snapshot", () => {
    const spec = buildElectricFieldShowcase();
    const manipulatedParams: Record<string, number> = {};
    for (const p of spec.simulation!.parameters) {
      manipulatedParams[p.key] = p.value;
    }

    const m = makeModule("charges");
    m.reset(SHOWCASE_SEED);
    // Drag the positive charge off the symmetric axis (canonical body state).
    m.pointer({ x: 330, y: 300, type: "down", buttons: 1 });
    m.pointer({ x: 260, y: 180, type: "move", buttons: 1 });
    m.pointer({ x: 260, y: 180, type: "up", buttons: 0 });
    expect(visualState(m).bodies!.charge1!.y).not.toBeCloseTo(0, 6);

    demoStore.startDemo(spec, "offline", "2026-08-04T00:00:00.000Z");
    demoStore.recordTrial({
      predictionIndex: 1,
      parameters: { ...manipulatedParams },
      readouts: readoutSnapshot(m),
      controls: { playing: true, speed: 1 },
      adaptations: [],
    });
    demoStore.saveToDevice();
    demoStore.clear();

    const restored = demoStore.loadFromDevice(spec.id);
    expect(restored).not.toBeNull();
    // The snapshot holds ONLY the four engine parameter keys.
    expect(Object.keys(restored!.trials[0].parameters).sort()).toEqual(
      ["fieldScale", "q1", "q2", "separation"]
    );

    // Replay restores the parameter-defined configuration; the drag position
    // is honestly not restored (the banner says so: shell.tsx:271-273).
    const b = makeModule("charges");
    b.reset(SHOWCASE_SEED);
    for (const [key, value] of Object.entries(restored!.trials[0].parameters)) {
      b.setParameter(key, value);
    }
    expect(visualState(b).bodies!.charge1!.y).toBeCloseTo(0, 6);
    expect(visualState(b).bodies!.charge1!.x).toBeCloseTo(-70, 6);
  });
});
