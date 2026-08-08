/**
 * Newton semantic overlay tests (Wave 3, FIX 17) — the canonical identity
 * surface for the pure-2D newton_second_law engine.
 *
 * Contracts pinned here:
 *  - P4/P5: getVisualState() emits EXACTLY the engine closure's math —
 *    position/velocity from the semi-implicit Euler integration, acceleration
 *    = force/mass, force/mass the current parameters — nothing invented.
 *  - ADDITIVE-only: scalarBodies is the only new shape; existing
 *    EngineVisualState shapes (orbits/charges/waves) are byte-identical.
 *  - The runner forwards scalarBodies at the visual-state cadence (setScene,
 *    loop emissions, reset).
 *  - Stage-level: identity regions resolve names; persistent labels anchor at
 *    the engine's draw-space layout; the details card readouts (Mass /
 *    Applied force / Acceleration) match the engine values; the keyboard list
 *    is focusable without a tab trap; other engines render exactly as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  DemonstrationStage,
  newtonLayout,
  newtonRegionAt,
  NEWTON_REGION_IDS,
  NEWTON_REGIONS,
  type NewtonScalarBody,
} from "@/components/demonstrations/demonstration-stage";
import { createModule } from "@/demonstrations/renderers/lumina-2d/registry";
import { SimRunner } from "@/demonstrations/renderers/lumina-2d/runner";
import type {
  EngineVisualState,
  SimContext,
  SimulationModule,
} from "@/demonstrations/renderers/lumina-2d/types";
import type { DemoSpecV1 } from "@/demonstrations/spec/demo-spec";
import { validateDemoSpec } from "@/demonstrations/validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** The block's canonical state at the newton engine's defaults. */
function defaultBody(): NewtonScalarBody {
  return {
    position: 0,
    velocity: 0,
    acceleration: 5,
    force: 10,
    mass: 2,
  };
}

function expectFiniteScalarBody(body: NewtonScalarBody): void {
  for (const [key, value] of Object.entries(body)) {
    expect(Number.isFinite(value), key).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function newtonSpec(): DemoSpecV1 {
  return {
    schemaVersion: 1,
    id: "demo-newton",
    generationId: "gen-newton-1",
    userQuery: "How does force affect acceleration?",
    normalizedConcept: "Newton's second law",
    title: "Newton's Second Law",
    learningObjective: "See how force and mass determine acceleration (a = F/m).",
    trust: {
      level: "verified_simulation",
      label: "Verified simulation",
      limitations: ["Idealized one-dimensional constant-force model: no friction, no rotation, no changing mass."],
      engineId: "newton_second_law",
      engineVersion: "1.0.0",
    },
    renderer: {
      kind: "lumina_2d",
      fallbackKind: "data_table",
      preferredAspectRatio: 4 / 3,
      background: "dark",
    },
    simulation: {
      engineId: "newton_second_law",
      engineVersion: "1.0.0",
      seed: 1,
      parameters: [
        { key: "force", label: "Applied force", min: 1, max: 50, step: 1, value: 10, unit: "N" },
        { key: "mass", label: "Mass", min: 0.5, max: 10, step: 0.5, value: 2, unit: "kg" },
      ],
      readouts: [
        { key: "acceleration", label: "Acceleration", format: "fixed2" },
        { key: "velocity", label: "Velocity", format: "fixed2" },
        { key: "distance", label: "Distance", format: "fixed2" },
      ],
    },
    controls: [
      { id: "force-control", type: "slider", label: "Applied force", target: { kind: "parameter", ref: "force" }, min: 1, max: 50, step: 1 },
      { id: "mass-control", type: "slider", label: "Mass", target: { kind: "parameter", ref: "mass" }, min: 0.5, max: 10, step: 0.5 },
      { id: "play-control", type: "play_pause", label: "Play", target: { kind: "scene", ref: "play_pause" } },
    ],
    prediction: {
      prompt: "If the applied force doubles while the mass stays the same, what happens to the acceleration?",
      options: [
        "The acceleration doubles",
        "The acceleration halves",
        "The acceleration stays the same",
        "The acceleration drops to zero",
      ],
      correctIndex: 0,
    },
    observationPrompts: [
      { prompt: "Watch how the acceleration readout changes when you raise the force." },
      { prompt: "Double the mass and describe what happens to the acceleration." },
    ],
    representations: [
      { id: "rep-stage", kind: "stage_2d", label: "Stage" },
      { id: "rep-table", kind: "table", label: "Data table" },
    ],
    adaptationContext: { allowed: true, oneVariableMode: true },
    provenance: {
      source: "curated_engine",
      templateIds: [],
      generatedAt: "2026-08-04T00:00:00.000Z",
      model: "test-model",
    },
    limits: {
      maxObjects: 80,
      maxParticles: 1500,
      maxTimelineEvents: 30,
      maxControls: 6,
    },
  };
}

/** A non-newton lumina_2d spec (pendulum) — must render exactly as before. */
function pendulumSpec(): DemoSpecV1 {
  const spec = newtonSpec();
  spec.id = "demo-pendulum";
  spec.title = "Pendulum Motion";
  spec.trust.engineId = "pendulum";
  spec.simulation = {
    engineId: "pendulum",
    engineVersion: "1.0.0",
    seed: 42,
    parameters: [
      { key: "length", label: "Pendulum length", min: 0.1, max: 5, step: 0.1, value: 1.2, unit: "m" },
      { key: "amplitude", label: "Amplitude", min: 5, max: 90, step: 5, value: 30, unit: "°" },
    ],
    readouts: [
      { key: "period", label: "Period", format: "fixed2" },
      { key: "angle", label: "Angle", format: "fixed2" },
    ],
  };
  spec.controls = [
    { id: "length-control", type: "slider", label: "Pendulum length", target: { kind: "parameter", ref: "length" }, min: 0.1, max: 5, step: 0.1 },
    { id: "amplitude-control", type: "slider", label: "Amplitude", target: { kind: "parameter", ref: "amplitude" }, min: 5, max: 90, step: 5 },
    { id: "play-control", type: "play_pause", label: "Play", target: { kind: "scene", ref: "play_pause" } },
  ];
  return spec;
}

// ---------------------------------------------------------------------------
// Engine contract: P4/P5 — emitted state equals the closure math
// ---------------------------------------------------------------------------

describe("newton_second_law getVisualState", () => {
  it("emits the block's canonical scalar state at the seeded defaults", () => {
    const m = makeModule("newton_second_law");
    const block = visualState(m).scalarBodies?.block;
    expect(block).toBeDefined();
    expect(block!.position).toBe(0);
    expect(block!.velocity).toBe(0);
    expect(block!.acceleration).toBeCloseTo(10 / 2, 9);
    expect(block!.force).toBe(10);
    expect(block!.mass).toBe(2);
  });

  it("advances exactly with the closure's semi-implicit Euler math (P4/P5)", () => {
    const m = makeModule("newton_second_law");
    m.setParameter("force", 20);
    m.setParameter("mass", 4); // a = 5 m/s²
    let v = 0;
    let x = 0;
    for (let i = 0; i < 10; i++) {
      const dt = 0.05;
      m.step(dt);
      const a = 20 / 4;
      // The engine integrates v += a·dt; x += v·dt — replay it verbatim.
      v += a * dt;
      x += v * dt;
      const block = visualState(m).scalarBodies!.block;
      expect(block.velocity, `step ${i}`).toBe(v);
      expect(block.position, `step ${i}`).toBe(x);
      expect(block.acceleration, `step ${i}`).toBe(a);
      expect(block.force, `step ${i}`).toBe(20);
      expect(block.mass, `step ${i}`).toBe(4);
    }
  });

  it("a parameter change updates acceleration immediately and keeps velocity (honest mid-run change)", () => {
    const m = makeModule("newton_second_law");
    m.step(0.1); // defaults: a = 5 → v = 0.5
    expect(visualState(m).scalarBodies!.block.velocity).toBe(0.5);
    m.setParameter("force", 30); // a becomes 15; velocity is untouched
    const block = visualState(m).scalarBodies!.block;
    expect(block.acceleration).toBe(15);
    expect(block.force).toBe(30);
    expect(block.velocity).toBe(0.5);
    expect(block.position).toBe(0.5 * 0.1);
  });

  it("stays finite across a long run and under the sim-time cap", () => {
    const m = makeModule("newton_second_law");
    m.setParameter("force", 50);
    m.setParameter("mass", 0.5); // a = 100 m/s² — fastest legal configuration
    for (let i = 0; i < 300; i++) m.step(1 / 60);
    const block = visualState(m).scalarBodies!.block;
    expectFiniteScalarBody(block);
    const s = m.serializeState() as { simTime: number };
    expect(s.simTime).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// Additive-only: no existing EngineVisualState shape changes
// ---------------------------------------------------------------------------

describe("scalarBodies is additive-only", () => {
  it("newton carries scalarBodies and none of the other shapes", () => {
    const state = visualState(makeModule("newton_second_law"));
    expect(state.scalarBodies?.block).toBeDefined();
    expect(state.bodies).toBeUndefined();
    expect(state.velocity).toBeUndefined();
    expect(state.reaimed).toBeUndefined();
    expect(state.epoch).toBeUndefined();
    expect(state.field).toBeUndefined();
    expect(state.surface).toBeUndefined();
  });

  it("orbits/charges/waves keep their exact shapes and gain nothing", () => {
    const orbits = visualState(makeModule("orbits"));
    expect(orbits.bodies).toBeDefined();
    expect(orbits.velocity).toBeDefined();
    expect(typeof orbits.reaimed).toBe("boolean");
    expect(typeof orbits.epoch).toBe("number");
    expect(orbits.scalarBodies).toBeUndefined();

    const charges = visualState(makeModule("charges"));
    expect(charges.bodies).toBeDefined();
    expect(charges.field).toBeDefined();
    expect(charges.scalarBodies).toBeUndefined();

    const waves = visualState(makeModule("waves"));
    expect(waves.bodies).toBeDefined();
    expect(waves.surface).toBeDefined();
    expect(waves.scalarBodies).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Runner forwarding (fake rAF queue, same harness as lumina-2d.test.ts)
// ---------------------------------------------------------------------------

let rafQueue: Array<(t: number) => void> = [];
let rafIdCounter = 0;

function fireFrame(now: number) {
  const cb = rafQueue.shift();
  if (cb) cb(now);
}

function makeCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("runner forwards newton scalarBodies", () => {
  beforeEach(() => {
    rafQueue = [];
    rafIdCounter = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafQueue.push(cb);
      return ++rafIdCounter;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    rafQueue = [];
    vi.unstubAllGlobals();
  });

  it("emits on setScene, on the loop cadence and on reset — always the closure math", () => {
    const canvas = makeCanvas();
    const runner = new SimRunner(canvas);
    const states: EngineVisualState[] = [];
    runner.onVisualState = (s) => states.push(s);

    // setScene emits the initial state synchronously (coupled surfaces render
    // defaults immediately).
    runner.setScene({
      engineId: "newton_second_law",
      parameters: { force: 20, mass: 4 },
      seed: 1,
    });
    expect(states.length).toBe(1);
    expect(states[0].scalarBodies?.block).toEqual({
      position: 0,
      velocity: 0,
      acceleration: 5,
      force: 20,
      mass: 4,
    });

    // Frame 1 establishes the clock; each loop frame advances at most
    // MAX_DT (0.05 s) of sim time, so the first visual-state emission lands
    // on frame 3 (visualAcc 0.05 + 0.05 ≥ 0.066) with v = a·2·0.05.
    fireFrame(1000);
    fireFrame(1066);
    fireFrame(1132);
    expect(states.length).toBeGreaterThanOrEqual(2);
    const block = states[states.length - 1].scalarBodies!.block;
    expect(block.velocity).toBe(5 * 0.05 * 2);
    expect(block.position).toBe(0.0125 + 0.025);
    expect(block.acceleration).toBe(5);

    // reset re-seeds the canonical state immediately.
    runner.reset();
    const resetBlock = states[states.length - 1].scalarBodies!.block;
    expect(resetBlock.velocity).toBe(0);
    expect(resetBlock.position).toBe(0);
    expect(resetBlock.acceleration).toBe(5);
    runner.dispose();
  });

  it("never emits for engines without getVisualState (untouched flow)", () => {
    const canvas = makeCanvas();
    const runner = new SimRunner(canvas);
    let emitted = 0;
    runner.onVisualState = () => emitted++;
    runner.setScene({ engineId: "pendulum" });
    fireFrame(1000);
    fireFrame(1066);
    expect(emitted).toBe(0);
    runner.dispose();
  });
});

// ---------------------------------------------------------------------------
// Layout + identity regions (pure functions, engine draw-space mirror)
// ---------------------------------------------------------------------------

describe("newton identity regions resolve names (FIX 17)", () => {
  const body = defaultBody(); // position 0 → block at the track's left end

  it("anchors the block and vectors at the engine's draw-space layout", () => {
    const layout = newtonLayout(body, 800, 600);
    // Mirrors draw(): pad = 48, trackY = 372, blockW = 40, block at (48, 350).
    expect(layout.block).toEqual({ x: 48, y: 350, w: 40, h: 36 });
    // Force arrow: 24 + (10/50)·90 = 42 px from the block's right edge.
    expect(layout.force).toEqual({ x: 92, y: 362, w: 42, h: 16 });
    // Velocity arrow: below the track, min 24 px at rest.
    expect(layout.velocity).toEqual({ x: 68, y: 386, w: 24, h: 16 });
  });

  it("resolves every region to its canonical name", () => {
    expect(newtonRegionAt(body, 800, 600, 68, 368)).toBe("block"); // block center
    expect(newtonRegionAt(body, 800, 600, 113, 370)).toBe("force"); // F arrow
    expect(newtonRegionAt(body, 800, 600, 78, 394)).toBe("velocity"); // v arrow
    expect(newtonRegionAt(body, 800, 600, 68, 316)).toBe("acceleration"); // label
    expect(newtonRegionAt(body, 800, 600, 700, 100)).toBeNull(); // empty sky
    for (const id of NEWTON_REGION_IDS) {
      expect(NEWTON_REGIONS[id].name.length).toBeGreaterThan(0);
      expect(NEWTON_REGIONS[id].description.length).toBeGreaterThan(0);
    }
  });

  it("moves with the block as the position integrates (P4: same values as draw())", () => {
    const moving: NewtonScalarBody = { ...body, position: 500 }; // frac 0.5
    const layout = newtonLayout(moving, 800, 600);
    // bx = 48 + 0.5·664 = 380; blockW stays 40.
    expect(layout.block.x).toBe(380);
    expect(newtonRegionAt(moving, 800, 600, 400, 368)).toBe("block");
    expect(newtonRegionAt(moving, 800, 600, 430, 370)).toBe("force");
  });

  it("grows the velocity region with the engine's velocity (P5: v·6 + 10, capped 140)", () => {
    const fast: NewtonScalarBody = { ...body, velocity: 20 };
    const layout = newtonLayout(fast, 800, 600);
    expect(layout.velocity.w).toBe(Math.min(140, 10 + 20 * 6));
    const faster: NewtonScalarBody = { ...body, velocity: 200 };
    expect(newtonLayout(faster, 800, 600).velocity.w).toBe(140);
  });
});

// ---------------------------------------------------------------------------
// Stage-level: overlay, hover/tap identity, details card, keyboard
// ---------------------------------------------------------------------------

describe("Lumina2DStage newton identity layer", () => {
  const rect = {
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect as DOMRect
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderNewtonStage(reducedMotion = false) {
    const spec = newtonSpec();
    expect(validateDemoSpec(JSON.stringify(spec)).status).toBe("valid");
    render(
      <DemonstrationStage
        spec={spec}
        parameters={{ force: 10, mass: 2 }}
        playing={false}
        speed={1}
        resetSignal={0}
        reducedMotion={reducedMotion}
        readouts={[]}
        onReadouts={() => {}}
      />
    );
    // The canvas box is the wrapper the engine draw space maps to.
    const canvas = screen.getByLabelText("Newton's Second Law simulation canvas");
    return canvas.parentElement as HTMLElement;
  }

  it("renders the persistent labels and the keyboard list for newton", () => {
    renderNewtonStage();
    // The label text appears twice (overlay pill + keyboard list item), so
    // assert presence rather than uniqueness.
    for (const text of ["Applied force F", "Velocity v", "Acceleration a", "m"]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }

    const list = screen.getByRole("list", { name: "Model objects" });
    expect(list).toHaveAttribute("tabindex", "0");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("aria-label"))).toEqual([
      "Mass m",
      "Applied force F",
      "Velocity v",
      "Acceleration a",
    ]);
    for (const item of items) expect(item).toHaveAttribute("tabindex", "0");
  });

  it("hover over the block resolves Mass m with a one-line description (tooltip + details card)", () => {
    const wrapper = renderNewtonStage();
    // Block center at the defaults (68, 368) in the engine draw space.
    fireEvent.pointerMove(wrapper, { clientX: 68, clientY: 368 });

    const tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByText("Mass m")).toBeInTheDocument();
    expect(tooltip.textContent).toContain("pushed block");

    const card = screen.getByRole("region", { name: "Details: Mass m" });
    expect(within(card).getByText("Block")).toBeInTheDocument();

    fireEvent.pointerLeave(wrapper);
    expect(screen.queryByRole("region", { name: "Details: Mass m" })).not.toBeInTheDocument();
  });

  it("pointer over the force or velocity arrow resolves the vector identity", () => {
    const wrapper = renderNewtonStage();
    // F arrow (113, 370).
    fireEvent.pointerMove(wrapper, { clientX: 113, clientY: 370 });
    expect(
      screen.getByRole("region", { name: "Details: Applied force F" })
    ).toBeInTheDocument();
    // v arrow (78, 394).
    fireEvent.pointerMove(wrapper, { clientX: 78, clientY: 394 });
    expect(
      screen.getByRole("region", { name: "Details: Velocity v" })
    ).toBeInTheDocument();
    // Acceleration label region (68, 316).
    fireEvent.pointerMove(wrapper, { clientX: 68, clientY: 316 });
    expect(
      screen.getByRole("region", { name: "Details: Acceleration a" })
    ).toBeInTheDocument();
  });

  it("details readouts match the engine values (Mass / Applied force / Acceleration)", () => {
    const engine = makeModule("newton_second_law");
    const block = visualState(engine).scalarBodies!.block;
    expect(block.mass).toBe(2);
    expect(block.force).toBe(10);
    expect(block.acceleration).toBe(5);

    const wrapper = renderNewtonStage();
    fireEvent.pointerMove(wrapper, { clientX: 68, clientY: 368 });
    const card = screen.getByRole("region", { name: "Details: Mass m" });
    expect(within(card).getByText("2.0 kg")).toBeInTheDocument();
    expect(within(card).getByText("10.0 N")).toBeInTheDocument();
    expect(within(card).getByText("5.00 m/s²")).toBeInTheDocument();
  });

  it("keyboard: the list is focusable without a tab trap and Enter pins the card", () => {
    renderNewtonStage();
    const item = screen.getByRole("listitem", { name: "Applied force F" });
    item.focus();
    fireEvent.keyDown(item, { key: "Enter" });
    const card = screen.getByRole("region", { name: "Details: Applied force F" });
    expect(within(card).getByText("Force vector")).toBeInTheDocument();
    expect(within(card).getByText("10.0 N")).toBeInTheDocument();
    // Space also activates.
    fireEvent.keyDown(screen.getByRole("listitem", { name: "Acceleration a" }), {
      key: " ",
    });
    expect(
      screen.getByRole("region", { name: "Details: Acceleration a" })
    ).toBeInTheDocument();
  });

  it("renders statically under reducedMotion (same labels, no motion surface)", () => {
    renderNewtonStage(true);
    expect(screen.getAllByText("Applied force F").length).toBeGreaterThan(0);
    expect(screen.getByRole("list", { name: "Model objects" })).toBeInTheDocument();
  });

  it("leaves every other engine's stage untouched (no identity layer)", () => {
    const spec = pendulumSpec();
    expect(validateDemoSpec(JSON.stringify(spec)).status).toBe("valid");
    render(
      <DemonstrationStage
        spec={spec}
        parameters={{ length: 1.2, amplitude: 30 }}
        playing={false}
        speed={1}
        resetSignal={0}
        reducedMotion={false}
        readouts={[]}
        onReadouts={() => {}}
      />
    );
    expect(screen.getByLabelText("Pendulum Motion simulation canvas")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Model objects" })).not.toBeInTheDocument();
    expect(screen.queryByText("Applied force F")).not.toBeInTheDocument();
    expect(screen.queryByText("Acceleration a")).not.toBeInTheDocument();
  });
});
