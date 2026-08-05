/**
 * Engine visual-state coupling tests — the canonical-state contract behind
 * the hybrid showcase remediation (Gate 3).
 *
 * Each of the three coupled engines (orbits / charges / waves) must expose
 * getVisualState() with finite numbers in the documented coordinate space,
 * and that state must track BOTH the parameters the readouts report and the
 * simulation trajectory the readouts summarize. These tests pin the physics:
 *  - orbits: the planet completes one full cycle in exactly the readout
 *    period (angle modulo 2π returns to the start),
 *  - charges: the grid's center cell agrees with the midpoint readout —
 *    exactly zero for same-sign charges (field null point), non-zero for a
 *    dipole (whose POTENTIAL is null at the midpoint, per the showcase docs),
 *  - waves: the surface becomes non-uniform as the field evolves and the
 *    sources sit at their driven rows, moving with the separation parameter.
 */

import { describe, expect, it } from "vitest";
import { createModule } from "@/demonstrations/renderers/lumina-2d/registry";
import type {
  EngineVisualState,
  Readout,
  SimContext,
  SimulationModule,
} from "@/demonstrations/renderers/lumina-2d/types";
import { CHARGES_FIELD_GRID } from "@/demonstrations/renderers/lumina-2d/engines/charges";
import {
  WAVE_GRID_H,
  WAVE_GRID_W,
} from "@/demonstrations/renderers/lumina-2d/engines/waves";

function makeCtx(w = 800, h = 600): SimContext {
  return { width: w, height: h, dpr: 1, time: 0 };
}

function makeModule(id: string, seed = 1): SimulationModule {
  const m = createModule(id);
  if (!m) throw new Error(`module ${id} not created`);
  m.init(makeCtx());
  m.reset(seed);
  return m;
}

function visualState(m: SimulationModule): EngineVisualState {
  const s = m.getVisualState?.() ?? null;
  if (!s) throw new Error("module does not expose getVisualState");
  return s;
}

function expectFiniteBodies(state: EngineVisualState): void {
  expect(state.bodies).toBeDefined();
  for (const [key, body] of Object.entries(state.bodies ?? {})) {
    expect(Number.isFinite(body.x), `${key}.x`).toBe(true);
    expect(Number.isFinite(body.y), `${key}.y`).toBe(true);
  }
}

function expectFiniteGrid(state: EngineVisualState): void {
  const field = state.field;
  expect(field).toBeDefined();
  for (const v of field!.vectors) {
    expect(Number.isFinite(v.x)).toBe(true);
    expect(Number.isFinite(v.y)).toBe(true);
    expect(Number.isFinite(v.ex)).toBe(true);
    expect(Number.isFinite(v.ey)).toBe(true);
    expect(Number.isFinite(v.magnitude)).toBe(true);
  }
}

function expectFiniteSurface(state: EngineVisualState): void {
  const surface = state.surface;
  expect(surface).toBeDefined();
  for (const v of surface!.values) expect(Number.isFinite(v)).toBe(true);
}

function readoutOf(readouts: Readout[], label: string): number {
  const hit = readouts.find((r) => r.label === label);
  if (!hit) throw new Error(`no readout labelled ${label}`);
  return Number.parseFloat(hit.value);
}

/** Smallest signed angle between two vectors, in [-π, π]. */
function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  return Math.atan2(cross, dot);
}

// ---------------------------------------------------------------------------
// orbits
// ---------------------------------------------------------------------------

describe("orbits getVisualState", () => {
  it("exposes finite star/planet bodies at the seeded defaults", () => {
    const m = makeModule("orbits");
    const state = visualState(m);
    expectFiniteBodies(state);
    // default distance 150, eccentricity 0 → planet at apoapsis (150, 0)
    expect(state.bodies!.star).toEqual({ x: 0, y: 0 });
    expect(state.bodies!.planet!.x).toBeCloseTo(150, 6);
    expect(state.bodies!.planet!.y).toBeCloseTo(0, 6);
  });

  it("advances with step()", () => {
    const m = makeModule("orbits");
    const initial = visualState(m).bodies!.planet!;
    for (let i = 0; i < 10; i++) m.step(0.02); // 6 s of sim time
    const moved = visualState(m).bodies!.planet!;
    // The planet swept along its orbit: position differs, radius stays ~150.
    expect(Math.hypot(moved.x - initial.x, moved.y - initial.y)).toBeGreaterThan(1);
    expect(Math.hypot(moved.x, moved.y)).toBeCloseTo(150, 0);
  });

  it("completes a full cycle in exactly one readout period", () => {
    const m = makeModule("orbits");
    const initial = visualState(m).bodies!.planet!;

    // Warm the sweep-angle accumulator so the Period readout is defined
    // (thetaAccum > 0.5 gate). Each step(0.02) advances sim time by 0.6 s.
    const warmupCalls = 20;
    for (let i = 0; i < warmupCalls; i++) m.step(0.02);
    const period = readoutOf(m.getReadouts(), "Period");
    expect(period).toBeGreaterThan(50);

    // Finish the remaining cycle: total sim time ≈ the readout period.
    const elapsed = warmupCalls * 0.6;
    const remaining = period - elapsed;
    expect(remaining).toBeGreaterThan(0);
    const calls = Math.ceil(remaining / 0.6);
    for (let i = 0; i < calls; i++) m.step(0.02);

    const final = visualState(m).bodies!.planet!;
    // After one full period the position returns to the start: the swept
    // angle modulo 2π must be small (RK4 drift + one-step overshoot << 0.15).
    const angle = angleBetween(initial.x, initial.y, final.x, final.y);
    const mod = Math.abs(angle % (2 * Math.PI));
    const delta = Math.min(mod, 2 * Math.PI - mod);
    expect(delta).toBeLessThan(0.15);
    // And the orbit is closed: the radius returns to the launch radius.
    expect(Math.hypot(final.x, final.y)).toBeCloseTo(150, 0);
  });
});

// ---------------------------------------------------------------------------
// charges
// ---------------------------------------------------------------------------

describe("charges getVisualState", () => {
  it("exposes centered charge bodies and a bounded field grid of finite numbers", () => {
    const m = makeModule("charges");
    const state = visualState(m);
    expectFiniteBodies(state);
    // default separation 140 → charges at ±70 centered px on the x axis
    expect(state.bodies!.charge1!.x).toBeCloseTo(-70, 6);
    expect(state.bodies!.charge1!.y).toBeCloseTo(0, 6);
    expect(state.bodies!.charge2!.x).toBeCloseTo(70, 6);
    expect(state.bodies!.charge2!.y).toBeCloseTo(0, 6);

    const field = state.field!;
    expect(field.width).toBe(CHARGES_FIELD_GRID);
    expect(field.height).toBe(CHARGES_FIELD_GRID);
    expect(field.vectors).toHaveLength(CHARGES_FIELD_GRID * CHARGES_FIELD_GRID);
    expect(field.span).toBeGreaterThan(0);
    expectFiniteGrid(state);
  });

  it("center cell exactly matches the midpoint readout (dipole: non-zero field, null potential)", () => {
    const m = makeModule("charges");
    const state = visualState(m);
    const field = state.field!;
    const center = field.vectors.find((v) => v.x === 0 && v.y === 0);
    expect(center).toBeDefined();
    // Dipole (q1=+1, q2=-1): the field at the midpoint is NOT zero (both
    // charges push the same way); the POTENTIAL is the null quantity there.
    expect(center!.magnitude).toBeGreaterThan(0);
    expectFiniteGrid(state);
    // The grid's center cell is the exact midpoint → must agree with the
    // readout. The readout is display-rounded to 3 decimals (toFixed(3)),
    // while the grid carries the raw Coulomb magnitude — so the honest bound
    // is the display precision a learner actually sees.
    const readout = readoutOf(m.getReadouts(), "Field strength");
    expect(Math.abs(center!.magnitude - readout)).toBeLessThan(0.001);
  });

  it("same-sign charges produce an exact field null at the center cell", () => {
    const m = makeModule("charges");
    m.setParameter("q2", 1); // +1 and +1: symmetric cancellation at the midpoint
    const state = visualState(m);
    const center = state.field!.vectors.find((v) => v.x === 0 && v.y === 0)!;
    expect(center.magnitude).toBeLessThan(1e-6);
    // The readout agrees with the null point too.
    expect(readoutOf(m.getReadouts(), "Field strength")).toBeLessThan(1e-6);
  });

  it("separation changes move the charge bodies (canonical state follows the parameter)", () => {
    const m = makeModule("charges");
    m.setParameter("separation", 280);
    const state = visualState(m);
    expect(state.bodies!.charge1!.x).toBeCloseTo(-140, 6);
    expect(state.bodies!.charge2!.x).toBeCloseTo(140, 6);
    // The grid's half-extent scales with the separation too (span = 2*sep).
    expect(state.field!.span).toBe(560);
  });
});

// ---------------------------------------------------------------------------
// waves
// ---------------------------------------------------------------------------

describe("waves getVisualState", () => {
  it("exposes the full surface grid plus the two source bodies at their driven rows", () => {
    const m = makeModule("waves");
    const state = visualState(m);
    expectFiniteSurface(state);
    const surface = state.surface!;
    expect(surface.width).toBe(WAVE_GRID_W);
    expect(surface.height).toBe(WAVE_GRID_H);
    expect(surface.values).toHaveLength(WAVE_GRID_W * WAVE_GRID_H);
    expectFiniteBodies(state);
    // Default separation 40 → rows GH/2 ± 20 = 40 and 80; column 0.28*GW = 56.
    expect(state.bodies!.source1!.x).toBeCloseTo(56 / WAVE_GRID_W - 0.5, 6);
    expect(state.bodies!.source1!.y).toBeCloseTo(40 / WAVE_GRID_H - 0.5, 6);
    expect(state.bodies!.source2!.y).toBeCloseTo(80 / WAVE_GRID_H - 0.5, 6);
  });

  it("surface becomes non-uniform as the field evolves", () => {
    const m = makeModule("waves");
    for (let i = 0; i < 180; i++) m.step(1 / 60);
    const values = visualState(m).surface!.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(max - min).toBeGreaterThan(1e-3);
    // The two sources are being driven: the pattern spreads across the grid.
    const distinct = new Set(values.filter((v) => Math.abs(v) > 1e-6)).size;
    expect(distinct).toBeGreaterThan(10);
  });

  it("source bodies follow the separation parameter", () => {
    const m = makeModule("waves");
    m.setParameter("separation", 100); // rows GH/2 ± 50 = 10 and 110
    const state = visualState(m);
    expect(state.bodies!.source1!.y).toBeCloseTo(10 / WAVE_GRID_H - 0.5, 6);
    expect(state.bodies!.source2!.y).toBeCloseTo(110 / WAVE_GRID_H - 0.5, 6);
  });
});
