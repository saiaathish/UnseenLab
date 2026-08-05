/**
 * charges — Coulomb field of two movable point charges.
 *
 * The field is sampled on a grid and drawn as vectors; `q1`/`q2` are signed
 * charges, `separation` places them symmetrically around the canvas centre,
 * and `fieldScale` scales the drawn arrows. Charges can be dragged with the
 * pointer. Readouts: field strength and potential at the midpoint between the
 * two charges, computed from the live positions.
 */

import type {
  EngineFieldVector,
  EngineMeta,
  EngineVisualState,
  Readout,
  SimulationModule,
  SimContext,
  SimPointer,
} from "../types";

export const CHARGES_META: EngineMeta = {
  id: "charges",
  title: "Electric Fields",
  parameterKeys: ["q1", "q2", "separation", "fieldScale"],
  readoutKeys: ["fieldStrength", "potential"],
  defaults: { q1: 1, q2: -1, separation: 140, fieldScale: 1 },
  bounds: {
    q1: { min: -10, max: 10 },
    q2: { min: -10, max: 10 },
    separation: { min: 10, max: 900 },
    fieldScale: { min: 0.05, max: 20 },
  },
};

/**
 * Bounded field grid emitted by getVisualState. Odd so a cell sits exactly at
 * the canvas centre (the dipole midpoint, where the field is exactly zero).
 */
export const CHARGES_FIELD_GRID = 15;

interface Charge {
  x: number;
  y: number;
  q: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface ChargesState {
  simTime: number;
  params: Record<string, number>;
  charges: Charge[];
}

export function createCharges(): SimulationModule {
  const params: Record<string, number> = { ...CHARGES_META.defaults };
  let simTime = 0;
  let W = 800;
  let H = 600;
  let charges: Charge[] = [];
  let dragIdx = -1;

  function placeCharges() {
    const cx = W / 2;
    const cy = H / 2;
    charges = [
      { x: cx - params.separation / 2, y: cy, q: params.q1 },
      { x: cx + params.separation / 2, y: cy, q: params.q2 },
    ];
    dragIdx = -1;
  }

  /** Field at a point: Σ k·q·r̂/r², softened near the charge. */
  function fieldAt(px: number, py: number): { ex: number; ey: number } {
    let ex = 0;
    let ey = 0;
    for (const c of charges) {
      const dx = px - c.x;
      const dy = py - c.y;
      const d2 = dx * dx + dy * dy + 60;
      const inv = 1 / Math.sqrt(d2);
      const e = (c.q * params.fieldScale) / d2;
      ex += e * dx * inv;
      ey += e * dy * inv;
    }
    return { ex, ey };
  }

  /** Potential at a point: Σ k·q/r (with the same softening). */
  function potentialAt(px: number, py: number): number {
    let v = 0;
    for (const c of charges) {
      const d = Math.hypot(px - c.x, py - c.y);
      v += c.q / (d + 7);
    }
    return v;
  }

  function midpoint(): { x: number; y: number } {
    return { x: (charges[0].x + charges[1].x) / 2, y: (charges[0].y + charges[1].y) / 2 };
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      placeCharges();
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
      placeCharges();
    },

    step(dt: number) {
      simTime += Math.min(dt, 0.05);
    },

    draw(g: CanvasRenderingContext2D) {
      // vector field grid
      const step = Math.max(22, Math.min(W, H) / 16);
      for (let gx = step / 2; gx < W; gx += step) {
        for (let gy = step / 2; gy < H; gy += step) {
          const { ex, ey } = fieldAt(gx, gy);
          const mag = Math.hypot(ex, ey);
          if (mag < 1e-4) continue;
          const len = clamp(Math.log2(1 + mag * 40) * 4, 4, step * 0.62);
          const nx = ex / mag;
          const ny = ey / mag;
          const x2 = gx + nx * len;
          const y2 = gy + ny * len;
          g.strokeStyle = "rgba(56,189,248,0.55)";
          g.lineWidth = 1.3;
          g.beginPath();
          g.moveTo(gx - nx * len * 0.35, gy - ny * len * 0.35);
          g.lineTo(x2, y2);
          g.stroke();
          const a = Math.atan2(ny, nx);
          g.beginPath();
          g.moveTo(x2, y2);
          g.lineTo(x2 - Math.cos(a - 0.42) * 4, y2 - Math.sin(a - 0.42) * 4);
          g.lineTo(x2 - Math.cos(a + 0.42) * 4, y2 - Math.sin(a + 0.42) * 4);
          g.closePath();
          g.fillStyle = "rgba(56,189,248,0.55)";
          g.fill();
        }
      }

      // charges
      for (const c of charges) {
        const pos = c.q >= 0;
        const col = pos ? "239,68,68" : "59,130,246";
        g.fillStyle = `rgba(${col},0.25)`;
        g.beginPath();
        g.arc(c.x, c.y, 24, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgb(${col})`;
        g.beginPath();
        g.arc(c.x, c.y, 13, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#fff";
        g.font = "bold 15px Inter, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(pos ? "+" : "−", c.x, c.y);
      }
      g.textAlign = "start";
      g.textBaseline = "alphabetic";
    },

    setParameter(key: string, value: number) {
      const b = CHARGES_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
      if (key === "separation" || key === "q1" || key === "q2") placeCharges();
    },

    pointer(p: SimPointer) {
      if (p.type === "down") {
        let best = -1;
        let bd = 34 * 34;
        for (let i = 0; i < charges.length; i++) {
          const d = (charges[i].x - p.x) ** 2 + (charges[i].y - p.y) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        dragIdx = best;
      } else if (p.type === "move" && dragIdx >= 0) {
        charges[dragIdx].x = clamp(p.x, 12, W - 12);
        charges[dragIdx].y = clamp(p.y, 12, H - 12);
      } else if (p.type === "up" || p.type === "leave") {
        dragIdx = -1;
      }
    },

    reset() {
      placeCharges();
      simTime = 0;
    },

    getReadouts(): Readout[] {
      const mid = midpoint();
      const { ex, ey } = fieldAt(mid.x, mid.y);
      return [
        { label: "Field strength", value: Math.hypot(ex, ey).toFixed(3), color: "#38bdf8" },
        { label: "Potential", value: potentialAt(mid.x, mid.y).toFixed(3) },
      ];
    },

    /**
     * Canonical state for coupled 3D surfaces: centered canvas px charge
     * positions (resolution-independent — the separation parameter defines
     * them, not the canvas size) plus a bounded field grid sampled from the
     * same Coulomb sum the readouts use.
     */
    getVisualState(): EngineVisualState {
      const w2 = W / 2;
      const h2 = H / 2;
      // Grid half-extent keeps the charges at ~25% of the domain for any
      // separation, so the 3D arrows around the charges stay well sampled.
      const span = Math.max(2 * params.separation, 260);
      const N = CHARGES_FIELD_GRID;
      const vectors: EngineFieldVector[] = [];
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = ((i + 0.5) / N) * 2 * span - span;
          const y = ((j + 0.5) / N) * 2 * span - span;
          const { ex, ey } = fieldAt(w2 + x, h2 + y);
          vectors.push({ x, y, ex, ey, magnitude: Math.hypot(ex, ey) });
        }
      }
      return {
        bodies: {
          charge1: { x: charges[0].x - w2, y: charges[0].y - h2 },
          charge2: { x: charges[1].x - w2, y: charges[1].y - h2 },
        },
        field: { vectors, width: N, height: N, span },
      };
    },

    serializeState(): ChargesState {
      return {
        simTime,
        params: { ...params },
        charges: charges.map((c) => ({ ...c })),
      };
    },

    restoreState(state: unknown) {
      const s = state as ChargesState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      charges = s.charges.map((c) => ({ ...c }));
      dragIdx = -1;
    },

    dispose() {
      charges = [];
    },
  };
}
