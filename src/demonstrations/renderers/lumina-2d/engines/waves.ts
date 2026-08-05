/**
 * waves — 2D wave equation solved with finite differences.
 *
 * u_tt = c²·∇²u, integrated on a fixed grid with the classic
 * u[n+1] = 2u[n] − u[n−1] + k²·lap(u[n]) stencil, where k = c·dt/dx is the
 * Courant factor. The number of grid iterations per frame is chosen so the
 * effective Courant factor stays safely below the 2D stability limit
 * (k² ≤ 1/2). Two point sources oscillate at `frequency`; the wave speed is
 * c = frequency·wavelength, so `wavelength` controls the resulting pattern
 * scale directly. `phase` shifts the second source (fraction of a cycle).
 */

import type { EngineMeta, Readout, SimulationModule, SimContext, SimPointer } from "../types";

export const WAVES_META: EngineMeta = {
  id: "waves",
  title: "Waves & Interference",
  parameterKeys: ["frequency", "wavelength", "amplitude", "separation", "phase"],
  readoutKeys: ["intensity", "wavelength"],
  defaults: { frequency: 0.5, wavelength: 14, amplitude: 0.6, separation: 40, phase: 0 },
  bounds: {
    frequency: { min: 0.05, max: 4 },
    wavelength: { min: 3, max: 200 },
    amplitude: { min: 0.05, max: 2 },
    separation: { min: 4, max: 200 },
    phase: { min: -1, max: 1 },
  },
};

export const WAVE_GRID_W = 200;
export const WAVE_GRID_H = 120;

const DAMPING = 0.9995; // per-iteration dissipation
const COURANT_SAFE = 0.55; // k target per iteration (k² = 0.3 < 1/2)
const MAX_ITERS = 12;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface WavesState {
  simTime: number;
  params: Record<string, number>;
  u: number[];
  up: number[];
}

export function createWaves(): SimulationModule {
  const params: Record<string, number> = { ...WAVES_META.defaults };
  const GW = WAVE_GRID_W;
  const GH = WAVE_GRID_H;
  const N = GW * GH;

  let simTime = 0;
  let W = 800;
  let H = 600;
  let u = new Float32Array(N);
  let up = new Float32Array(N);
  let off: HTMLCanvasElement | null = null;
  let octx: CanvasRenderingContext2D | null = null;
  let img: ImageData | null = null;

  const idx = (i: number, j: number) => j * GW + i;

  function ensurePixels() {
    if (img) return;
    try {
      const c = document.createElement("canvas");
      c.width = GW;
      c.height = GH;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      off = c;
      octx = ctx;
      img = ctx.createImageData(GW, GH);
    } catch {
      off = null;
      octx = null;
      img = null;
    }
  }

  function clearGrid() {
    u = new Float32Array(N);
    up = new Float32Array(N);
  }

  function iterate(k: number) {
    const k2 = k * k;
    const damp = DAMPING;
    for (let j = 1; j < GH - 1; j++) {
      const row = j * GW;
      for (let i = 1; i < GW - 1; i++) {
        const p = row + i;
        const lap = u[p + 1] + u[p - 1] + u[p + GW] + u[p - GW] - 4 * u[p];
        up[p] = (2 * u[p] - up[p] + k2 * lap) * damp;
      }
    }
    const tmp = u;
    u = up;
    up = tmp;
    // drive the two point sources
    const cy = GH / 2;
    const half = params.separation / 2;
    const sx = Math.floor(GW * 0.28);
    const drive = params.amplitude * Math.sin(2 * Math.PI * params.frequency * simTime);
    const drive2 = params.amplitude * Math.sin(2 * Math.PI * params.frequency * simTime + 2 * Math.PI * params.phase);
    const j1 = Math.round(cy - half);
    const j2 = Math.round(cy + half);
    if (j1 > 1 && j1 < GH - 2) u[idx(sx, j1)] = drive;
    if (j2 > 1 && j2 < GH - 2) u[idx(sx, j2)] = drive2;
  }

  function renderToImage() {
    if (!img) return;
    const d = img.data;
    for (let p = 0, k = 0; k < N; k++, p += 4) {
      const v = u[k];
      const a = clamp(Math.abs(v) * 1.6, 0, 1);
      if (v >= 0) {
        d[p] = 24 * a;
        d[p + 1] = 190 * a + 14;
        d[p + 2] = 255 * a + 18;
      } else {
        d[p] = 210 * a + 18;
        d[p + 1] = 40 * a;
        d[p + 2] = 235 * a + 18;
      }
      d[p + 3] = 255;
    }
    octx!.putImageData(img, 0, 0);
  }

  return {
    init(ctx: SimContext) {
      W = ctx.width;
      H = ctx.height;
      ensurePixels();
      clearGrid();
      simTime = 0;
    },

    resize(width: number, height: number) {
      W = width;
      H = height;
      ensurePixels();
      clearGrid();
      simTime = 0;
    },

    step(dt: number) {
      const h = Math.min(dt, 0.05);
      simTime += h;
      const cWave = params.frequency * params.wavelength;
      // pick the iteration count so the Courant factor stays in the safe band
      const iters = clamp(Math.ceil((cWave * h) / COURANT_SAFE), 1, MAX_ITERS);
      const k = (cWave * h) / iters;
      for (let i = 0; i < iters; i++) iterate(k);
    },

    draw(g: CanvasRenderingContext2D) {
      ensurePixels();
      if (img) {
        renderToImage();
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(off!, 0, 0, GW, GH, 0, 0, W, H);
      } else {
        // headless fallback: coarse per-cell rects
        for (let j = 2; j < GH - 2; j += 3) {
          for (let i = 2; i < GW - 2; i += 3) {
            const v = u[idx(i, j)];
            if (Math.abs(v) < 0.02) continue;
            const a = clamp(Math.abs(v) * 1.6, 0, 1);
            g.fillStyle = v >= 0 ? `rgba(56,220,255,${a})` : `rgba(255,80,220,${a})`;
            g.fillRect(i, j, 3, 3);
          }
        }
      }
    },

    setParameter(key: string, value: number) {
      const b = WAVES_META.bounds[key];
      if (!b) return;
      params[key] = clamp(value, b.min, b.max);
    },

    pointer(p: SimPointer) {
      if (p.type !== "down" && p.type !== "move") return;
      const gi = Math.floor((p.x / Math.max(W, 1)) * GW);
      const gj = Math.floor((p.y / Math.max(H, 1)) * GH);
      const R = 3;
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const i = gi + di;
          const j = gj + dj;
          if (i < 1 || j < 1 || i >= GW - 1 || j >= GH - 1) continue;
          if (di * di + dj * dj > R * R) continue;
          u[idx(i, j)] += 1.6 * Math.exp(-(di * di + dj * dj) / 5);
        }
      }
    },

    reset() {
      clearGrid();
      simTime = 0;
    },

    getReadouts(): Readout[] {
      let sum = 0;
      for (let k = 0; k < N; k++) sum += u[k] * u[k];
      const intensity = sum / N;
      const lambda = params.wavelength;
      return [
        { label: "Intensity", value: intensity.toFixed(4), color: "#22d3ee" },
        { label: "Wavelength", value: "~" + lambda.toFixed(0) + " cells" },
      ];
    },

    serializeState(): WavesState {
      return {
        simTime,
        params: { ...params },
        u: Array.from(u),
        up: Array.from(up),
      };
    },

    restoreState(state: unknown) {
      const s = state as WavesState;
      simTime = s.simTime;
      Object.assign(params, s.params);
      u = Float32Array.from(s.u);
      up = Float32Array.from(s.up);
    },

    dispose() {
      off = null;
      octx = null;
      img = null;
    },
  };
}
