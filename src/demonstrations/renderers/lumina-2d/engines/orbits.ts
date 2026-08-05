/**
 * orbits — N-body inverse-square gravity integrated with RK4.
 *
 * A massive central star plus one orbiting planet; both feel each other's
 * gravity (a true two-body problem), so the relative orbit obeys Kepler's
 * third law with total mass M + m. The planet starts at apoapsis with the
 * tangential speed that produces the requested eccentricity; `speed` scales
 * that launch speed, `g` scales the gravitational constant.
 *
 * Deterministic: no randomness anywhere — same parameters, same trajectory.
 */

import type {
  EngineMeta,
  EngineVisualState,
  Readout,
  SimulationModule,
  SimContext,
  SimPointer,
} from "../types";

export const ORBITS_META: EngineMeta = {
  id: "orbits",
  title: "Gravity & Orbits",
  parameterKeys: ["g", "speed", "bodyMass", "eccentricity", "distance"],
  readoutKeys: ["period", "speed", "distance"],
  defaults: { g: 10, speed: 1, bodyMass: 1, eccentricity: 0, distance: 150 },
  bounds: {
    g: { min: 0.5, max: 200 },
    speed: { min: 0.05, max: 3 },
    bodyMass: { min: 0.1, max: 100 },
    eccentricity: { min: 0, max: 0.95 },
    distance: { min: 20, max: 2000 },
  },
};

const STAR_MASS = 1000;
/** Sim-seconds per real second (orbits are slow in SI-like units). */
const TIME_SCALE = 30;
const SUBSTEPS = 8;
const MAX_TRAIL = 220;

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface OrbitsState {
  simTime: number;
  params: Record<string, number>;
  thetaAccum: number;
  lastRelX: number;
  lastRelY: number;
  bodies: Body[];
}

export function createOrbits(): SimulationModule {
  const params: Record<string, number> = { ...ORBITS_META.defaults };

  let simTime = 0;
  let thetaAccum = 0; // cumulative swept angle of the relative vector (rad)
  let lastRelX = 1;
  let lastRelY = 0;
  let bodies: Body[] = [];
  let trail: number[] = []; // display-only planet trail [x0,y0,x1,y1,…]
  let dragIdx = -1;
  let W = 800;
  let H = 600;

  function placeBodies() {
    const d = params.distance;
    const e = params.eccentricity;
    const a = d / (1 + e); // semi-major axis from apoapsis placement
    const total = STAR_MASS + params.bodyMass;
    const G = params.g;
    // vis-viva at apoapsis: v² = GM·(1−e)/(a·(1+e))
    const vRel = Math.sqrt((G * total * (1 - e)) / (a * (1 + e))) * params.speed;
    bodies = [
      { x: 0, y: 0, vx: 0, vy: 0, m: STAR_MASS },
      { x: d, y: 0, vx: 0, vy: 0, m: params.bodyMass },
    ];
    // split velocities so the barycenter stays at rest
    const starShare = params.bodyMass / total;
    bodies[0].vy = -vRel * starShare;
    bodies[1].vy = vRel * (1 - starShare);
    thetaAccum = 0;
    simTime = 0;
    trail = [];
    lastRelX = d;
    lastRelY = 0;
    dragIdx = -1;
  }

  /** Pairwise inverse-square accelerations for a body in the given state. */
  function acceleration(st: Body[], i: number): [number, number] {
    const b = st[i];
    let ax = 0;
    let ay = 0;
    for (let j = 0; j < st.length; j++) {
      if (j === i) continue;
      const o = st[j];
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d2 = dx * dx + dy * dy + 4; // softening keeps the star from flinging the planet
      const inv = 1 / Math.sqrt(d2);
      const f = (params.g * o.m) / d2;
      ax += f * dx * inv;
      ay += f * dy * inv;
    }
    return [ax, ay];
  }

  /** Derivative [dx, dy, dvx, dvy] for every body in the given state. */
  function derivs(st: Body[]): Array<[number, number, number, number]> {
    return st.map((b, i) => {
      const [ax, ay] = acceleration(st, i);
      return [b.vx, b.vy, ax, ay];
    });
  }

  function rk4Step(st: Body[], h: number): Body[] {
    const k1 = derivs(st);
    const s2 = st.map((b, i) => ({
      x: b.x + (k1[i][0] * h) / 2,
      y: b.y + (k1[i][1] * h) / 2,
      vx: b.vx + (k1[i][2] * h) / 2,
      vy: b.vy + (k1[i][3] * h) / 2,
      m: b.m,
    }));
    const k2 = derivs(s2);
    const s3 = st.map((b, i) => ({
      x: b.x + (k2[i][0] * h) / 2,
      y: b.y + (k2[i][1] * h) / 2,
      vx: b.vx + (k2[i][2] * h) / 2,
      vy: b.vy + (k2[i][3] * h) / 2,
      m: b.m,
    }));
    const k3 = derivs(s3);
    const s4 = st.map((b, i) => ({
      x: b.x + k3[i][0] * h,
      y: b.y + k3[i][1] * h,
      vx: b.vx + k3[i][2] * h,
      vy: b.vy + k3[i][3] * h,
      m: b.m,
    }));
    const k4 = derivs(s4);
    return st.map((b, i) => ({
      x: b.x + ((k1[i][0] + 2 * k2[i][0] + 2 * k3[i][0] + k4[i][0]) * h) / 6,
      y: b.y + ((k1[i][1] + 2 * k2[i][1] + 2 * k3[i][1] + k4[i][1]) * h) / 6,
      vx: b.vx + ((k1[i][2] + 2 * k2[i][2] + 2 * k3[i][2] + k4[i][2]) * h) / 6,
      vy: b.vy + ((k1[i][3] + 2 * k2[i][3] + 2 * k3[i][3] + k4[i][3]) * h) / 6,
      m: b.m,
    }));
  }

  function stepSim(simDt: number) {
    const h = simDt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      const st = bodies.map((b) => ({ ...b }));
      const next = rk4Step(st, h);
      for (let i = 0; i < bodies.length; i++) {
        if (i === dragIdx) continue;
        bodies[i].x = next[i].x;
        bodies[i].y = next[i].y;
        bodies[i].vx = next[i].vx;
        bodies[i].vy = next[i].vy;
      }
    }
    // accumulate the relative polar angle for the period readout
    const relX = bodies[1].x - bodies[0].x;
    const relY = bodies[1].y - bodies[0].y;
    const cross = lastRelX * relY - lastRelY * relX;
    const dot = lastRelX * relX + lastRelY * relY;
    thetaAccum += Math.atan2(cross, dot);
    lastRelX = relX;
    lastRelY = relY;
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      placeBodies();
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
    },

    step(dt: number) {
      const h = Math.min(dt, 0.05) * TIME_SCALE;
      simTime += h;
      stepSim(h);
      const p = bodies[1];
      trail.push(p.x, p.y);
      if (trail.length > MAX_TRAIL * 2) trail.splice(0, trail.length - MAX_TRAIL * 2);
    },

    draw(g: CanvasRenderingContext2D) {
      const cx = W / 2;
      const cy = H / 2;
      const scale = Math.min(W, H) / 420;
      g.save();
      g.translate(cx, cy);
      g.scale(scale, scale);

      // star
      const star = bodies[0];
      g.fillStyle = "rgba(255,236,180,0.16)";
      g.beginPath();
      g.arc(star.x, star.y, 90, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff3d6";
      g.beginPath();
      g.arc(star.x, star.y, 9, 0, Math.PI * 2);
      g.fill();

      // ideal circular guide (for the default case)
      g.strokeStyle = "rgba(148,163,184,0.22)";
      g.lineWidth = 1;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.arc(star.x, star.y, params.distance, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);

      // planet trail
      if (trail.length > 4) {
        g.lineWidth = 1.6;
        g.strokeStyle = "rgba(34,211,238,0.45)";
        g.beginPath();
        for (let i = 0; i < trail.length; i += 2) {
          if (i === 0) g.moveTo(trail[i], trail[i + 1]);
          else g.lineTo(trail[i], trail[i + 1]);
        }
        g.stroke();
      }

      // planet
      const p = bodies[1];
      g.fillStyle = "rgba(34,211,238,0.25)";
      g.beginPath();
      g.arc(p.x, p.y, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#67e8f9";
      g.beginPath();
      g.arc(p.x, p.y, 6, 0, Math.PI * 2);
      g.fill();

      g.restore();
    },

    setParameter(key: string, value: number) {
      const b = ORBITS_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
      if (key !== "g") placeBodies(); // re-aim the orbit; g just rescales gravity
    },

    pointer(p: SimPointer) {
      const cx = W / 2;
      const cy = H / 2;
      const scale = Math.min(W, H) / 420;
      const wx = (p.x - cx) / scale;
      const wy = (p.y - cy) / scale;
      if (p.type === "down") {
        const d2 = (wx - bodies[1].x) ** 2 + (wy - bodies[1].y) ** 2;
        if (d2 < 40 * 40) dragIdx = 1;
      } else if (p.type === "move" && dragIdx === 1) {
        bodies[1].x = wx;
        bodies[1].y = wy;
        trail = [];
      } else if (p.type === "up" || p.type === "leave") {
        dragIdx = -1;
      }
    },

    reset(seed?: number) {
      void seed;
      placeBodies();
    },

    getReadouts(): Readout[] {
      const p = bodies[1];
      const speed = Math.hypot(p.vx, p.vy);
      const dist = Math.hypot(p.x - bodies[0].x, p.y - bodies[0].y);
      const period = thetaAccum > 0.5 ? (2 * Math.PI * simTime) / thetaAccum : NaN;
      return [
        { label: "Period", value: Number.isFinite(period) ? period.toFixed(1) + " s" : "…", color: "#22d3ee" },
        { label: "Speed", value: speed.toFixed(1) },
        { label: "Distance", value: dist.toFixed(0) },
      ];
    },

    /**
     * Canonical body positions for coupled 3D surfaces. Coordinates are the
     * engine's own simulation units (origin at the star / canvas centre) —
     * resolution-independent by construction.
     */
    getVisualState(): EngineVisualState {
      const at = (i: number) =>
        bodies.length > i
          ? { x: bodies[i].x, y: bodies[i].y }
          : { x: 0, y: 0 };
      return { bodies: { star: at(0), planet: at(1) } };
    },

    serializeState(): OrbitsState {
      return {
        simTime,
        params: { ...params },
        thetaAccum,
        lastRelX,
        lastRelY,
        bodies: bodies.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, m: b.m })),
      };
    },

    restoreState(state: unknown) {
      const s = state as OrbitsState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      thetaAccum = s.thetaAccum;
      lastRelX = s.lastRelX;
      lastRelY = s.lastRelY;
      bodies = s.bodies.map((b) => ({ ...b }));
      trail = [];
      dragIdx = -1;
    },

    dispose() {
      bodies = [];
      trail = [];
    },
  };
}
