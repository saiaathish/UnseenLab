/**
 * newton_second_law — a single block pushed by a constant horizontal force.
 *
 * Physics: a = F / m (constant while parameters are unchanged). The block
 * starts at rest; velocity integrates piecewise-constant acceleration
 * (v += a·dt), position integrates velocity (x += v·dt). Changing force or
 * mass mid-run keeps the current velocity and continues with the new
 * acceleration — physically honest for a constant applied force.
 *
 * Deterministic: no PRNG, no wall-clock dependence — identical parameters
 * produce identical trajectories.
 */

import type {
  EngineMeta,
  EngineVisualState,
  Readout,
  SimulationModule,
  SimContext,
} from "../types";

export const NEWTON_META: EngineMeta = {
  id: "newton_second_law",
  title: "Newton's Second Law",
  parameterKeys: ["force", "mass"],
  readoutKeys: ["acceleration", "velocity", "distance"],
  defaults: { force: 10, mass: 2 },
  bounds: {
    force: { min: 1, max: 50 },
    mass: { min: 0.5, max: 10 },
  },
};

/**
 * Simulation time cap — readouts stay finite and bounded. Exported so the
 * stage's semantic overlay can mirror the draw() position mapping (maxTravel)
 * with the same canonical constant.
 */
export const MAX_SIM_TIME = 20;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface NewtonState {
  simTime: number;
  velocity: number;
  position: number;
  params: Record<string, number>;
}

export function createNewtonSecondLaw(): SimulationModule {
  const params: Record<string, number> = { ...NEWTON_META.defaults };
  let simTime = 0;
  let velocity = 0;
  let position = 0;
  let W = 800;
  let H = 600;
  let dpr = 1;
  // Track layout in canvas px (recomputed on resize).
  let track = { x0: 0, x1: 0, y: 0, len: 0 };

  function acceleration(): number {
    return params.force / params.mass;
  }

  function layout() {
    const pad = Math.min(W, H) * 0.08;
    const y = H * 0.62;
    track = {
      x0: pad,
      x1: W - pad,
      y,
      len: Math.max(1, W - pad * 2),
    };
  }

  return {
    init(context: SimContext) {
      W = context.width;
      H = context.height;
      dpr = context.dpr;
      layout();
    },

    resize(width: number, height: number, newDpr: number) {
      W = width;
      H = height;
      dpr = newDpr;
      layout();
    },

    step(deltaTime: number) {
      if (!(deltaTime > 0)) return;
      const dt = Math.min(deltaTime, 0.1);
      simTime = Math.min(simTime + dt, MAX_SIM_TIME);
      const a = acceleration();
      // Semi-implicit Euler: v += a·dt; x += v·dt.
      velocity += a * dt;
      position += velocity * dt;
    },

    draw(g: CanvasRenderingContext2D) {
      if (!g || typeof g.fillRect !== "function") return;

      // Track.
      g.strokeStyle = "rgba(255,255,255,0.25)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(track.x0, track.y);
      g.lineTo(track.x1, track.y);
      g.stroke();

      // Block: position mapped into the track (clamped visually; readouts
      // keep the true kinematics).
      const blockW = Math.max(34, W * 0.05);
      const maxTravel = Math.max(1, params.force / params.mass * MAX_SIM_TIME * MAX_SIM_TIME * 0.5);
      const frac = clamp(position / maxTravel, 0, 1);
      const bx = track.x0 + frac * (track.len - blockW);
      const by = track.y - blockW * 0.55;

      // Force arrow (length ∝ force), pointing right from the block.
      const arrowLen = 24 + (params.force / 50) * 90;
      g.strokeStyle = "#5eead4";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(bx + blockW + 4, by + blockW / 2);
      g.lineTo(bx + blockW + 4 + arrowLen, by + blockW / 2);
      g.stroke();
      g.beginPath();
      g.moveTo(bx + blockW + 4 + arrowLen, by + blockW / 2);
      g.lineTo(bx + blockW + 4 + arrowLen - 8, by + blockW / 2 - 6);
      g.moveTo(bx + blockW + 4 + arrowLen, by + blockW / 2);
      g.lineTo(bx + blockW + 4 + arrowLen - 8, by + blockW / 2 + 6);
      g.stroke();

      // Velocity arrow (length ∝ speed), below the track.
      const vLen = Math.min(140, 10 + velocity * 6);
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bx + blockW / 2, track.y + 22);
      g.lineTo(bx + blockW / 2 + vLen, track.y + 22);
      g.stroke();

      // The block itself (rounded rect).
      g.fillStyle = "#2dd4bf";
      const r = 6;
      g.beginPath();
      g.roundRect(bx, by, blockW, blockW * 0.9, r);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 1;
      g.stroke();

      // Labels.
      if (typeof g.fillText === "function") {
        g.fillStyle = "#5eead4";
        g.font = `${12 * dpr}px system-ui, sans-serif`;
        g.fillText("F", bx + blockW + 4 + arrowLen / 2 - 3 * dpr, by + blockW / 2 - 8);
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillText("v", bx + blockW / 2 + vLen / 2 - 3 * dpr, track.y + 38);
      }
    },

    setParameter(key: string, value: number) {
      if (!(key in NEWTON_META.bounds)) return;
      const b = NEWTON_META.bounds[key as keyof typeof NEWTON_META.bounds];
      params[key] = clamp(value, b.min, b.max);
    },

    reset() {
      simTime = 0;
      velocity = 0;
      position = 0;
      params.force = NEWTON_META.defaults.force;
      params.mass = NEWTON_META.defaults.mass;
    },

    getReadouts(): Readout[] {
      const a = acceleration();
      return [
        { label: "Acceleration", value: `${a.toFixed(2)} m/s²` },
        { label: "Velocity", value: `${velocity.toFixed(2)} m/s` },
        { label: "Distance", value: `${position.toFixed(1)} m` },
      ];
    },

    /**
     * Canonical state for coupled surfaces: the block's full one-dimensional
     * kinematic state, in the engine's own units. Every number is the closure's
     * real value — position/velocity from the semi-implicit Euler integration
     * above, acceleration = force/mass, force/mass the current parameters — so
     * the semantic identity layer (persistent labels, hover regions, details
     * card) reads exactly what the readouts and sliders show. P4/P5 contract:
     * the emitted vectors derive from the engine math, never from display
     * formatting. PURE READ — never mutates simulation state.
     */
    getVisualState(): EngineVisualState {
      return {
        scalarBodies: {
          block: {
            position,
            velocity,
            acceleration: acceleration(),
            force: params.force,
            mass: params.mass,
          },
        },
      };
    },

    serializeState(): NewtonState {
      return { simTime, velocity, position, params: { ...params } };
    },

    restoreState(state: unknown) {
      if (!state || typeof state !== "object") return;
      const s = state as Partial<NewtonState>;
      if (typeof s.simTime === "number") simTime = s.simTime;
      if (typeof s.velocity === "number") velocity = s.velocity;
      if (typeof s.position === "number") position = s.position;
      if (s.params && typeof s.params === "object") {
        for (const key of Object.keys(params)) {
          if (typeof s.params[key] === "number") params[key] = s.params[key];
        }
      }
    },

    dispose() {
      // Nothing to release.
    },
  };
}
