/**
 * projectile — ballistic motion with optional quadratic air drag, RK4.
 *
 * World units are meters, y points up from the ground. The trajectory is
 * integrated numerically; with drag = 0 the landing range must match the
 * analytic parabola v²·sin(2θ)/g. The landing instant is refined by
 * bisection on the final substep so range/time-of-flight readouts stay sharp
 * even at coarse frame rates. The demo auto-relaunches after each landing.
 */

import type { EngineMeta, Readout, SimulationModule, SimContext } from "../types";

export const PROJECTILE_META: EngineMeta = {
  id: "projectile",
  title: "Projectile Motion",
  parameterKeys: ["angle", "speed", "drag", "gravity"],
  readoutKeys: ["range", "maxHeight", "timeOfFlight"],
  defaults: { angle: 50, speed: 30, drag: 0.008, gravity: 9.8 },
  bounds: {
    angle: { min: 1, max: 89 },
    speed: { min: 1, max: 200 },
    drag: { min: 0, max: 0.5 },
    gravity: { min: 0.1, max: 100 },
  },
};

const SUBSTEPS = 6;
const RELAUNCH_DELAY = 1.2; // seconds the demo holds after landing

interface ProjState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface ProjectileState {
  simTime: number;
  params: Record<string, number>;
  x: number;
  y: number;
  vx: number;
  vy: number;
  flying: boolean;
  landedTimer: number;
  flightClock: number;
  range: number;
  apex: number;
  timeOfFlight: number;
  path: number[];
}

export function createProjectile(): SimulationModule {
  const params: Record<string, number> = { ...PROJECTILE_META.defaults };

  let simTime = 0;
  let s: ProjState = { x: 0, y: 0, vx: 0, vy: 0 };
  let flying = false;
  let landedTimer = 0;
  let flightClock = 0;
  let range = 0;
  let apex = 0;
  let timeOfFlight = 0;
  let path: number[] = [];
  let W = 800;
  let H = 600;
  let scale = 6;

  const rad = () => (params.angle * Math.PI) / 180;

  function computeScale() {
    const a = rad();
    const R = (params.speed * params.speed * Math.sin(2 * a)) / params.gravity;
    const Hm = (params.speed * params.speed * Math.sin(a) * Math.sin(a)) / (2 * params.gravity);
    const availW = W * 0.86;
    const availH = H * 0.72;
    scale = clamp(Math.min(availW / Math.max(R, 1), availH / Math.max(Hm, 1)), 0.5, 60);
  }

  function launch() {
    const a = rad();
    s = {
      x: 0,
      y: 0,
      vx: Math.cos(a) * params.speed,
      vy: Math.sin(a) * params.speed,
    };
    flying = true;
    flightClock = 0;
    path = [0, 0];
    computeScale();
  }

  function derivs(st: ProjState): ProjState {
    const v = Math.hypot(st.vx, st.vy);
    return {
      x: st.vx,
      y: st.vy,
      vx: -params.drag * v * st.vx,
      vy: -params.gravity - params.drag * v * st.vy,
    };
  }

  function rk4Step(st: ProjState, h: number): ProjState {
    const a = derivs(st);
    const b = derivs({ x: st.x + (a.x * h) / 2, y: st.y + (a.y * h) / 2, vx: st.vx + (a.vx * h) / 2, vy: st.vy + (a.vy * h) / 2 });
    const c = derivs({ x: st.x + (b.x * h) / 2, y: st.y + (b.y * h) / 2, vx: st.vx + (b.vx * h) / 2, vy: st.vy + (b.vy * h) / 2 });
    const d = derivs({ x: st.x + c.x * h, y: st.y + c.y * h, vx: st.vx + c.vx * h, vy: st.vy + c.vy * h });
    return {
      x: st.x + ((a.x + 2 * b.x + 2 * c.x + d.x) * h) / 6,
      y: st.y + ((a.y + 2 * b.y + 2 * c.y + d.y) * h) / 6,
      vx: st.vx + ((a.vx + 2 * b.vx + 2 * c.vx + d.vx) * h) / 6,
      vy: st.vy + ((a.vy + 2 * b.vy + 2 * c.vy + d.vy) * h) / 6,
    };
  }

  /** Bisect the landing time inside the substep that crossed y = 0. */
  function refineLanding(st: ProjState, hSub: number): ProjState {
    let lo = 0; // y(lo) > 0
    let hi = hSub; // y(hi) <= 0
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (rk4Step(st, mid).y <= 0) hi = mid;
      else lo = mid;
    }
    const landed = rk4Step(st, (lo + hi) / 2);
    return { x: landed.x, y: 0, vx: landed.vx, vy: landed.vy };
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      launch();
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
      computeScale();
    },

    step(dt: number) {
      const h = Math.min(dt, 0.033);
      simTime += h;
      if (!flying) {
        landedTimer -= h;
        if (landedTimer <= 0) launch();
        return;
      }
      const hSub = h / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) {
        const start = { ...s };
        const next = rk4Step(start, hSub);
        if (next.y <= 0 && next.vy < 0) {
          const landed = refineLanding(start, hSub);
          s = { x: landed.x, y: 0, vx: landed.vx, vy: landed.vy };
          flying = false;
          range = s.x;
          timeOfFlight = flightClock + hSub;
          landedTimer = RELAUNCH_DELAY;
          break;
        }
        s = next;
        flightClock += hSub;
        apex = Math.max(apex, s.y);
      }
      if (flying) {
        path.push(s.x, s.y);
      }
    },

    draw(g: CanvasRenderingContext2D) {
      const groundY = H * 0.88;
      const launchX = W * 0.08;
      const sx = (wx: number) => launchX + wx * scale;
      const sy = (wy: number) => groundY - wy * scale;

      // ground
      g.strokeStyle = "rgba(52,211,153,0.55)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, groundY);
      g.lineTo(W, groundY);
      g.stroke();

      // ideal (vacuum) parabola for reference
      const a = rad();
      const vx0 = Math.cos(a) * params.speed;
      const vy0 = Math.sin(a) * params.speed;
      const T = (2 * vy0) / params.gravity;
      g.setLineDash([5, 6]);
      g.strokeStyle = "rgba(148,163,184,0.4)";
      g.lineWidth = 1.2;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * T;
        const px = sx(vx0 * t);
        const py = sy(vy0 * t - 0.5 * params.gravity * t * t);
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.stroke();
      g.setLineDash([]);

      // actual trajectory
      if (path.length > 2) {
        g.strokeStyle = "rgba(34,211,238,0.9)";
        g.lineWidth = 2.4;
        g.beginPath();
        for (let i = 0; i < path.length; i += 2) {
          i === 0 ? g.moveTo(sx(path[i]), sy(path[i + 1])) : g.lineTo(sx(path[i]), sy(path[i + 1]));
        }
        g.stroke();
      }

      // cannon
      g.save();
      g.translate(launchX, groundY);
      g.rotate(-a);
      g.fillStyle = "rgba(226,232,240,0.9)";
      g.fillRect(0, -5, 34, 10);
      g.restore();
      g.fillStyle = "rgba(148,163,184,0.9)";
      g.beginPath();
      g.arc(launchX, groundY, 9, 0, Math.PI * 2);
      g.fill();

      // projectile
      if (flying) {
        g.fillStyle = "#a5f3fc";
        g.beginPath();
        g.arc(sx(s.x), sy(s.y), 6, 0, Math.PI * 2);
        g.fill();
      }
    },

    setParameter(key: string, value: number) {
      const b = PROJECTILE_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
      apex = 0;
      launch();
    },

    reset() {
      apex = 0;
      range = 0;
      timeOfFlight = 0;
      launch();
    },

    getReadouts(): Readout[] {
      return [
        { label: "Range", value: range.toFixed(1) + " m", color: "#22d3ee" },
        { label: "Max height", value: apex.toFixed(1) + " m" },
        { label: "Time of flight", value: timeOfFlight.toFixed(2) + " s" },
      ];
    },

    serializeState(): ProjectileState {
      return {
        simTime,
        params: { ...params },
        x: s.x,
        y: s.y,
        vx: s.vx,
        vy: s.vy,
        flying,
        landedTimer,
        flightClock,
        range,
        apex,
        timeOfFlight,
        path: [...path],
      };
    },

    restoreState(state: unknown) {
      const st = state as ProjectileState;
      simTime = st.simTime;
      Object.assign(params, st.params);
      s = { x: st.x, y: st.y, vx: st.vx, vy: st.vy };
      flying = st.flying;
      landedTimer = st.landedTimer;
      flightClock = st.flightClock;
      range = st.range;
      apex = st.apex;
      timeOfFlight = st.timeOfFlight;
      path = [...st.path];
    },

    dispose() {
      path = [];
    },
  };
}
