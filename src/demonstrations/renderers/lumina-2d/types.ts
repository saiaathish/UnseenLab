/**
 * Shared contracts for the Lumina 2D engine namespace.
 *
 * A SimulationModule owns simulation state only. The SimRunner (runner.ts)
 * owns the canvas, the animation loop, input, DPR and time; a module never
 * touches the DOM. This keeps modules tiny, deterministic and testable.
 */

export interface SimContext {
  /** Logical (CSS px) canvas size. */
  width: number;
  height: number;
  /** Device pixel ratio (capped at 2 by the runner; 1.5 on mobile viewports). */
  dpr: number;
  /** Total elapsed simulated time in seconds. */
  time: number;
  /**
   * Lets a module push a parameter value back to the UI (e.g. dragging to aim
   * a projectile moves the "angle" slider). Wired by the runner; safe no-op by
   * default. Never call from draw() — only from step()/pointer().
   */
  emit?: (key: string, value: number) => void;
}

export interface Readout {
  label: string;
  /** Pre-formatted display string. */
  value: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// Engine visual state — the canonical-state coupling contract
// ---------------------------------------------------------------------------
//
// An engine may expose its CURRENT quantitative state to other surfaces (the
// primitive-3d stage in hybrid showcases) via getVisualState(). This is the
// single channel that guarantees every learner-visible control modifies
// canonical engine state and every coupled 3D visual reads that same state:
// readouts, table, 2D view and 3D stage then cannot diverge.
//
// Coordinate conventions (documented so the coupling layer can map engine
// space to world space deterministically, independent of the live canvas
// size — the hidden 2D engine stage can run on a 1x1 canvas):
//  - orbits bodies: engine units, origin at the canvas centre (the engine's
//    own simulation coordinates; already resolution-independent).
//  - charges bodies: CENTERED canvas px (x - W/2, y - H/2) — the charge
//    separation is a parameter, so these are resolution-independent.
//  - charges field: vectors at CENTERED canvas px; `span` is the half-extent
//    px the grid covers (cells at (i+0.5)/width*2*span - span). `span` lets
//    the 3D renderer map any world position back to a grid cell.
//  - waves bodies: normalized grid coordinates: x = col/GW - 0.5,
//    y = row/GH - 0.5 (row = grid row j), matching the surface sampling
//    convention used by the renderer (see renderer.ts applyEngineSurface).
//  - waves surface: row-major u-field values (index j*width + i).
//  - newton scalarBodies: the block's one-dimensional kinematic state in
//    engine units (position/velocity in m, m/s; acceleration = force/mass in
//    m/s²; force/mass the current parameters). The 2D stage's semantic
//    identity layer (labels, hover regions, details card) reads ONLY this
//    state, so the overlay can never diverge from the canonical engine.
//
// All numbers must be finite.

/** One sampled field vector on the charges engine's grid. */
export interface EngineFieldVector {
  /** Centered canvas px x of the grid cell. */
  x: number;
  /** Centered canvas px y of the grid cell. */
  y: number;
  /** Field x component at the cell (engine units, fieldScale applied). */
  ex: number;
  /** Field y component at the cell. */
  ey: number;
  /** Math.hypot(ex, ey). */
  magnitude: number;
}

export interface EngineVisualState {
  /**
   * Keyed body positions (e.g. { star, planet } for orbits,
   * { charge1, charge2 } for charges, { source1, source2 } for waves).
   */
  bodies?: Record<string, { x: number; y: number }>;
  /**
   * orbits only (ADDITIVE — trajectory seam, root-cause §2): per-body
   * velocity in engine units/s at snapshot time. The coupled 3D surface uses
   * it for velocity vectors and for the honest escape classification of the
   * debug seam. Absent on engines that do not track velocity cheaply.
   */
  velocity?: Record<string, { x: number; y: number }>;
  /**
   * orbits only (ADDITIVE — trajectory seam, root-cause §2): true once a
   * learner-visible re-aim happened (a non-g parameter change or a drag
   * release teleported the body via placeBodies). PERSISTENT — never
   * consumed by the accessor: getVisualState is a pure read (the 2D consumer
   * and repeat polls must not mutate the canonical state — coupling pin), so
   * the renderer detects the false->true EDGE and, authoritatively, the
   * `epoch` counter flip.
   */
  reaimed?: boolean;
  /**
   * orbits only (ADDITIVE — trajectory seam, root-cause §2): monotone re-aim
   * epoch, ++ per learner-visible re-aim (non-g setParameter / drag release;
   * init and reset do NOT bump — a parameter-only restore must reproduce the
   * same canonical state as a from-scratch run, coupling replay pin). The 3D
   * renderer clears a body's trail exactly once per epoch flip, so the next
   * recorded point starts a fresh segment (never an old-last -> new-start
   * teleport connector).
   */
  epoch?: number;
  /**
   * orbits only (ADDITIVE — escape classification): the current launch-speed
   * parameter (the engine's escape regime is speed >= sqrt(2); the engine
   * never clamps). The debug seam uses it to classify bound vs escape.
   */
  speed?: number;
  /**
   * orbits only (ADDITIVE — escape classification): the current orbit-distance
   * parameter — the launch (apoapsis) distance of the last re-aim, engine
   * units. No bound orbit ever exceeds it; an escape grows past it.
   */
  distance?: number;
  /** charges only: a bounded vector-field grid. */
  field?: {
    vectors: EngineFieldVector[];
    width: number;
    height: number;
    /** Half-extent px the grid spans (cells cover [-span, span]^2). */
    span: number;
  };
  /** waves only: the u field, row-major. */
  surface?: {
    values: number[];
    width: number;
    height: number;
  };
  /**
   * newton_second_law only (ADDITIVE — semantic overlay): per-body
   * one-dimensional kinematic state at snapshot time. The block's values are
   * the engine's OWN numbers — the same position/velocity the readouts
   * summarize and the same force/mass parameters the sliders hold — so a
   * coupled identity surface (persistent labels, hover regions, details card)
   * is anchored to canonical engine state, never to anything invented. All
   * numbers finite.
   */
  scalarBodies?: Record<
    string,
    {
      /** Integrated position, m (true kinematics, not the clamped draw frac). */
      position: number;
      /** Semi-implicit-Euler integrated velocity, m/s. */
      velocity: number;
      /** force / mass at snapshot time, m/s². */
      acceleration: number;
      /** Current force parameter, N. */
      force: number;
      /** Current mass parameter, kg. */
      mass: number;
    }
  >;
}

export interface SimPointer {
  x: number;
  y: number;
  type: "down" | "move" | "up" | "leave";
  buttons: number;
}

export interface EngineParameterBounds {
  min: number;
  max: number;
}

/** Static metadata for one engine, mirroring the demo-spec capability catalog. */
export interface EngineMeta {
  /** ENGINE_CATALOG id (orbits, projectile, …). */
  id: string;
  title: string;
  /** Exact parameter keys the engine understands. */
  parameterKeys: string[];
  /** Exact readout keys the engine exposes (as readout labels). */
  readoutKeys: string[];
  /** Default values for every parameter key. */
  defaults: Record<string, number>;
  /** Clamp bounds applied by setParameter for every parameter key. */
  bounds: Record<string, EngineParameterBounds>;
}

/**
 * Every Lumina 2D simulation implements this contract. The runner owns the
 * canvas and the animation loop; a module only advances its own state, draws
 * itself, and exposes deterministic state for replay.
 */
export interface SimulationModule {
  /** Configure the module for a canvas of this size. */
  init(context: SimContext): void;
  /** React to a canvas resize (CSS px + dpr). */
  resize(width: number, height: number, dpr: number): void;
  /** Advance the simulation by `deltaTime` seconds. State only — no drawing. */
  step(deltaTime: number): void;
  /** Render the current state. Must tolerate a stub 2D context. */
  draw(g: CanvasRenderingContext2D): void;
  /**
   * Update one parameter by its catalog key. Values are clamped to the
   * engine's declared bounds before being applied.
   */
  setParameter(key: string, value: number): void;
  /** Optional pointer interaction (drag, paint, aim…). */
  pointer?(p: SimPointer): void;
  /** Restore the initial configuration. `seed` reseeds the internal PRNG. */
  reset(seed?: number): void;
  /** Human-facing readouts for the UI. */
  getReadouts(): Readout[];
  /**
   * OPTIONAL: the engine's current quantitative state for coupled surfaces
   * (the primitive-3d stage in hybrid showcases). The runner polls this at a
   * bounded rate and forwards it via onVisualState. Modules that do not
   * implement it are untouched — the lumina-2d-only flow behaves exactly as
   * before. Coordinate conventions are documented on EngineVisualState.
   */
  getVisualState?(): EngineVisualState | null;
  /** JSON-safe snapshot of the full simulation state (for replay). */
  serializeState(): unknown;
  /** Restore a state produced by serializeState(). */
  restoreState(state: unknown): void;
  /** Release any resources (timers, offscreen canvases…). */
  dispose(): void;
}
