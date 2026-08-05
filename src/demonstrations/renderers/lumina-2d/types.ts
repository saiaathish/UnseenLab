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
  /** JSON-safe snapshot of the full simulation state (for replay). */
  serializeState(): unknown;
  /** Restore a state produced by serializeState(). */
  restoreState(state: unknown): void;
  /** Release any resources (timers, offscreen canvases…). */
  dispose(): void;
}
