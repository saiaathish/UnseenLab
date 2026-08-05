/**
 * pendulum — damped single pendulum integrated with RK4.
 *
 * θ'' = −(g/L)·sin θ − damping·ω. The period readout is measured live from
 * zero-crossings of θ (a full oscillation = two crossings), so it reflects
 * the actual large-amplitude / damped motion rather than the small-angle
 * formula.
 */

import type { EngineMeta, Readout, SimulationModule, SimContext } from "../types";

export const PENDULUM_META: EngineMeta = {
  id: "pendulum",
  title: "Pendulum",
  parameterKeys: ["length", "gravity", "amplitude", "damping"],
  readoutKeys: ["period", "angle"],
  defaults: { length: 1.5, gravity: 9.8, amplitude: 40, damping: 0.05 },
  bounds: {
    length: { min: 0.1, max: 10 },
    gravity: { min: 0.1, max: 100 },
    amplitude: { min: 1, max: 170 },
    damping: { min: 0, max: 3 },
  },
};

const SUBSTEPS = 8;
const MAX_TRAIL = 300;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface PendulumState {
  simTime: number;
  params: Record<string, number>;
  theta: number;
  omega: number;
  measuredPeriod: number;
  lastCrossTime: number;
  lastSgn: number;
}

export function createPendulum(): SimulationModule {
  const params: Record<string, number> = { ...PENDULUM_META.defaults };
  let simTime = 0;
  let theta = (params.amplitude * Math.PI) / 180;
  let omega = 0;
  let measuredPeriod = 0;
  let lastCrossTime = 0;
  let lastSgn = Math.sign(theta);
  let trail: number[] = [];
  let W = 800;
  let H = 600;

  function resetState() {
    theta = (params.amplitude * Math.PI) / 180;
    omega = 0;
    measuredPeriod = 0;
    lastCrossTime = 0;
    lastSgn = Math.sign(theta);
    trail = [];
  }

  function derivs(t: number, w: number): [number, number] {
    return [w, -(params.gravity / params.length) * Math.sin(t) - params.damping * w];
  }

  function rk4Step(t: number, w: number, h: number): [number, number] {
    const [a1, a2] = derivs(t, w);
    const [b1, b2] = derivs(t + (a1 * h) / 2, w + (a2 * h) / 2);
    const [c1, c2] = derivs(t + (b1 * h) / 2, w + (b2 * h) / 2);
    const [d1, d2] = derivs(t + c1 * h, w + c2 * h);
    return [
      t + ((a1 + 2 * b1 + 2 * c1 + d1) * h) / 6,
      w + ((a2 + 2 * b2 + 2 * c2 + d2) * h) / 6,
    ];
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      resetState();
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
    },

    step(dt: number) {
      const h = Math.min(dt, 0.033) / SUBSTEPS;
      simTime += Math.min(dt, 0.033);
      for (let s = 0; s < SUBSTEPS; s++) {
        [theta, omega] = rk4Step(theta, omega, h);
      }
      // zero-crossing period measurement: consecutive crossings are half a period
      const sgn = theta > 0 ? 1 : theta < 0 ? -1 : lastSgn;
      if (sgn !== lastSgn) {
        if (lastCrossTime > 0 && simTime > lastCrossTime) {
          measuredPeriod = 2 * (simTime - lastCrossTime);
        }
        lastCrossTime = simTime;
        lastSgn = sgn;
      }
      // trail in canvas space
      const cx = W / 2;
      const topY = H * 0.3;
      const bobR = Math.min(W, H) * 0.36;
      const bx = cx + Math.sin(theta) * bobR;
      const by = topY + Math.cos(theta) * bobR;
      trail.push(bx, by);
      if (trail.length > MAX_TRAIL * 2) trail.splice(0, trail.length - MAX_TRAIL * 2);
    },

    draw(g: CanvasRenderingContext2D) {
      const cx = W / 2;
      const topY = H * 0.3;
      const bobR = Math.min(W, H) * 0.36;
      const bx = cx + Math.sin(theta) * bobR;
      const by = topY + Math.cos(theta) * bobR;

      if (trail.length > 4) {
        g.lineWidth = 2;
        g.strokeStyle = "rgba(34,211,238,0.35)";
        g.beginPath();
        for (let i = 0; i < trail.length; i += 2) {
          if (i === 0) g.moveTo(trail[i], trail[i + 1]);
          else g.lineTo(trail[i], trail[i + 1]);
        }
        g.stroke();
      }

      g.fillStyle = "rgba(148,163,184,0.9)";
      g.beginPath();
      g.arc(cx, topY, 5, 0, Math.PI * 2);
      g.fill();

      g.strokeStyle = "rgba(226,232,240,0.85)";
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx, topY);
      g.lineTo(bx, by);
      g.stroke();

      g.fillStyle = "rgba(34,211,238,0.25)";
      g.beginPath();
      g.arc(bx, by, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#67e8f9";
      g.beginPath();
      g.arc(bx, by, 9, 0, Math.PI * 2);
      g.fill();
      g.lineCap = "butt";
    },

    setParameter(key: string, value: number) {
      const b = PENDULUM_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
      if (key === "amplitude") resetState();
    },

    reset() {
      resetState();
      simTime = 0;
    },

    getReadouts(): Readout[] {
      const deg = (theta * 180) / Math.PI;
      return [
        {
          label: "Period",
          value: measuredPeriod > 0 ? measuredPeriod.toFixed(2) + " s" : "…",
          color: "#22d3ee",
        },
        { label: "Angle", value: deg.toFixed(1) + "°" },
      ];
    },

    serializeState(): PendulumState {
      return {
        simTime,
        params: { ...params },
        theta,
        omega,
        measuredPeriod,
        lastCrossTime,
        lastSgn,
      };
    },

    restoreState(state: unknown) {
      const s = state as PendulumState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      theta = s.theta;
      omega = s.omega;
      measuredPeriod = s.measuredPeriod;
      lastCrossTime = s.lastCrossTime;
      lastSgn = s.lastSgn;
      trail = [];
    },

    dispose() {
      trail = [];
    },
  };
}
