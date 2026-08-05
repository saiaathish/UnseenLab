/**
 * Lumina 2D engine namespace — numerical, determinism and runner tests.
 *
 * jsdom has no canvas rasterizer and no rAF/ResizeObserver, so the runner
 * tests drive a fake requestAnimationFrame queue, and engine draw() methods
 * are exercised against a no-op Proxy context (which the engines must
 * tolerate by contract).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGINE_CATALOG, type VerifiedEngineId } from "@/demonstrations/spec/demo-spec";
import { createModule, getEngineMeta, listEngineIds } from "@/demonstrations/renderers/lumina-2d/registry";
import {
  SimRunner,
  clampDt,
  isCanvasOwned,
  MAX_DT,
  type SceneSpec,
} from "@/demonstrations/renderers/lumina-2d/runner";
import type { Readout, SimContext, SimulationModule } from "@/demonstrations/renderers/lumina-2d/types";
import { CA_COLS, CA_ROWS } from "@/demonstrations/renderers/lumina-2d/engines/cellular-automaton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATALOG_IDS: VerifiedEngineId[] = [
  "orbits",
  "projectile",
  "charges",
  "waves",
  "gas",
  "pendulum",
  "rc_circuit",
  "reaction_diffusion",
  "cellular_automaton",
];

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

function makeModule(id: string, seed = 1): SimulationModule {
  const m = createModule(id);
  if (!m) throw new Error(`module ${id} not created`);
  m.init(makeCtx());
  m.reset(seed);
  return m;
}

/** mean |v| of the gas particles in a serialized state */
function gasAvgSpeed(state: unknown): number {
  const s = state as { particles: Array<{ vx: number; vy: number }> };
  let sum = 0;
  for (const p of s.particles) sum += Math.hypot(p.vx, p.vy);
  return sum / Math.max(s.particles.length, 1);
}

function parseFloatReadout(r: Readout): number {
  return parseFloat(r.value);
}

function readoutValue(r: Readout[], label: string): number {
  const hit = r.find((x) => x.label === label);
  if (!hit) throw new Error(`no readout labelled ${label}`);
  return parseFloatReadout(hit);
}

// ---------------------------------------------------------------------------
// Fake browser primitives for the runner tests
// ---------------------------------------------------------------------------

let rafQueue: Array<(t: number) => void> = [];
let cancelledRafIds: number[] = [];
let rafIdCounter = 0;

function fireFrame(now: number) {
  const cb = rafQueue.shift();
  if (cb) cb(now);
}

class FakeResizeObserver {
  constructor(_cb: () => void) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}

let documentHidden = false;
function setDocumentHidden(v: boolean) {
  documentHidden = v;
  try {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => documentHidden,
    });
  } catch {
    /* jsdom may already expose hidden; the flag fallback covers the test */
  }
}

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registry", () => {
  it("resolves every catalog engine id and returns null for unknown ids", () => {
    for (const id of CATALOG_IDS) {
      expect(createModule(id), id).not.toBeNull();
      expect(getEngineMeta(id), id).not.toBeNull();
      expect(getEngineMeta(id)!.parameterKeys).toEqual(ENGINE_CATALOG[id].parameterKeys);
      expect(getEngineMeta(id)!.readoutKeys).toEqual(ENGINE_CATALOG[id].readoutKeys);
    }
    expect(createModule("no_such_engine")).toBeNull();
    // the namespace ships the 9 curated ids; catalog ids outside that set are
    // unknown to this renderer and must resolve to null, never to a stand-in
    expect(createModule("nuclear_chain_reaction")).toBeNull();
    expect(listEngineIds()).toEqual(CATALOG_IDS);
  });

  it("accepts exactly the catalog parameter keys and exposes exactly the catalog readout keys", () => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const id of CATALOG_IDS) {
      const m = createModule(id)!;
      m.init(makeCtx());
      m.reset(1);
      const cap = ENGINE_CATALOG[id];
      // every catalog parameter key is settable without throwing
      for (const key of cap.parameterKeys) {
        expect(() => m.setParameter(key, 1)).not.toThrow();
      }
      // readout labels normalize 1:1 to the catalog readout keys
      const labels = m.getReadouts().map((r) => normalize(r.label));
      const keys = cap.readoutKeys.map(normalize);
      expect([...labels].sort(), id).toEqual([...keys].sort());
    }
  });
});

describe("seed determinism", () => {
  it("two runs with the same seed produce identical states; different seeds differ", () => {
    const a = makeModule("gas", 42);
    const b = makeModule("gas", 42);
    for (let i = 0; i < 120; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(a.serializeState()).toEqual(b.serializeState());

    const c = makeModule("gas", 43);
    for (let i = 0; i < 120; i++) c.step(1 / 60);
    expect(c.serializeState()).not.toEqual(a.serializeState());
  });

  it("cellular automaton is deterministic per seed", () => {
    const a = makeModule("cellular_automaton", 7);
    const b = makeModule("cellular_automaton", 7);
    for (let i = 0; i < 40; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(a.serializeState()).toEqual(b.serializeState());
  });
});

describe("projectile", () => {
  it("drag=0 range matches the analytic parabola within 1%", () => {
    const m = makeModule("projectile");
    m.setParameter("angle", 45);
    m.setParameter("speed", 30);
    m.setParameter("drag", 0);
    m.setParameter("gravity", 9.8);
    const s = m.serializeState() as { flying: boolean; range: number; apex: number; timeOfFlight: number };
    for (let i = 0; i < 600 && s.flying; i++) {
      m.step(1 / 60);
      Object.assign(s, m.serializeState());
    }
    expect(s.flying).toBe(false);
    const expectedRange = (30 * 30 * Math.sin((2 * Math.PI * 45) / 180)) / 9.8; // 91.837 m
    const expectedHeight = (30 * 30 * Math.sin(Math.PI / 4) ** 2) / (2 * 9.8); // 45.918 m
    const expectedTof = (2 * 30 * Math.sin(Math.PI / 4)) / 9.8; // 4.329 s
    expect(Math.abs(s.range - expectedRange) / expectedRange).toBeLessThan(0.01);
    expect(Math.abs(s.apex - expectedHeight) / expectedHeight).toBeLessThan(0.01);
    expect(Math.abs(s.timeOfFlight - expectedTof) / expectedTof).toBeLessThan(0.01);
  });

  it("quadratic drag shortens the range", () => {
    const clean = makeModule("projectile");
    clean.setParameter("angle", 45);
    clean.setParameter("speed", 30);
    clean.setParameter("drag", 0);
    clean.setParameter("gravity", 9.8);
    const dirty = makeModule("projectile");
    dirty.setParameter("angle", 45);
    dirty.setParameter("speed", 30);
    dirty.setParameter("drag", 0.05);
    dirty.setParameter("gravity", 9.8);
    const finish = (m: SimulationModule) => {
      const s = m.serializeState() as { flying: boolean; range: number };
      for (let i = 0; i < 900 && s.flying; i++) {
        m.step(1 / 60);
        Object.assign(s, m.serializeState());
      }
      return s.range;
    };
    const r0 = finish(clean);
    const r1 = finish(dirty);
    expect(r1).toBeLessThan(r0 * 0.9);
  });
});

describe("orbits", () => {
  function periodOf(distance: number): number {
    const m = makeModule("orbits");
    m.setParameter("g", 10);
    m.setParameter("speed", 1);
    m.setParameter("bodyMass", 1);
    m.setParameter("eccentricity", 0);
    m.setParameter("distance", distance);
    const s = m.serializeState() as { simTime: number; thetaAccum: number };
    for (let i = 0; i < 4000 && s.thetaAccum < 2 * Math.PI; i++) {
      m.step(1 / 60);
      Object.assign(s, m.serializeState());
    }
    expect(s.thetaAccum).toBeGreaterThanOrEqual(2 * Math.PI);
    return s.simTime;
  }

  it("measured period matches Kepler's third law within 5%", () => {
    const starMass = 1000;
    const bodyMass = 1;
    const a = 150;
    const Tkepler = 2 * Math.PI * Math.sqrt((a ** 3) / (10 * (starMass + bodyMass)));
    const Tmeasured = periodOf(a);
    expect(Math.abs(Tmeasured - Tkepler) / Tkepler).toBeLessThan(0.05);
  });

  it("T² ∝ a³ across distances within 5%", () => {
    const t150 = periodOf(150);
    const t300 = periodOf(300);
    const ratio = t300 / t150;
    expect(Math.abs(ratio - Math.sqrt(8)) / Math.sqrt(8)).toBeLessThan(0.05);
  });
});

describe("waves", () => {
  it("stays stable for small dt: no NaN and bounded energy", () => {
    const m = makeModule("waves");
    for (let i = 0; i < 400; i++) m.step(1 / 60);
    const s = m.serializeState() as { u: number[]; up: number[]; simTime: number };
    expect(s.simTime).toBeGreaterThan(0);
    for (const arr of [s.u, s.up]) {
      expect(arr.every(Number.isFinite)).toBe(true);
    }
    const energy = s.u.reduce((acc, v) => acc + v * v, 0);
    const maxAbs = Math.max(...s.u.map(Math.abs));
    expect(energy).toBeGreaterThan(0);
    expect(energy).toBeLessThan(1e6);
    expect(maxAbs).toBeLessThan(1e4);
  });
});

describe("gas", () => {
  it("average speed increases with temperature (v ∝ √T)", () => {
    const m = makeModule("gas", 7);
    for (let i = 0; i < 20; i++) m.step(1 / 60);
    const v1 = gasAvgSpeed(m.serializeState());
    m.setParameter("temperature", 4);
    for (let i = 0; i < 10; i++) m.step(1 / 60);
    const v2 = gasAvgSpeed(m.serializeState());
    expect(v2).toBeGreaterThan(v1 * 1.5);
    expect(v2).toBeLessThan(v1 * 2.5);
  });
});

describe("rc_circuit", () => {
  it("charges toward the supply voltage asymptotically", () => {
    const m = makeModule("rc_circuit");
    m.setParameter("resistance", 1000);
    m.setParameter("capacitance", 100e-6);
    m.setParameter("voltage", 5);
    const s = m.serializeState() as { vc: number; charging: boolean; simTime: number };
    for (let i = 0; i < 120 && s.simTime < 1.2; i++) {
      m.step(0.01);
      Object.assign(s, m.serializeState());
    }
    expect(s.simTime).toBeCloseTo(1.2, 5);
    expect(s.charging).toBe(true); // first toggle is at 1.4 s for τ = 0.1 s
    expect(s.vc).toBeGreaterThan(4.9); // 5(1 − e^−12) ≈ 4.99997
    expect(s.vc).toBeLessThanOrEqual(5.0001);
  });

  it("time constant matches RC within 10%", () => {
    const m = makeModule("rc_circuit");
    const R = 1000;
    const C = 100e-6;
    const Vs = 5;
    m.setParameter("resistance", R);
    m.setParameter("capacitance", C);
    m.setParameter("voltage", Vs);
    const dt = 0.002;
    let t = 0;
    let vc = 0;
    for (let i = 0; i < 5000 && vc < 0.63212 * Vs; i++) {
      m.step(dt);
      t += dt;
      vc = (m.serializeState() as { vc: number }).vc;
    }
    const tau = R * C; // 0.1 s
    expect(Math.abs(t - tau) / tau).toBeLessThan(0.1);
  });
});

describe("reaction_diffusion", () => {
  it("produces a non-uniform pattern from uniform-ish seeds", () => {
    const m = makeModule("reaction_diffusion", 3);
    for (let i = 0; i < 400; i++) m.step(1 / 60);
    const s = m.serializeState() as { v: number[]; iteration: number };
    expect(s.iteration).toBeGreaterThan(0);
    const n = s.v.length;
    let sum = 0;
    let sumSq = 0;
    let maxV = 0;
    for (const vv of s.v) {
      sum += vv;
      sumSq += vv * vv;
      if (vv > maxV) maxV = vv;
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    expect(maxV).toBeGreaterThan(0.2);
    expect(std).toBeGreaterThan(0.02);
  });
});

describe("cellular_automaton", () => {
  it("a glider translates one cell diagonally every four generations", () => {
    const m = createModule("cellular_automaton")!;
    m.init(makeCtx());
    // inject a glider at (5,5): classic B3/S23 glider
    const glider: Array<[number, number]> = [
      [5, 6],
      [6, 7],
      [7, 5],
      [7, 6],
      [7, 7],
    ];
    const grid = new Uint8Array(CA_COLS * CA_ROWS);
    for (const [c, r] of glider) grid[r * CA_COLS + c] = 1;
    m.restoreState({
      simTime: 0,
      params: { speed: 1, density: 0 },
      rngState: 0,
      generation: 0,
      acc: 0,
      grid: Array.from(grid),
    });
    const liveCells = (st: unknown) => {
      const g = (st as { grid: number[] }).grid;
      const out: Array<[number, number]> = [];
      for (let r = 0; r < CA_ROWS; r++) {
        for (let c = 0; c < CA_COLS; c++) {
          if (g[r * CA_COLS + c]) out.push([c, r]);
        }
      }
      return out;
    };
    const sortCells = (cells: Array<[number, number]>) =>
      [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const before = liveCells(m.serializeState());
    expect(sortCells(before)).toEqual(sortCells(glider));
    for (let g = 0; g < 4; g++) m.step(1); // speed=1 → exactly one generation per step(1)
    const after = liveCells(m.serializeState());
    const expected: Array<[number, number]> = glider.map(([c, r]) => [c + 1, r + 1]);
    expect(sortCells(after)).toEqual(sortCells(expected));
    const state = m.serializeState() as { generation: number; population: number };
    expect(state.generation).toBe(4);
    expect(state.population).toBe(5);
  });
});

describe("pendulum", () => {
  it("period readout matches the small-angle formula within 2%", () => {
    const m = makeModule("pendulum");
    m.setParameter("length", 1.5);
    m.setParameter("gravity", 9.8);
    m.setParameter("amplitude", 5);
    m.setParameter("damping", 0);
    const s = m.serializeState() as { measuredPeriod: number; simTime: number };
    for (let i = 0; i < 3000 && s.measuredPeriod <= 0; i++) {
      m.step(1 / 60);
      Object.assign(s, m.serializeState());
    }
    expect(s.measuredPeriod).toBeGreaterThan(0);
    const T = 2 * Math.PI * Math.sqrt(1.5 / 9.8); // 2.458 s
    expect(Math.abs(s.measuredPeriod - T) / T).toBeLessThan(0.02);
  });
});

describe("serialization", () => {
  it("round-trips circuit, gas and waves state exactly", () => {
    const pairs: Array<[string, number]> = [
      ["rc_circuit", 50],
      ["gas", 60],
      ["waves", 40],
    ];
    for (const [id, frames] of pairs) {
      const a = makeModule(id, 5);
      for (let i = 0; i < frames; i++) a.step(1 / 60);
      const snap = a.serializeState();
      const b = createModule(id)!;
      b.init(makeCtx());
      b.restoreState(snap);
      expect(b.serializeState(), id).toEqual(snap);
      // both continue identically from the restored point
      for (let i = 0; i < 20; i++) {
        a.step(1 / 60);
        b.step(1 / 60);
      }
      expect(b.serializeState(), id).toEqual(a.serializeState());
    }
  });
});

describe("reset", () => {
  it("reset(seed) restores the exact initial state", () => {
    const m = makeModule("gas", 9);
    const fresh = m.serializeState();
    for (let i = 0; i < 60; i++) m.step(1 / 60);
    expect(m.serializeState()).not.toEqual(fresh);
    m.reset(9);
    expect(m.serializeState()).toEqual(fresh);
  });
});

describe("parameter bounds", () => {
  it("clamps out-of-range values to the declared bounds", () => {
    const ca = makeModule("cellular_automaton");
    ca.setParameter("density", 5);
    ca.setParameter("speed", 0.1);
    expect((ca.serializeState() as { params: Record<string, number> }).params.density).toBe(1);
    expect((ca.serializeState() as { params: Record<string, number> }).params.speed).toBe(1);

    const proj = makeModule("projectile");
    proj.setParameter("angle", 200);
    proj.setParameter("gravity", -5);
    expect((proj.serializeState() as { params: Record<string, number> }).params.angle).toBe(89);
    expect((proj.serializeState() as { params: Record<string, number> }).params.gravity).toBe(0.1);

    const orbit = makeModule("orbits");
    orbit.setParameter("eccentricity", 2);
    expect((orbit.serializeState() as { params: Record<string, number> }).params.eccentricity).toBe(0.95);

    const gas = makeModule("gas");
    gas.setParameter("temperature", -3);
    expect((gas.serializeState() as { params: Record<string, number> }).params.temperature).toBe(0.1);
  });
});

describe("step/draw separation", () => {
  it("every engine steps without a canvas and draws onto a stub context", () => {
    const ctx = stubCtx();
    for (const id of CATALOG_IDS) {
      const m = createModule(id)!;
      m.init(makeCtx());
      m.reset(7);
      for (let i = 0; i < 10; i++) m.step(1 / 60);
      m.draw(ctx);
      m.draw(ctx);
      const readouts = m.getReadouts();
      expect(readouts.length, id).toBeGreaterThan(0);
      for (const r of readouts) {
        expect(typeof r.label).toBe("string");
        expect(typeof r.value).toBe("string");
      }
      m.dispose();
    }
  });
});

describe("runner", () => {
  beforeEach(() => {
    rafQueue = [];
    cancelledRafIds = [];
    rafIdCounter = 0;
    documentHidden = false;
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return ++rafIdCounter;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      cancelledRafIds.push(id);
    });
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    rafQueue = [];
    cancelledRafIds = [];
    setDocumentHidden(false);
    vi.unstubAllGlobals();
  });

  it("refuses a second runner on the same canvas (one loop per canvas)", () => {
    const canvas = makeCanvas();
    const r1 = new SimRunner(canvas);
    expect(() => new SimRunner(canvas)).toThrow(/already owned/);
    expect(isCanvasOwned(canvas)).toBe(true);
    r1.dispose();
    expect(isCanvasOwned(canvas)).toBe(false);
    const r2 = new SimRunner(canvas); // released by dispose
    r2.dispose();
  });

  it("clamps dt to MAX_DT even on huge frame gaps", () => {
    expect(clampDt(1e9)).toBe(MAX_DT);
    expect(clampDt(-5)).toBe(0);
    const canvas = makeCanvas();
    const runner = new SimRunner(canvas);
    let last: Readout[] = [];
    runner.onReadouts = (r) => {
      last = r;
    };
    runner.setScene({ engineId: "rc_circuit", parameters: { resistance: 1000, capacitance: 100e-6, voltage: 5 }, seed: 1 });
    // frame 1 establishes the clock; frames 2-4 accumulate 0.05 s steps
    fireFrame(1000);
    fireFrame(1050);
    fireFrame(1100);
    fireFrame(1150);
    const v = readoutValue(last, "Voltage");
    // clamped: 5(1−e^−1.5) ≈ 3.88; unclamped (0.5 s step) would be 4.97
    expect(v).toBeGreaterThan(3.0);
    expect(v).toBeLessThan(4.5);
    // a huge jump afterwards must not corrupt the sim (still finite, still charging)
    fireFrame(20000);
    const v2 = readoutValue(last, "Voltage");
    expect(Number.isFinite(v2)).toBe(true);
    runner.dispose();
  });

  it("dispose cancels the loop, disconnects the observer and frees the canvas", () => {
    const canvas = makeCanvas();
    const runner = new SimRunner(canvas);
    runner.setScene({ engineId: "pendulum" });
    fireFrame(1000);
    expect(rafQueue.length).toBe(1);
    runner.dispose();
    expect(cancelledRafIds.length).toBeGreaterThan(0);
    expect(rafQueue.length).toBe(1); // stale callback remains queued but is inert
    fireFrame(2000); // old loop must not reschedule after dispose
    expect(rafQueue.length).toBe(0);
    expect(isCanvasOwned(canvas)).toBe(false);
    const again = new SimRunner(canvas);
    again.dispose();
  });

  it("pauses when the document becomes hidden", () => {
    const canvas = makeCanvas();
    const runner = new SimRunner(canvas);
    let last: Readout[] = [];
    runner.onReadouts = (r) => {
      last = r;
    };
    runner.setScene({ engineId: "rc_circuit", parameters: { resistance: 1000, capacitance: 100e-6, voltage: 5 }, seed: 1 });
    setDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    fireFrame(1000);
    fireFrame(1050);
    fireFrame(1100);
    fireFrame(1150);
    expect(readoutValue(last, "Voltage")).toBe(0); // paused: no advance
    runner.setPlaying(true);
    fireFrame(1200);
    fireFrame(1250);
    fireFrame(1300);
    fireFrame(1350);
    expect(readoutValue(last, "Voltage")).toBeGreaterThan(3.0);
    runner.dispose();
  });

  it("setScene throws on unknown engine ids (no silent swap)", () => {
    const canvas = makeCanvas();
    const runner = new SimRunner(canvas);
    expect(() => runner.setScene({ engineId: "definitely_not_an_engine" } as SceneSpec)).toThrow(/unknown engine id/);
    runner.dispose();
  });
});
